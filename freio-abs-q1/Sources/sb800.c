/*
 * sb800.c - MC34SB0800 (watchdog + registradores + high-side Q1) no MC9S12XEP100
 * Baseado no driver da NXP (vc.c / vc_sb0800.c):
 *   - cada escrita = frame + frame dummy 0xFFFF (a resposta vem no frame seguinte)
 *   - MR = VC_GetMonRes(LFSR); o proximo LFSR e o AR devolvido pelo chip (bits 7:0)
 *   - msg 18 (MR) a cada ~40 ms; ERR_CNT = bits 10:8 da resposta
 *
 * Alteracoes desta versao (referencias ao datasheet MC34SB0800):
 *   1. Duas escritas da msg 0 apos o reset externo (Tabela 21, p. 31-32, e
 *      "Sequence examples to run the watchdog", p. 30): a 1a limpa RST_ext,
 *      a 2a carrega o SEED.
 *   2. Bits xxx_clr_flt da msg 6 voltam a 0 depois de limpar (Tabela 9, nota 7).
 *   3. HD_lkg (bit 11 da resposta da msg 18) agora entra no status e e tratado
 *      por uma maquina de estados: hd_on=0 -> limpa HD_lkg/HD_oc -> hd_on=1
 *      (nova borda) -> confere. Tabela 9: "Load leakage: ignore hd_on rise-edge
 *      command + SPI fault flag (HD_lkg); restart: write 1 to HD_clr_flt and then
 *      turn on by SPI command (hd_on)". Repete a cada SB800_HD_RETRY_MS enquanto
 *      o pedido estiver ativo; quem aprova ou reprova continua sendo o CI.
 *   4. HD_oc (sobrecorrente) tem no maximo SB800_HD_OC_MAX tentativas.
 */
#include <hidef.h>
#include "sb800.h"
#include "delay.h"
#include "spi.h"

#define SB0800_LOG_N   64

#ifdef SB800_DEBUG_UART
extern void uart_putc(uint8_t c);
#endif

unsigned int  sb0800_tx_log[SB0800_LOG_N];
unsigned int  sb0800_rx_log[SB0800_LOG_N];
unsigned char sb0800_log_idx = 0;

static uint8_t      sb_lfsr = 0;          /* ultimo AR (LFSR) informado pelo chip */
static uint8_t      sb_seed = 0;
static uint8_t      hd_req  = 0;          /* aplicacao quer Q1 ligado             */
static uint16_t     hd_wait_ticks = 0;    /* ticks de servico ate nova tentativa  */

volatile unsigned int sb800_resp = 0;
volatile uint8_t      sb800_mr = 0, sb800_ar = 0, sb800_err_cnt = 0, sb800_status = 0;
volatile uint8_t      sb800_resets = 0, sb800_rst_timeout = 0;
volatile unsigned int sb800_m0r = 0, sb800_m0r2 = 0, sb800_m5r = 0;
volatile unsigned int sb800_msg5 = 0;
volatile uint8_t      sb800_hd_state = HD_ST_OFF;
volatile uint8_t      sb800_hd_lkg = 0, sb800_hd_oc = 0;
volatile unsigned int sb800_hd_tries = 0, sb800_hd_lkg_fails = 0;
volatile uint8_t      sb800_hd_oc_fails = 0;
volatile unsigned int sb800_hd_resp_check = 0;

/* ------------------------------------------------------------------ SPI --- */
unsigned int monta_msg_800(unsigned int id, unsigned int dados) {
    unsigned int w = ((id & 0x1F) << 10) | (dados & 0x03FF);
    w |= ((unsigned int)calcularParidade(w) << 15);
    return w;
}

unsigned int spi_octal(unsigned int message) {
    unsigned int resp;

    SB0800_SS_PIN = 0;
    delay_us(10);
    resp = SPI0_WriteRead_16bits(message);
    delay_us(10);
    SB0800_SS_PIN = 1;
    delay_us(10);

    if (sb0800_log_idx < SB0800_LOG_N) {
        sb0800_tx_log[sb0800_log_idx] = message;
        sb0800_rx_log[sb0800_log_idx] = resp;
        sb0800_log_idx++;
    }
    return resp;
}

