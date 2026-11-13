#ifndef __SB800_H_
#define __SB800_H_

#include "config.h"
#include "delay.h"
#include "spi.h"

/* --- Pinos ---------------------------------------------------------------- */
#define SB0800_RESET_PIN    PORTB_PB0
#define SB0800_SS_PIN       PORTB_PB2
/* Bit DDR do pino do RSTB: com isso o RSTB vira ENTRADA depois do reset */
#define SB0800_RESET_DDR    DDRB_DDRB0

#define OCTAL1                1
#define OCTAL2                2
#define OCTAL3                3
#define OCTAL4                4

/* Msg 5 (Tabela 33 do datasheet) */
#define MSG5_PD_ON   0x0020u   /* bit 5: bomba          */
#define MSG5_HD_ON   0x0010u   /* bit 4: high-side (Q1) */
#define MSG5_HS_ON   0x0002u   /* bit 1: HS_on          */
#define MSG5_LD_ON   0x0001u   /* bit 0: low-side       */

/* Msg 6 (Tabela 35): bits de limpeza. Nota 7 da Tabela 9: depois de escrever 1
 * o bit TEM que voltar a 0 ("write xxx_clr_flt to default value 0"). */
#define MSG6_HS_CLR  0x0200u
#define MSG6_HD_CLR  0x0020u
#define MSG6_LD_CLR  0x0004u
#define MSG6_PD_CLR  0x0002u
#define MSG6_LSD_CLR 0x0001u
#define MSG6_CLR_ALL (MSG6_HS_CLR | MSG6_HD_CLR | MSG6_LD_CLR | MSG6_PD_CLR | MSG6_LSD_CLR)

/* Bits das respostas */
#define RESP_FMSG      0x4000u   /* qualquer resposta: frame anterior com paridade errada */
#define M5R_PD_OC      0x2000u   /* resposta msg 5, bit 13 */
#define M5R_HD_OC      0x1000u   /* resposta msg 5, bit 12 */
#define M18R_HD_LKG    0x0800u   /* resposta msg 18, bit 11 */
#define M0R_RST_EXT    0x0020u   /* resposta msg 0, bit 5  */
#define M0R_FLAGS      0x03F8u   /* dosv_uv..RST_wd (bits 9..3) */
#define M3R_VPWR_OV    0x0020u
#define M3R_VPWR_UV    0x0008u
#define M3R_FGND       0x0004u
#define M3R_OTW        0x0002u

/* --- Controle do pino RSTB ------------------------------------------------ */
#ifdef SB0800_RESET_DDR
#define SB0800_RST_DRIVE_LOW()  do { SB0800_RESET_PIN = 0; SB0800_RESET_DDR = 1; } while (0)
#define SB0800_RST_RELEASE()    do { SB0800_RESET_DDR = 0; } while (0)
#else
#define SB0800_RST_DRIVE_LOW()  do { SB0800_RESET_PIN = 0; } while (0)
#define SB0800_RST_RELEASE()    do { SB0800_RESET_PIN = 1; } while (0)
#endif
#define SB0800_RST_READ()       (SB0800_RESET_PIN)

/* --- Parametros ----------------------------------------------------------- */
#define SB800_WD_PERIOD_MS   40u   /* intervalo entre MRs (a NXP usa 50 ms; limite 60 ms) */
#define SB800_ERR_RECOVER    2u    /* ERR_CNT a partir do qual o chip e reinicializado   */
#define SB800_DEBUG_UART           /* envia 4 bytes por MR: mr, resp_hi, resp_lo, status  */

/* High-side (Q1): nova tentativa apos HD_lkg. O teste de fuga do proprio CI
 * continua decidindo; o firmware so gera uma nova borda de subida de hd_on.
 * Em HD_lkg o gate NAO foi ligado (Tabela 9), por isso repetir e seguro.     */
#define SB800_HD_RETRY_MS    500u  /* intervalo entre tentativas apos HD_lkg            */
#define SB800_HD_OC_MAX      3u    /* sobrecorrente: desiste apos N tentativas          */
/* 1 = desliga a corrente de "sink" de open-load dos LSD do Octal (msg 1 bit 2)
 * durante o teste de fuga. So para investigar HD_lkg que aparece APENAS com
 * valvulas conectadas (o valor dessa corrente nao consta no datasheet).
 * Padrao 0 = comportamento da NXP.                                          */
