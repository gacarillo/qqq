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

#define MSG5_PD_ON   0x0020u   /* bit 5: bomba          */
#define MSG5_HD_ON   0x0010u   /* bit 4: high-side (Q1) */
#define MSG5_HS_ON   0x0002u   /* bit 1: HS_on          */
#define MSG5_LD_ON   0x0001u   /* bit 0: low-side       */

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
#define SB800_DEBUG_UART      /* envia 4 bytes por MR: mr, resp_hi, resp_lo, status  */

/* --- Bits de status devolvidos por sb800_feed_wd / sb800_service ---------- */
#define SB800_ST_FMSG    0x01u     /* chip recebeu frame com paridade errada     */
#define SB800_ST_PARITY  0x02u     /* resposta com paridade errada               */
#define SB800_ST_ERRCNT  0x04u     /* ERR_CNT != 0 (MR errado)                   */
#define SB800_ST_RSTB    0x08u     /* RSTB baixo (chip em reset)                 */
#define SB800_ST_LFSR    0x10u     /* AR diferente do LFSR previsto (modelo)     */

/* --- Variaveis de diagnostico (ver no debugger) --------------------------- */
extern volatile unsigned int  sb800_resp;
extern volatile uint8_t       sb800_mr, sb800_ar, sb800_err_cnt, sb800_status;
extern volatile uint8_t       sb800_resets, sb800_rst_timeout;
extern volatile unsigned int  sb800_m0r, sb800_m5r;

/* --- Funcoes --------------------------------------------------------------- */
void         SB0800_Reset_Routine(void);
unsigned int monta_msg_800(unsigned int id, unsigned int dados);
unsigned int spi_octal(unsigned int message);
uint8_t      VC_GetMonRes(uint8_t lfsrOut);
uint8_t      init_sb800(uint8_t lfsr_seed);
void         SB0800_HighSide_Enable(unsigned char ligar);
void         SaiOCTAL(int estado, float correnteAmperes);

unsigned int sb800_write(unsigned int id, unsigned int dados);
uint8_t      sb800_lfsr_next(uint8_t s);
uint8_t      sb800_feed_wd(void);
uint8_t      sb800_service(void);
uint8_t      sb800_wait_ms(uint16_t total_ms);

#endif