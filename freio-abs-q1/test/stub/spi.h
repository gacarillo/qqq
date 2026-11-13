#ifndef __SPI_H_
#define __SPI_H_


#include "config.h"

int SPI0_CheckParity(uint16_t mensagem);
int calcularParidade(int valor);
int SPI0_WriteRead_16bits(int dado);
uint16_t SPI0_get_bits_9_downto_0(uint16_t mensagem);
uint8_t SPI0_get_bits_7_downto_0(uint16_t mensagem);
uint16_t SPI0_get_bits_13_downto_6(uint16_t mensagem);
uint16_t SPI0_get_bits_10_downto_8(uint16_t mensagem);

#endif/* __SPI_H_ */