#include <hidef.h>              // common defines and macros
#include "derivative.h"         // derivative-specific definitions
#include <string.h>
#include "MCUinit.h"            // inicializacao - Device Init
#include "config.h"
#include "delay.h"
#include "spi.h"
#include "sb0410.h"
#include "sb800.h"

#define SB800_SEED  0xAAu       /* qualquer valor, exceto 0xFF */

/* 1 = programa de diagnostico do Q1 (sem acionar valvulas)
 * 0 = aplicacao normal (OCTAL1 liga/desliga a cada 10 s, so com Q1 aceito) */
#define DIAG_Q1     1

#define DIAG_HOLD_OFF_MS  30000u   /* fase 1: Q1 desligado, tempo para medir J6/J5 */

/* LEDs da placa (folha 4 do esquema: PA4/PA5/PA6 -> 1 k -> LED -> AGND) */
#define LED_PIN     PORTA_PA4   /* LED1 (D17): estado do Q1 (ver abaixo)      */
#define LED_LKG     PORTA_PA5   /* LED2 (D16): HD_lkg = 1 na ultima msg 18    */
#define LED_RST     PORTA_PA6   /* LED3 (D15): o Octal ja foi reinicializado  */

void uart_putc(uint8_t c) {
    while (SCI0SR1_TDRE == 0);
    SCI0DRL = c;
}

/* --- variaveis para o debugger -------------------------------------------- */
volatile uint8_t      diag_fase    = 0;   /* 1 = Q1 desligado (medir); 2 = tentando/ligado */
volatile unsigned int diag_m3r     = 0;   /* resposta msg 3 (Vpwr_ov/uv, FGND, OTW) */
volatile unsigned int diag_m8r     = 0;   /* resposta msg 8 (vcp_vpwr)              */
volatile unsigned int diag_vcp_adc = 0;   /* vcp_vpwr<9:0>                           */
volatile uint8_t      diag_vpwr_uv = 0, diag_vpwr_ov = 0, diag_fgnd = 0;

static void diag_le_supervisao(void)
{
    diag_m3r = sb800_write(3, 0x0004u);   /* mesmo valor do init: so le */
    diag_m8r = sb800_write(8, 0x0000u);
    diag_vcp_adc = diag_m8r & 0x03FFu;
    diag_vpwr_ov = (diag_m3r & M3R_VPWR_OV) ? 1u : 0u;
    diag_vpwr_uv = (diag_m3r & M3R_VPWR_UV) ? 1u : 0u;
    diag_fgnd    = (diag_m3r & M3R_FGND)    ? 1u : 0u;
}

static void quad_saidas_off(void)
{
    SaiQUAD(QUAD1, 0);   SaiQUAD(QUAD2, 0);   SaiQUAD(QUAD3, 0);   SaiQUAD(QUAD4, 0);
}

static void todas_saidas_off(void)
{
    SaiOCTAL(OCTAL1, 0); SaiOCTAL(OCTAL2, 0); SaiOCTAL(OCTAL3, 0); SaiOCTAL(OCTAL4, 0);
    quad_saidas_off();
}

static void atualiza_leds_diag(void)
{
    LED_LKG = sb800_hd_lkg ? 1 : 0;
    LED_RST = (sb800_resets != 0u) ? 1 : 0;
}

/* Espera o CI aceitar o Q1 com todas as saidas desligadas (o teste de fuga
 * do HD_S enxergaria uma valvula acionada como fuga para o terra). */
static void aguarda_q1(void)
{
    todas_saidas_off();
    while (!sb800_hd_is_on()) {
        (void)sb800_wait_ms(100);
        atualiza_leds_diag();
        LED_PIN ^= 1;                     /* pisca rapido: aguardando Q1 */
    }
    LED_PIN = 0;
}

void main(void) {
#if DIAG_Q1
  unsigned int t;
#endif

  MCU_init();
  DDRA |= 0x60u;                  /* PA5/PA6 (LED2/LED3) como saida; PA4 ja e saida */
  LED_LKG = 0; LED_RST = 0;

  init_sb400();
  sb800_hd_pre_test_hook = quad_saidas_off;  /* teste de fuga sempre com o Quad desligado */
  (void)init_sb800(SB800_SEED);   /* reset, 2x msg 0, registradores, primeiro MR */

#if DIAG_Q1
  /* ---------------- FASE 1: Q1 desligado -------------------------------- */
  /* Meça agora (multimetro, referencia AGND):                              */
  /*   - J6 / dreno do Q1 / C10(+)  -> deve ser ~12 V                         */
  /*   - J5                         -> ~0 V                                   */
  /*   - opcional: 10 k entre J6 e J5 e medir J5 (ver DIAGNOSTICO_Q1.md)      */
  diag_fase = 1;
  todas_saidas_off();
  for (t = 0; t < (DIAG_HOLD_OFF_MS / 500u); t++) {
      (void)sb800_wait_ms(500);
      diag_le_supervisao();
      atualiza_leds_diag();
      LED_PIN ^= 1;                       /* pisca lento: fase 1 */
  }

  /* ---------------- FASE 2: pede Q1 e tenta a cada 500 ms --------------- */
  /* Breakpoint/watch: sb800_hd_state, sb800_hd_lkg, sb800_hd_tries,        */
  /* sb800_hd_lkg_fails, sb800_hd_resp_check, sb800_m0r, sb800_m0r2.         */
  diag_fase = 2;
  sb800_hd_request(1);
  for (;;) {
      (void)sb800_wait_ms(1000);
      diag_le_supervisao();
      atualiza_leds_diag();
      LED_PIN = sb800_hd_is_on() ? 1 : 0; /* aceso fixo = CI aceitou o Q1 */
  }
#else
  sb800_hd_request(1);            /* liga o fail-safe (HD_G) com tratamento de HD_lkg */
  aguarda_q1();

  for (;;) {
    _FEED_COP();

    if (!sb800_hd_is_on()) {      /* Q1 caiu (HD_oc) ou chip reiniciou */
        aguarda_q1();
    }

    LED_PIN = 1;
    SaiOCTAL(OCTAL1, 1.0f);
    (void)sb800_wait_ms(10000);   /* espera 10 s alimentando o watchdog do SB0800 */

    _FEED_COP();

    LED_PIN = 0;
    SaiOCTAL(OCTAL1, 0);
    (void)sb800_wait_ms(10000);
  }
#endif
}
