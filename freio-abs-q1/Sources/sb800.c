/*
 * sb800.c - MC34SB0800 (watchdog + registradores) no MC9S12XEP100
 * Baseado no driver da NXP (vc.c / vc_sb0800.c):
 *   - cada escrita = frame + frame dummy 0xFFFF (a resposta vem no frame seguinte)
 *   - MR = VC_GetMonRes(LFSR); o proximo LFSR e o AR devolvido pelo chip (bits 7:0)
 *   - msg 18 (MR) a cada ~40 ms; ERR_CNT = bits 10:8 da resposta
 */
#include <hidef.h>
#include "sb800.h"
#include "delay.h"
#include "spi.h"

#define MSG6_CLR_ALL   ((1u << 9) | (1u << 5) | (1u << 2) | (1u << 1) | 1u) /* 0x0227 */
#define SB800_M5_HD_ON 0x0010u            /* VC_M5W_HS_DRV_ON: fail-safe (HD_G) */
#define SB0800_LOG_N   64

#ifdef SB800_DEBUG_UART
extern void uart_putc(uint8_t c);
#endif

unsigned int  sb0800_tx_log[SB0800_LOG_N];
unsigned int  sb0800_rx_log[SB0800_LOG_N];
unsigned char sb0800_log_idx = 0;

static unsigned int msg5_estado = 0;
static uint8_t      sb_lfsr = 0;          /* ultimo AR (LFSR) informado pelo chip */
static uint8_t      sb_seed = 0;

volatile unsigned int sb800_resp = 0;
volatile uint8_t      sb800_mr = 0, sb800_ar = 0, sb800_err_cnt = 0, sb800_status = 0;
volatile uint8_t      sb800_resets = 0, sb800_rst_timeout = 0;
volatile unsigned int sb800_m0r = 0, sb800_m5r = 0;

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

/* Envia um MR (msg 18) e le o AR/ERR_CNT do chip. Retorna bits SB800_ST_*. */
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

    if (resp & 0x4000u)                                          st |= SB800_ST_FMSG;
    if ((unsigned int)calcularParidade(resp & 0x7FFFu) != (resp >> 15)) st |= SB800_ST_PARITY;
    if (sb800_err_cnt != 0)                                      st |= SB800_ST_ERRCNT;
    if (!SB0800_RST_READ())                                      st |= SB800_ST_RSTB;
    if (sb800_ar != expected)                                    st |= SB800_ST_LFSR;

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

/* ------------------------------------------------------------------ init --- */
/* Registradores iguais aos de VC_GetRegisterConfig (configuracao padrao NXP).
 * Retorna o LFSR atual (AR do chip) para compatibilidade com o main antigo. */
uint8_t init_sb800(uint8_t seed) {
    uint8_t id;

    if (seed == 0xFFu) seed = 0x00u;          /* 0xFF nao pode ser SEED */
    sb_seed = seed;
    sb_lfsr = seed;

    SB0800_Reset_Routine();

    /* Sem pausas: o primeiro MR precisa chegar antes do fim da janela do WD. */
    sb800_m0r = sb800_write(0, (unsigned int)seed << 2);  /* SEED (resposta = flags de reset) */
    (void)sb800_write(1, 0x0002u);            /* load dump desabilitado (bit 1), I=0,125, P=1,0 */
    (void)sb800_write(3, 0x0004u);            /* LD controlado por SPI (ADIN2_EN) */
    msg5_estado = 0u;                         /* tudo desligado; HD liga em SB0800_HighSide_Enable */
    (void)sb800_write(5, msg5_estado);
    (void)sb800_write(7, 0x0004u);            /* LSD1-4 em CR, feedback = saida */
    (void)sb800_write(9, 0x0000u);            /* PWM 3,9 kHz */
    for (id = 10u; id <= 17u; id++) {
        (void)sb800_write(id, 0x0000u);       /* saidas dos LSD em zero */
    }
    (void)sb800_feed_wd();                    /* msg 18: MR1 = f(SEED) */
    (void)sb800_write(6, MSG6_CLR_ALL);       /* limpa falhas (como o VC_Init) */
    (void)sb800_feed_wd();

    return sb_lfsr;
}

void SB0800_HighSide_Enable(unsigned char ligar) {
    if (ligar) {
        msg5_estado |= SB800_M5_HD_ON;
    } else {
        msg5_estado &= (unsigned int)~SB800_M5_HD_ON;
    }
    sb800_m5r = sb800_write(5, msg5_estado);  /* resposta = HD_OC / PD_OC */
}

/* --------------------------------------------------------- recuperacao ---- */
static void sb800_recover(void)
{
    unsigned int m5 = msg5_estado;

    if (sb800_resets < 255u) sb800_resets++;
    (void)init_sb800(sb_seed);                /* reset + registradores + WD */
    msg5_estado = m5;
    (void)sb800_write(5, msg5_estado);        /* religa o HD se estava ligado */
}

/* Um ciclo de servico: MR + monitoramento + recuperacao se o chip caiu. */
uint8_t sb800_service(void)
{
    uint8_t st = sb800_feed_wd();

    if ((st & SB800_ST_RSTB) || (sb800_err_cnt >= SB800_ERR_RECOVER)) {
        sb800_recover();
        st |= SB800_ST_RSTB;
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