/* Escreve uma mensagem e devolve a RESPOSTA DELA (frame dummy, como a NXP). */
unsigned int sb800_write(unsigned int id, unsigned int dados) {
    (void)spi_octal(monta_msg_800(id, dados));
    return spi_octal(0xFFFFu);
}

/* ------------------------------------------------------------- watchdog --- */
/* ALU do lado do MCU (identica a do driver NXP: uint16_t, equivale a ~lfsr) */
uint8_t VC_GetMonRes(uint8_t lfsrOut)
{
    uint16_t mr = lfsrOut;
    mr *= 4U;
    mr += 6U;
    mr -= 4U;
    mr = ~mr;
    mr /= 4U;
    return (uint8_t)mr;
}

/* LFSR da Figura 14 (FF1 = bit0 ... FF8 = bit7, entrada = XNOR(FF4,FF5,FF6,FF8)) */
uint8_t sb800_lfsr_next(uint8_t s)
{
    uint8_t fb = (uint8_t)(((s >> 3) ^ (s >> 4) ^ (s >> 5) ^ (s >> 7)) & 1u);
    fb ^= 1u;
    return (uint8_t)((s << 1) | fb);
}

/* Envia um MR (msg 18) e le AR/ERR_CNT/HD_lkg do chip. Retorna bits SB800_ST_*. */
uint8_t sb800_feed_wd(void)
{
    unsigned int resp;
    uint8_t st = 0;
    uint8_t expected;

    sb800_mr = VC_GetMonRes(sb_lfsr);
    (void)spi_octal(monta_msg_800(18, sb800_mr));
    resp = spi_octal(0xFFFFu);                    /* resposta da msg 18 */

    sb800_resp    = resp;
    sb800_ar      = (uint8_t)(resp & 0x00FFu);
    sb800_err_cnt = (uint8_t)((resp >> 8) & 0x07u);
    expected      = sb800_lfsr_next(sb_lfsr);

    if (resp & RESP_FMSG)                                        st |= SB800_ST_FMSG;
    if ((unsigned int)calcularParidade(resp & 0x7FFFu) != (resp >> 15)) st |= SB800_ST_PARITY;
    if (sb800_err_cnt != 0)                                      st |= SB800_ST_ERRCNT;
    if (!SB0800_RST_READ())                                      st |= SB800_ST_RSTB;
    if (sb800_ar != expected)                                    st |= SB800_ST_LFSR;

    /* HD_lkg so e confiavel se a resposta nao veio corrompida. */
    if (!(st & SB800_ST_PARITY)) {
        sb800_hd_lkg = (resp & M18R_HD_LKG) ? 1u : 0u;
    }
    if (sb800_hd_lkg)                                            st |= SB800_ST_HDLKG;
    if (sb800_hd_oc)                                             st |= SB800_ST_HDOC;
    if (sb800_hd_state == HD_ST_ON)                              st |= SB800_ST_HDOK;

    /* Se a resposta veio corrompida, segue o LFSR previsto em vez do AR lido. */
    sb_lfsr = (st & SB800_ST_PARITY) ? expected : sb800_ar;
    sb800_status = st;

#ifdef SB800_DEBUG_UART
    uart_putc(sb800_mr);
    uart_putc((uint8_t)(resp >> 8));
    uart_putc((uint8_t)resp);
    uart_putc(st);
#endif
    return st;
}

/* ---------------------------------------------------------------- reset --- */
void SB0800_Reset_Routine(void) {
    unsigned int t;

    SB0800_SS_PIN = 1;
    SB0800_RST_DRIVE_LOW();          /* reset externo */
    delay_ms(5);
    SB0800_RST_RELEASE();            /* solta: o chip passa a controlar o RSTB */

    for (t = 0; t < 100u; t++) {     /* espera o RSTB subir (comeca a janela do WD) */
        if (SB0800_RST_READ()) break;
        delay_ms(1);
    }
    sb800_rst_timeout = (t >= 100u) ? 1u : 0u;
}

/* Limpa flags com o bit clr em 1 e devolve o bit a 0 (nota 7 da Tabela 9). */
void sb800_clear_faults(unsigned int clr_bits)
{
    (void)sb800_write(6, clr_bits & MSG6_CLR_ALL);
    (void)sb800_write(6, 0x0000u);
}

