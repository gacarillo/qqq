# Diagnóstico do Q1 (fail-safe high-side) – KITVALVECNTLEVM – rev. 2

Esta revisão reconferiu cada afirmação nas fontes. Mudanças em relação à rev. 1: novos achados no esquema (§A, itens 7–10), mais hipóteses (§B) e mais alterações no firmware (§C, itens 7, 9, 11 e 14).

**Legenda:** ✅ confirmado na fonte · 📏 medido por vocês · ⚠️ interpretação · ❓ não verificável com o material disponível

---

## A. Verificação das afirmações

| # | Afirmação | Fonte conferida | Status |
|---|---|---|---|
| 1 | Quando hd_on sobe, o CI injeta I_LC por HD_S durante t_HD_LC e só liga o HD_G se a tensão passar do limiar. Se falhar, seta HD_lkg | Datasheet Octal §6.2.2.2, p. 16 | ✅ |
| 2 | I_HD_LC = 1,5 mA (típ.) | Tabela 10, p. 17 | ✅ |
| 3 | Limiar de tensão do teste e duração t_HD_LC | Tabela 10: **não especificados** | ❓ |
| 4 | Em caso de fuga, a borda de hd_on é ignorada. Para retomar: HD_clr_flt = 1 e nova borda de hd_on | Tabela 9 | ✅ |
| 5 | O bit `xxx_clr_flt` precisa voltar a 0 depois de usado | Tabela 9, nota 7 | ✅ |
| 6 | Depois de reset externo, a msg 0 precisa ser escrita 2×: a 1ª limpa RST_ext, a 2ª carrega o SEED | Tabela 21 (p. 31–32) e sequência da p. 30 | ✅ |
| 7 | **J6: os pinos 1 e 2 estão na mesma rede (dreno do Q1). Não há pino de terra** | Esquema, folha 3 (zoom 600 dpi) | ✅ |
| 8 | J5 (BA_HSD), J8 (VPWR) e J7 (AGND) seguem a mesma regra: os 2 pinos estão na mesma rede. **J10 é exceção:** pino 2 = VCC5, pino 1 = AGND. O borne "GND" do manual é AGND | Esquema, folhas 3 e 5 | ✅ |
| 9 | **J1–J4: cada pino é um canal LSD diferente** (ex.: J4 = LSD_1 e LSD_2 do Octal). J9/J11 = LSD_5–8. **Nenhum desses bornes tem HSD.** A válvula se liga entre J5 e um pino de LSD | Esquema, folha 5 | ✅ |
| 10 | Rede do J5 (SB0800_HSD): fonte do Q1, R1 → HD_S, zeners D10/D12 e **catodos** dos Schottky SS2H10 das saídas reguladas (Octal LSD1–4 e Quad LSD1–4). Os capacitores de 2200 pF estão nas linhas LSD, não no HSD. **Nenhum resistor do HSD para AGND** | Esquema, folhas 3 e 5 | ✅ |
| 11 | Rede do dreno: J6, C10 = 22 µF e C9 = 0,1 µF para AGND, e R5 = 100 Ω → HD_D | Esquema, folha 3 | ✅ |
| 12 | O diodo de corpo do Q1 (MOSFET N) conduz da fonte (J5) para o dreno (J6) | Símbolo no esquema e física do MOSFET N | ✅ |
| 13 | O Quad não tem HD_G/HD_S e não participa do teste | Datasheet do Quad | ✅ |
| 14 | Os LSD têm corrente de "sink" para detectar circuito aberto, ativa por padrão (msg 1, bit 2). **O valor dessa corrente não consta** | Tabela 27 (Octal) e Tabela 24 (Quad) | ✅ / valor ❓ |
| 15 | As 5 respostas capturadas (0x88F0, 0x081A, 0x8043, 0x08E5, 0x8203) têm paridade válida, logo o HD_lkg lido é real | Cálculo da paridade | ✅ |
| 16 | HD_lkg = 1 volta depois de limpar e gerar nova borda | Captura de vocês | 📏 |
| 17 | J5 = 0 V e TP3 = 0 V depois da tentativa | Medição de vocês | 📏 |
| 18 | **Tensão do J6/dreno em relação a AGND, com a placa ligada** | **Não foi medida** | ❓ |
| 19 | R1 ≈ 99 Ω, com continuidade até J5. TP3 até R10 ≈ 94 Ω | Medição de vocês | 📏 |
| 20 | J5–AGND ≈ 770–940 Ω com a placa desligada | Medição de vocês. Explicável por caminhos com diodos (corpo do Q1; LSD + Schottky); **não é prova de fuga** | 📏 / ⚠️ |
| 21 | PA4/PA5/PA6 = LED1/LED2/LED3, acendem em nível alto (resistor de 1 k + LED para AGND) | Esquema, folha 4 | ✅ |
| 22 | `CheckPDandHDStatus()` da NXP | KDS_Examples não foi enviado | ❓ |
| 23 | Programa `main_diagnostico_J6.c` anterior (devolvia clr a 0? quando o J6 era ligado?) | Arquivo não enviado | ❓ |
| 24 | t_WD = 10 a 60 ms. Com MR a cada 40 ms, não houve reset nem ERR_CNT | Tabela 20 (valor ambíguo) e comportamento observado | ✅ / ⚠️ |

