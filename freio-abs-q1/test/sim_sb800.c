/* Simulacao no PC do protocolo SPI do SB0800 para testar sb800.c (maquina de estados do Q1).
 * Compilar e rodar (Linux/MinGW/WSL), a partir da pasta raiz do projeto:
 *   sh test/rodar_sim.sh
 * O modelo do chip e SIMPLIFICADO: so serve para testar a logica do firmware, nao o hardware. */
#include <stdio.h>
#include <string.h>
#include "sb800.h"
volatile unsigned char PORTB_PB0=1, PORTB_PB1, PORTB_PB2, PORTB_PB3, DDRB_DDRB0, PORTA_PA4;
volatile unsigned char SCI0SR1_TDRE=1, SCI0DRL, SPI0SR_SPTEF=1, SPI0SR_SPIF=1;
volatile unsigned int SPI0DR, PITLD3; volatile unsigned char PITFLT_PFLT3, PITTF, PITTF_PTF3=1;
static int force_rst_low = 0;
void delay_ms(unsigned int t){(void)t; if(!DDRB_DDRB0) PORTB_PB0 = force_rst_low ? 0 : 1;}
void delay_us(uint16_t t){(void)t;}
void uart_putc(uint8_t c){(void)c;}
int calcularParidade(int v){int p=0,i;for(i=0;i<16;i++)p^=(v>>i)&1;return p;}
/* modelo do SB0800 */
static unsigned seed, lfsr, rst_ext, lkg, oc, hd_on, gate, errcnt, pending, lsd[18], msg1, clr6, edges;
static int no_sobe;     /* 1 = no HSD sobe (J6 ok, sem fuga) */
static int curto;       /* 1 = carga em curto: HD_oc depois de ligar */
static int quad_on;     /* valvula do Quad acionada (puxa o HSD p/ terra) */
static int hook_calls;
static void reset_chip(void){ edges=0; seed=0; lfsr=0; rst_ext=1; lkg=0; oc=0; hd_on=0; gate=0; errcnt=0; pending=0; memset(lsd,0,sizeof lsd); }
static unsigned par(unsigned w){return (w&0x7FFF)|((unsigned)calcularParidade(w&0x7FFF)<<15);}
static unsigned lnext(unsigned s){unsigned fb=(((s>>3)^(s>>4)^(s>>5)^(s>>7))&1)^1;return ((s<<1)|fb)&0xFF;}
static int lsd_ativo(void){int i; for(i=10;i<=13;i++) if(lsd[i]) return 1; return quad_on;}
int SPI0_WriteRead_16bits(int d){
  unsigned w=(unsigned)d&0xFFFF, id=(w>>10)&0x1F, data=w&0x3FF, out=pending;
  if (w==0xFFFF){ pending=0; return (int)out; }
  if ((unsigned)calcularParidade(w&0x7FFF) != (w>>15)) { pending=par(0x4000); return (int)out; }
  switch(id){
  case 0: if(rst_ext){ pending=par(0x20); rst_ext=0; } else { seed=(data>>2)&0xFF; lfsr=seed; pending=par(0); } break;
  case 1: msg1=data; pending=par(0); break;
  case 5: { unsigned on=(data>>4)&1;
            if(on && !hd_on && !lkg && !oc){ if(no_sobe && !lsd_ativo()) gate=1; else { lkg=1; gate=0; } edges++; }
            if(!on) gate=0; hd_on=on;
            if(gate && curto){ oc=1; gate=0; }
            pending=par((oc<<12)|0x203); } break;
  case 6: clr6=data; if(data&0x20){ lkg=0; oc=0; } pending=par(0); break;
  case 18: { unsigned mr=data&0xFF, exp=(unsigned)VC_GetMonRes((uint8_t)lfsr);
             if(mr==exp){ if(errcnt) errcnt--; } else errcnt++;
             lfsr=lnext(lfsr); pending=par((lkg<<11)|(errcnt<<8)|lfsr); } break;
  default: if(id>=10&&id<=17) lsd[id]=data; pending=par(0); }
  return (int)out;
}
static void hook(void){ hook_calls++; quad_on = 0; }
static int falhas = 0;
#define CHECK(c,msg) do{ if(!(c)){ printf("  FALHA: %s\n", msg); falhas++; } else printf("  ok: %s\n", msg);}while(0)
static void ticks(int n){ int i; for(i=0;i<n;i++) sb800_service(); }
int main(void){
  printf("Cenario 1: J6 sem 12 V por 2 s, depois ligado\n");
  reset_chip(); no_sobe=0; init_sb800(0xAA);
  CHECK(seed==0xAA, "SEED carregado com msg 0 2x");
  CHECK((sb800_m0r & M0R_RST_EXT) && !(sb800_m0r2 & M0R_RST_EXT), "m0r com RST_ext=1, m0r2 com RST_ext=0");
  CHECK(clr6==0, "msg 6 devolvida a 0 apos limpar");
  sb800_hd_request(1); ticks(50);
  CHECK(!sb800_hd_is_on() && sb800_hd_lkg_fails>=3, "sem 12 V: nao liga, retenta");
  no_sobe=1; ticks(20);
  CHECK(sb800_hd_is_on() && gate, "com 12 V: Q1 aceito sem reiniciar o MCU");
  CHECK(sb800_err_cnt==0 && sb800_resets==0, "watchdog sem erros/resets");

  printf("Cenario 2: valvula do Quad acionada no momento do teste\n");
  reset_chip(); no_sobe=1; sb800_hd_pre_test_hook = 0; init_sb800(0xAA);
  quad_on=1; sb800_hd_request(0); sb800_hd_request(1); ticks(30);
  CHECK(!sb800_hd_is_on(), "sem hook: teste reprova (valvula vista como fuga)");
  sb800_hd_pre_test_hook = hook; ticks(30);
  CHECK(sb800_hd_is_on() && hook_calls>0, "com hook: Quad zerado e Q1 aceito");

  printf("Cenario 3: LSD do Octal comandado antes do pedido\n");
  reset_chip(); init_sb800(0xAA); sb800_hd_request(0);
  lsd[10]=454; sb800_hd_request(1); ticks(5);
  CHECK(lsd[10]==0 && sb800_hd_is_on(), "LSD do Octal zerado no PREP e Q1 aceito");

  printf("Cenario 4: curto na saida (HD_oc)\n");
  reset_chip(); curto=1; init_sb800(0xAA); sb800_hd_request(0); sb800_hd_request(1); ticks(100);

  CHECK(sb800_hd_state==HD_ST_LOCKED && edges==SB800_HD_OC_MAX, "para apos 3 tentativas (LOCKED)");
  curto=0;

  printf("Cenario 5: Octal reinicia (RSTB baixo) com Q1 ligado\n");
  reset_chip(); init_sb800(0xAA); sb800_hd_request(0); sb800_hd_request(1); ticks(5);
  CHECK(sb800_hd_is_on(), "Q1 ligado antes do reset");
  reset_chip(); PORTB_PB0=0; ticks(1);  /* chip caiu */
  ticks(5);
  CHECK(sb800_resets==1 && sb800_hd_is_on() && seed==0xAA, "reinicializa, recarrega SEED e religa Q1");

  printf("\n%s (%d falhas)\n", falhas? "ERRO":"TUDO OK", falhas); return falhas!=0;
}