/* ------------------------------------------------------------------ init --- */
/* Registradores iguais aos de VC_GetRegisterConfig (configuracao padrao NXP).
 * Retorna o LFSR atual (AR do chip) para compatibilidade com o main antigo.
 * Nao altera o pedido do high-side (hd_req): se estava pedido, sera religado
 * pela maquina de estados, com nova borda e novo teste de fuga.              */
uint8_t init_sb800(uint8_t seed) {
    uint8_t id;

    if (seed == 0xFFu) seed = 0x00u;          /* 0xFF nao pode ser SEED */
    sb_seed = seed;
    sb_lfsr = seed;

    SB0800_Reset_Routine();

    /* Sem pausas: o primeiro MR precisa chegar antes do fim da janela do WD. */
    /* Msg 0 duas vezes: a 1a limpa RST_ext (o SEED fica bloqueado enquanto  */
    /* RST_ext = 1), a 2a carrega o SEED. Tabela 21 / p. 30.                  */
    sb800_m0r  = sb800_write(0, (unsigned int)seed << 2);  /* resposta = flags de reset */
    sb800_m0r2 = sb800_write(0, (unsigned int)seed << 2);  /* deve vir com RST_ext = 0  */
    (void)sb800_write(1, 0x0002u);            /* bit 1 fixo em 1; P=1,0; I=0,125; lsd_sink_dis=0 */
    (void)sb800_write(3, 0x0004u);            /* Adin2_en = 1 (como o VC_Init da NXP) */
    sb800_msg5 = 0u;                          /* tudo desligado */
    sb800_m5r  = sb800_write(5, sb800_msg5);
    (void)sb800_write(7, 0x0004u);            /* LSD1-4 em CR, feedback = saida */
    (void)sb800_write(9, 0x0000u);            /* PWM 3,9 kHz */
    for (id = 10u; id <= 17u; id++) {
        (void)sb800_write(id, 0x0000u);       /* saidas dos LSD em zero */
    }
    (void)sb800_feed_wd();                    /* msg 18: MR1 = f(SEED) */
    sb800_clear_faults(MSG6_CLR_ALL);         /* limpa falhas e devolve clr a 0 */
    sb800_hd_oc  = 0u;
    (void)sb800_feed_wd();

    sb800_hd_state = hd_req ? HD_ST_PREP : HD_ST_OFF;
    return sb_lfsr;
}

/* ----------------------------------------------------- high-side (Q1) ----- */
/* Pedido da aplicacao. Ligar = gera a sequencia; a confirmacao vem depois,
 * em sb800_hd_is_on(). IMPORTANTE: o teste de fuga injeta corrente em HD_S
 * (= no J5/SB0800_HSD). Com valvulas conectadas, todos os LSD do Octal E do
 * Quad precisam estar desligados durante o teste (Figura 5: as bobinas ficam
 * entre HD_S e LSDx); caso contrario o CI ve a valvula como "fuga".         */
void sb800_hd_request(unsigned char ligar)
{
    if (ligar) {
        hd_req = 1u;
        if ((sb800_hd_state == HD_ST_OFF) || (sb800_hd_state == HD_ST_LOCKED)) {
            sb800_hd_oc_fails = 0u;
            sb800_hd_state = HD_ST_PREP;      /* executa no proximo sb800_service */
        }
    } else {
        hd_req = 0u;
        sb800_msg5 &= (unsigned int)~MSG5_HD_ON;
        sb800_m5r = sb800_write(5, sb800_msg5);
        sb800_hd_state = HD_ST_OFF;
    }
}

void SB0800_HighSide_Enable(unsigned char ligar) {
    sb800_hd_request(ligar);
}

uint8_t sb800_hd_is_on(void)
{
    return (uint8_t)(sb800_hd_state == HD_ST_ON);
}

/* Le HD_oc reescrevendo a msg 5 com o MESMO valor (nao gera borda). */
static void hd_read_oc(void)
{
    sb800_m5r = sb800_write(5, sb800_msg5);
    if (!(sb800_m5r & RESP_FMSG)) {
        sb800_hd_oc = (sb800_m5r & M5R_HD_OC) ? 1u : 0u;
    }
}

static void hd_fail(void)
{
    if (sb800_hd_oc) {
        if (sb800_hd_oc_fails < 255u) sb800_hd_oc_fails++;
        if (sb800_hd_oc_fails >= SB800_HD_OC_MAX) {
            sb800_hd_state = HD_ST_LOCKED;    /* nao insiste em curto real */
            return;
        }
    } else {
        if (sb800_hd_lkg_fails < 0xFFFFu) sb800_hd_lkg_fails++;
    }
    hd_wait_ticks = (uint16_t)(SB800_HD_RETRY_MS / SB800_WD_PERIOD_MS);
    sb800_hd_state = HD_ST_WAIT;
}