---

## B. Possibilidades para HD_lkg = 1 com J5 = 0 V

Probabilidade: **A** = alta, **M** = média, **B** = baixa, **D** = descartada.

| # | Hipótese | A favor | Contra | Prob. | Teste decisivo | Correção |
|---|---|---|---|---|---|---|
| H1a | **Fonte do J6 ligada nos dois pinos do J6** (+ e −). Isso é um curto, porque os dois pinos são a mesma rede | Explica tudo: o dreno fica em ~0 V, a corrente de teste escoa pelo diodo de corpo do Q1 para C10, e o HSD nunca sobe | — | **A** | Fonte em limitação de corrente; dreno–J7 ≈ 0 V | + no J6, − no **J7** (ou no pino 1 do J10) |
| H1b | **Negativo da fonte do J6 sem ligação com AGND** (fonte separada, flutuando) | Mesmo mecanismo da H1a | — | **A** | Dreno (aba do Q1/C10+) contra J7: tensão ≠ 12 V ou instável | Ligar o − dessa fonte ao J7, ou usar a mesma fonte do J8 |
| H1c | **J6 energizado depois da tentativa** | O firmware antigo tentava uma vez só, no boot | Não explica por que a nova tentativa do diagnóstico falhou, a menos que o J6 ainda estivesse sem tensão | M | Ligar o J6 **antes** do VPWR/VCC5, ou usar o firmware novo (tenta a cada 500 ms) | Firmware novo ✔ |
| H1d | Borne/fio do J6 frouxo ou fonte desligada | Mesmo mecanismo | — | M | Mesma medição da H1b, na aba do Q1 (não no fio) | Reapertar |
| H2 | **Fuga real no nó HSD com a placa ligada:** gate–fonte do Q1 danificado, D10/D12 em curto, ou trilha | As leituras de ~900 Ω (mas veja A.20) | Pelo esquema, não há caminho resistivo; leituras com diodos no caminho não provam fuga | M/B | Com J6 em 12 V e Q1 desligado (fase 1): **10 kΩ entre J6 e J5**, medir V(J5). Fuga ≈ 10k·V/(12−V). Com a placa desligada: TP3↔J5 nas duas polaridades (o esperado é aberto) | Trocar o componente com fuga |
| H3 | Q1 com dreno–fonte em curto **e** J6 sem tensão | Também reprova o teste (C10 no nó) | Se o J6 tivesse 12 V, o J5 mostraria 12 V. Mediram 0 V | B | Placa desligada, modo diodo: J5(+)→J6(−) ≈ 0,5 V; J6(+)→J5(−) aberto | Trocar o Q1 |
| H4 | R5 aberto (HD_D flutuando) | — | Efeito no teste de fuga não documentado; afetaria mais o HD_oc | B | Placa desligada: R5 ≈ 100 Ω; J6 → lado HD_D do R5 ≈ 100 Ω | Refazer a solda |
| H5 | R1 aberto (HD_S desconectado) | — | Medido 99 Ω e continuidade até J5 | **D** | — | — |
| H6 | Gate (R9/R10/TP3) aberto | — | HD_lkg acontece **antes** de ligar o gate; continuidade foi medida | **D** (como causa do lkg) | — | — |
| H7 | HD_lkg lido errado (SPI corrompido) | — | Paridade válida em todas as capturas, e TP3 = 0 V é coerente | **D** | — | — |
| H8 | VPWR/VCC5 em falha, bomba de carga fraca | — | Msg 3 sem UV/OV/FGND; vcp_vpwr = 666 (faixa 330–810) | B | Fase 1 do diagnóstico: `diag_vpwr_uv`, `diag_vcp_adc` | — |
| H9 | Firmware: HD_clr_flt preso em 1 / sequência de limpeza | Contraria a nota 7 | A flag foi setada mesmo com clr em 1, e o programa de diagnóstico limpou e falhou de novo | B | — | Corrigido ✔ |
| H10 | Firmware: msg 0 escrita uma vez só (SEED não carregado) | Contraria a Tabela 21 | Afeta o watchdog, não o HD (ERR_CNT = 0, sem resets) | **D** (como causa do lkg) | — | Corrigido ✔ |
| H11 | **Válvula ligada com LSD (Octal ou Quad) acionado na hora do teste**. O CI enxerga a válvula como fuga (Figura 5) | O `main` antigo acionava o OCTAL1 logo depois de pedir o HD | No teste relatado, **não havia válvula** | **D agora / A com válvulas** | — | Corrigido ✔ (zera Octal + rotina que zera o Quad) |
| H12 | Com válvulas: a corrente de "sink" dos LSD desligados puxa o HSD pela válvula | O mecanismo existe (A.14) | A NXP desenhou o teste com bobinas ligadas (Figura 5); o valor da corrente não é informado | ❓ (só com válvulas) | Se HD_lkg aparecer **só** com válvulas: `SB800_HD_TEST_SINK_DIS = 1` | Opção no firmware ✔ |
| H13 | Defeito no detector ou na fonte de corrente HD_S do Octal | — | Só faz sentido depois de descartar H1–H4 | B | Com o pré-polarizador de 10 kΩ (H2), o J5 fica em ~12 V e **mesmo assim** HD_lkg = 1 | Trocar o Octal |