#define SB800_HD_TEST_SINK_DIS 0
#define SB800_MSG1_CFG       0x0002u  /* bit 1 fixo em 1; P=1,0; I=0,125; sink on */

/* --- Bits de status devolvidos por sb800_feed_wd / sb800_service ---------- */
#define SB800_ST_FMSG    0x01u     /* chip recebeu frame com paridade errada     */
#define SB800_ST_PARITY  0x02u     /* resposta com paridade errada               */
#define SB800_ST_ERRCNT  0x04u     /* ERR_CNT != 0 (MR errado)                   */
#define SB800_ST_RSTB    0x08u     /* RSTB baixo (chip em reset)                 */
#define SB800_ST_LFSR    0x10u     /* AR diferente do LFSR previsto (modelo)     */
#define SB800_ST_HDLKG   0x20u     /* HD_lkg = 1 na resposta da msg 18 (NOVO)    */
#define SB800_ST_HDOC    0x40u     /* HD_oc  = 1 na ultima resposta da msg 5     */
#define SB800_ST_HDOK    0x80u     /* Q1 pedido e aceito pelo CI (sem lkg/oc)    */

/* --- Estado do gerenciador do high-side ------------------------------------ */
#define HD_ST_OFF      0u   /* nao solicitado                                     */
#define HD_ST_PREP     1u   /* hd_on=0 + limpa HD_oc/HD_lkg (clr=1 e depois clr=0) */
#define HD_ST_EDGE     2u   /* hd_on=1: borda de subida -> CI faz teste de fuga    */
#define HD_ST_CHECK    3u   /* confere HD_lkg / HD_oc depois de tHD_LC + tHD_ON    */
#define HD_ST_ON       4u   /* aceito; monitorando                                 */
#define HD_ST_WAIT     5u   /* reprovado (HD_lkg); aguardando nova tentativa       */
#define HD_ST_LOCKED   6u   /* sobrecorrente repetida: bloqueado ate novo pedido   */

/* --- Variaveis de diagnostico (ver no debugger) --------------------------- */
extern volatile unsigned int  sb800_resp;
extern volatile uint8_t       sb800_mr, sb800_ar, sb800_err_cnt, sb800_status;
extern volatile uint8_t       sb800_resets, sb800_rst_timeout;
extern volatile unsigned int  sb800_m0r, sb800_m0r2, sb800_m5r;
extern volatile unsigned int  sb800_msg5;          /* valor escrito na msg 5           */
extern volatile uint8_t       sb800_hd_state;      /* HD_ST_*                          */
extern volatile uint8_t       sb800_hd_lkg;        /* ultimo HD_lkg lido (0/1)         */
extern volatile uint8_t       sb800_hd_oc;         /* ultimo HD_oc lido (0/1)          */
extern volatile unsigned int  sb800_hd_tries;      /* bordas hd_on geradas             */
extern volatile unsigned int  sb800_hd_lkg_fails;  /* tentativas reprovadas por HD_lkg */
extern volatile uint8_t       sb800_hd_oc_fails;   /* tentativas reprovadas por HD_oc  */
extern volatile unsigned int  sb800_hd_resp_check; /* msg 18 lida no HD_ST_CHECK       */

/* --- Funcoes --------------------------------------------------------------- */
void         SB0800_Reset_Routine(void);
unsigned int monta_msg_800(unsigned int id, unsigned int dados);
unsigned int spi_octal(unsigned int message);
uint8_t      VC_GetMonRes(uint8_t lfsrOut);
uint8_t      init_sb800(uint8_t lfsr_seed);
void         SB0800_HighSide_Enable(unsigned char ligar);  /* = sb800_hd_request */
void         SaiOCTAL(int estado, float correnteAmperes);

unsigned int sb800_write(unsigned int id, unsigned int dados);
uint8_t      sb800_lfsr_next(uint8_t s);
uint8_t      sb800_feed_wd(void);
uint8_t      sb800_service(void);
uint8_t      sb800_wait_ms(uint16_t total_ms);

/* Chamado imediatamente antes de cada borda de hd_on (estado PREP). O main
 * aponta para uma funcao que zera as saidas do QUAD (o sb800.c ja zera as do
 * Octal). Sem isso, uma valvula acionada pelo Quad reprova o teste de fuga.  */
extern void (*sb800_hd_pre_test_hook)(void);

void         sb800_hd_request(unsigned char ligar);
uint8_t      sb800_hd_is_on(void);
void         sb800_clear_faults(unsigned int clr_bits);

#endif