/* Chamado a cada tick de servico (logo depois do MR). Um passo por tick:
 * entre a borda e a conferencia passam ~40 ms >> tHD_LC + tHD_ON (1,4 ms). */
static void hd_task(void)
{
    uint8_t id;

    switch (sb800_hd_state) {
    case HD_ST_PREP:
        sb800_msg5 &= (unsigned int)~MSG5_HD_ON;  /* garante hd_on = 0 (borda depois) */
        sb800_m5r = sb800_write(5, sb800_msg5);
        for (id = 10u; id <= 17u; id++) {         /* LSD do Octal em zero durante o teste */
            (void)sb800_write(id, 0x0000u);       /* (os do Quad sao responsabilidade do main) */
        }
        sb800_clear_faults(MSG6_HD_CLR);          /* HD_clr_flt = 1 e depois 0 */
        sb800_hd_oc  = 0u;
        sb800_hd_state = HD_ST_EDGE;
        break;

    case HD_ST_EDGE:
        sb800_msg5 |= MSG5_HD_ON;                 /* borda de subida -> teste de fuga */
        sb800_m5r = sb800_write(5, sb800_msg5);
        if (sb800_hd_tries < 0xFFFFu) sb800_hd_tries++;
        sb800_hd_state = HD_ST_CHECK;
        break;

    case HD_ST_CHECK:
        sb800_hd_resp_check = sb800_resp;         /* msg 18 deste tick */
        hd_read_oc();
        if (sb800_hd_lkg || sb800_hd_oc) {
            hd_fail();
        } else {
            sb800_hd_state = HD_ST_ON;
        }
        break;

    case HD_ST_ON:
        hd_read_oc();
        if (sb800_hd_lkg || sb800_hd_oc) {
            hd_fail();
        }
        break;

    case HD_ST_WAIT:
        if (hd_wait_ticks > 0u) hd_wait_ticks--;
        if (hd_wait_ticks == 0u) sb800_hd_state = HD_ST_PREP;
        break;

    default:                                       /* OFF / LOCKED */
        break;
    }
}

/* --------------------------------------------------------- recuperacao ---- */
static void sb800_recover(void)
{
    if (sb800_resets < 255u) sb800_resets++;
    (void)init_sb800(sb_seed);                /* reset + registradores + WD; HD -> PREP */
}

/* Um ciclo de servico: MR + monitoramento + HD + recuperacao se o chip caiu. */
uint8_t sb800_service(void)
{
    uint8_t st = sb800_feed_wd();

    if ((st & SB800_ST_RSTB) || (sb800_err_cnt >= SB800_ERR_RECOVER)) {
        sb800_recover();
        st |= SB800_ST_RSTB;
    } else {
        hd_task();
    }
    return st;
}

/* Substitui delay_ms nos trechos longos: espera total_ms alimentando o WD. */
uint8_t sb800_wait_ms(uint16_t total_ms)
{
    uint16_t step;
    uint8_t  st = 0;

    while (total_ms > 0u) {
        st |= sb800_service();
        step = (total_ms > 50u) ? SB800_WD_PERIOD_MS : total_ms; /* resto nunca < 10 ms */
        delay_ms(step);
        total_ms -= step;
        _FEED_COP();
    }
    return st;
}

/* ------------------------------------------------------------- saidas ------ */
void SaiOCTAL(int estado, float correnteAmperes) {
    unsigned int valorDigital;
    unsigned int msgID;

    switch (estado) {
        case OCTAL1: msgID = 10; break;
        case OCTAL2: msgID = 11; break;
        case OCTAL3: msgID = 12; break;
        case OCTAL4: msgID = 13; break;
        default:     return;
    }

    if (correnteAmperes < 0.0f) {
        correnteAmperes = 0.0f;
    }
    valorDigital = (unsigned int)(correnteAmperes * 454.0f);
    if (valorDigital > 0x03FF) {
        valorDigital = 0x03FF;
    }

    (void)spi_octal(monta_msg_800(msgID, valorDigital));
}