**Ordem dos testes:** H1 (uma medição, 1 min) → H3/H4 (placa desligada) → H2 (resistor de 10 kΩ) → H13.

---

## C. Alterações no firmware

| # | Arquivo | Alteração | Motivo / referência | Verificado como |
|---|---|---|---|---|
| 1 | `sb800.c` | Msg 0 escrita **2×** depois do reset. Respostas salvas em `sb800_m0r` (deve ter RST_ext = 1) e `sb800_m0r2` (RST_ext = 0) | Tabela 21, p. 30–32 | Simulação: SEED = 0xAA carregado, ERR_CNT = 0 |
| 2 | `sb800.c` | `sb800_clear_faults()`: msg 6 com clr = 1 e em seguida msg 6 = 0 | Tabela 9, nota 7 | Simulação |
| 3 | `sb800.c/h` | Bits de status novos: 0x20 HDLKG (bit 11 da msg 18), 0x40 HDOC (bit 12 da msg 5), 0x80 HDOK | O antigo `sb800_status = 0` escondia o HD_lkg | Compilação |
| 4 | `sb800.c` | Máquina de estados do HD, um passo a cada tick de 40 ms: PREP (hd_on = 0, LSD = 0, limpa HD) → EDGE (hd_on = 1) → CHECK → ON | Tabela 9. Assim a borda de subida fica garantida | Simulação, cenário 1 |
| 5 | `sb800.c` | HD_lkg → nova tentativa a cada **500 ms**, sem limite. Funciona mesmo que o J6 seja ligado depois do MCU | H1c. É seguro porque, com o teste reprovado, o CI não liga o gate | Simulação, cenário 1 |
| 6 | `sb800.c` | HD_oc → no máximo **3** tentativas, depois LOCKED. Um novo `sb800_hd_request(1)` libera | Não insistir em curto real (protege o Q1) | Simulação, cenário 4 |
| 7 | `sb800.c` | Antes de cada borda: zera os LSD 1–8 do Octal (msgs 10–17) | H11 | Simulação, cenário 3 |
| 8 | `sb800.c/h` | Rotina `sb800_hd_pre_test_hook`, chamada antes de cada borda. O `main` a aponta para zerar o Quad | H11 (as válvulas do Quad também ficam no J5) | Simulação, cenário 2 |
| 9 | `sb800.c` | Recuperação depois de reset do chip: reinicializa e religa o HD com borda nova e teste novo. O antigo só reescrevia a msg 5 | Tabela 21: hd_on volta a 0 depois de reset | Simulação, cenário 5 |
| 10 | `sb800.c` | Monitoramento em ON: HD_oc e HD_lkg conferidos a cada tick | Detectar a queda do Q1 | Simulação |
| 11 | `sb800.h` | Opção `SB800_HD_TEST_SINK_DIS` (padrão **0**): desliga o sink dos LSD do Octal só durante o teste | H12. Opção de investigação, não é solução | Simulação: msg 1 restaurada |
| 12 | `sb800.c` | Msg 1 virou a constante `SB800_MSG1_CFG = 0x0002`. Valor igual ao antigo; só o comentário errado ("load dump") foi corrigido | Tabela 27 | — |
| 13 | `main.c` | `DIAG_Q1 1` = diagnóstico. Fase 1: 30 s com Q1 desligado, para medir (LED1 piscando devagar). Fase 2: tentativas (LED1 fixo = Q1 aceito). Lê msg 3 e msg 8 | Testes da §B sem precisar de debugger | Compilação |
| 14 | `main.c` | LED2 (PA5) = HD_lkg; LED3 (PA6) = o Octal já foi reinicializado | A.21 | Compilação |
| 15 | `main.c` | `DIAG_Q1 0` = aplicação: todas as saídas ficam em 0 até o Q1 ser aceito. Se o Q1 cair, zera e espera de novo | H11 | Compilação |
| 16 | `tools/log_msg18_v6.py` | Decodifica HD_lkg e os bits novos, sincroniza o quadro de 4 bytes pela paridade e mostra quando o Q1 foi aceito | Diagnóstico pela serial | Sintaxe |
| 17 | `test/sim_sb800.c` | Modelo SPI do SB0800 com 5 cenários (12 verificações; +1 com `SINK_DIS = 1`) | Testar a lógica sem a placa | **12/12 ok**, e 13/13 com `SINK_DIS = 1` |

