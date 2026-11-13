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

void uart_putc(uint8_t c) {
    while (SCI0SR1_TDRE == 0);
    SCI0DRL = c;
}

void main(void) {

  MCU_init();

  init_sb400();
  (void)init_sb800(SB800_SEED);   /* reset do chip, registradores e primeiro MR */
  SB0800_HighSide_Enable(1);      /* liga o fail-safe (HD_G) */

  for (;;) {
    _FEED_COP();

    PORTA_PA4 = 1;
    SaiOCTAL(OCTAL1, 1.0f);
    (void)sb800_wait_ms(10000);   /* espera 10 s alimentando o watchdog do SB0800 */

    _FEED_COP();

    PORTA_PA4 = 0;
    SaiOCTAL(OCTAL1, 0);
    (void)sb800_wait_ms(10000);

  }
}