**Limites:** o código não foi compilado no CodeWarrior nem testado na placa. O modelo do chip é simplificado e foi feito a partir do datasheet: testa a lógica do firmware, não o hardware.

---

## D. Achados fora do Q1 (não aplicados)

| # | Achado | Referência | Recomendação |
|---|---|---|---|
| 1 | `init_sb400()` grava a msg 1 do Quad = 0x0200, com o **bit 1 em 0**, mas a Tabela 24 do Quad manda esse bit ser 1 | Datasheet do Quad, Tabela 24 | Testar com `(8u << 6) \| 0x0002u` = 0x0202 |
| 2 | t_WD na Tabela 20 = 10 a 60 ms, enquanto o firmware usa 40 ms (a NXP usa 50 ms) | Tabela 20, nota 17 | Manter 40 ms, que funciona sem reset. Se aparecer RST_wd em outra placa, reduzir para 20 ms |

---

## E. Procedimento

1. **Ligação:** + da fonte no J6; − no **J7** (ou no pino 1 do J10). Pode ser a mesma fonte do J8. **Não** ligue + e − nos dois pinos do J6.
2. Grave com `DIAG_Q1 1`, **sem válvulas**. Ligue J6, VPWR e VCC5, nesta ordem de preferência.
3. **Fase 1** (LED1 pisca devagar, 30 s):
   - dreno do Q1 (aba ou C10+) em relação ao J7 → deve dar ~12 V. **Se não der, H1 está confirmada.**
   - J5 em relação ao J7 → ~0 V.
4. **Fase 2:** LED1 aceso fixo e LED2 apagado significam Q1 aceito (TP3 ≈ VPWR + 10 a 15 V, J5 ≈ 12 V). No debugger: `sb800_hd_state = 4`.
5. Se não aceitar com o dreno em 12 V, faça a H2: 10 kΩ entre J6 e J5 durante a fase 1, meça o J5 e **retire o resistor** depois. Em seguida, H3/H4 com a placa desligada.
6. Depois que funcionar: `DIAG_Q1 0` e conecte as válvulas entre o **J5** e o pino LSD desejado (J1–J4).
