# Diagnóstico do Q1 (fail-safe high-side) – KITVALVECNTLEVM

## 0. Fontes efetivamente abertas nesta análise

| Fonte | Situação |
|---|---|
| Datasheet MC34SB0800 (Octal), 68 p. | Lido (texto extraído + Figura 5 renderizada) |
| Datasheet MC34SB0410 (Quad) | Aberto; não tem HD_G/HD_S (não participa do teste de fuga) |
| Manual KTVALVECNTLEVMUG | Lido (conectores, setup) |
| Esquema SPF-28642_A (5 folhas) | Renderizado em 300/600 dpi; folhas 3 (HSD) e 5 (conectores) conferidas |
| `ProjetoFreioPoli-dev` (dentro de `Document_de_Carillo`, zip) | `sb800.c/h`, `main.c`, `spi.c`, `sb0410.c`, `MCUinit.c` lidos |
| `VersaofuncionandoWatchDogOctal.txt` | **Vazio (0 bytes)** |
| `log_msg18_v5.py` | Lido |
| `KDS_Examples.rar` (NXP) e `main_diagnostico_J6.c` | **Não enviados** – `CheckPDandHDStatus()` e o programa de diagnóstico anterior **não foram conferidos** |

---

## 1. Fatos

### 1.1 Do datasheet (MC34SB0800)
- **§6.2.2.2, p. 16:** a cada ligação de HD_G, a corrente I_LCdet é injetada **pelo pino HD_S durante t_HD_LC**. O Q1 só liga se a tensão medida passar do limiar. Se o teste falha, HD_G não liga e a flag (HD_lkg) vai a 1.
- **Tabela 10:** I_HD_LC = **1,5 mA** (típ.). O datasheet **não informa** o limiar de tensão nem t_HD_LC. t_HD_ON ≤ 1,4 ms, contado depois de t_HD_LC.
- **Figura 5:** as bobinas ficam ligadas entre o nó HD_S/fonte do FET e os pinos LSDx.
- **Tabela 9:** em caso de fuga, o CI **ignora a borda de subida de hd_on**. Para voltar ao normal: escrever 1 em HD_clr_flt e depois ligar de novo pelo hd_on. **Nota 7:** depois de escrever 1, o bit `xxx_clr_flt` precisa voltar a 0.
- **Tabela 21, p. 31–32**, e **sequência da p. 30:** depois de um reset externo, a msg 0 precisa ser escrita **duas vezes**. A 1ª limpa RST_ext e a 2ª carrega o SEED. **Confirmado.**
- **Tabela 55:** na resposta da msg 18, o bit 11 é HD_lkg.

### 1.2 Do esquema
- **J6 (PWR_HSD): os pinos 1 e 2 estão na mesma rede, o dreno do Q1.** O J6 **não tem pino de terra**. O mesmo vale para J5 (BA_HSD), J8 (VPWR) e J7 (AGND): na placa, cada borne de 2 pinos é uma única rede, com o segundo pino servindo para dobrar a capacidade de corrente.
- Rede do dreno: J6 + **C10 = 22 µF** + C9 = 0,1 µF para AGND, e R5 = 100 Ω até HD_D.
- Rede da fonte (SB0800_HSD = J5): Q1-S, R1 = 100 Ω até HD_S, zeners D10/D12 entre gate e fonte, e catodos dos Schottky SS2H10 de todas as saídas LSD (Octal LSD1–4 e Quad LSD1–4, folha 5). **Não há resistor ou capacitor da rede HSD para AGND.**
- O Q1 (IPB80N04S2, MOSFET N) tem **diodo de corpo com anodo na fonte (J5) e catodo no dreno (J6)**.

### 1.3 Medições já feitas (vindas da conversa anterior)
- HD_lkg = 1 depois de cada tentativa, inclusive depois de limpar a flag e gerar nova borda (0x081A → 0x8043 → 0x08E5).
- **As 5 respostas capturadas têm paridade válida** (conferido aqui). Portanto o HD_lkg lido não é corrupção de SPI.
- HD_oc = 0. Msg 3 sem UV/OV/FGND/OTW. vcp_vpwr = 666, dentro da faixa de 330 a 810.
- J5 e TP3 a 0 V. Resistências: em uma mesma sequência, lado HD_S de R1 ≈ 887 Ω, lado J5 ≈ 771 Ω e J5 ≈ 772 Ω.
- **Não consta medição de J6 (dreno) em relação a AGND com a placa ligada.**

### 1.4 Do código original
- A msg 0 era escrita uma única vez. Assim o SEED não era carregado e o primeiro MR saía calculado com um SEED errado. O laço se corrigia sozinho porque segue o AR devolvido pelo chip.
- A msg 6 = 0x0227 ficava permanentemente em 1, contrariando a nota 7.
- HD_lkg não entrava em `sb800_status` e não era tratado.
- `main.c` liga o HD e logo em seguida aciona `SaiOCTAL(OCTAL1, 1.0)`. **Com uma válvula conectada, o teste de fuga enxergaria a própria válvula como fuga.**

---

## 2. Interpretação

O teste do CI só passa se o nó **SB0800_HSD (J5)** subir acima do limiar quando recebe 1,5 mA. Sem válvula, esse nó deveria subir com facilidade, porque nada nele vai para AGND, a não ser fugas de semicondutor.

O único caminho de corrente relevante é o **diodo de corpo do Q1, da fonte para o dreno**. Se o dreno (J6) não estiver em uns 12 V **em relação a AGND** no instante da borda de hd_on, a corrente de teste segue por esse diodo para C10/C9. Com 22 µF, a tensão sobe só 1,5 mA / 22 µF ≈ **68 mV por ms**, e o nó HSD fica preso em torno de V(J6) + 0,6 V. **O teste falha sempre, por maior que seja o número de limpezas e novas tentativas.** Isso reproduz exatamente o padrão observado: falha → limpa → falha de novo, sem HD_oc, com bomba de carga e alimentação normais.

As resistências de ~770 a 940 Ω medidas com a placa desligada são compatíveis com esse mesmo caminho, que vai da fonte do Q1 pelo diodo de corpo até a rede do dreno, depois R5/HD_D e a estrutura do CI desligado, mais o C10 se carregando. Mesmo assim, **não servem como prova**, porque são leituras com semicondutores no caminho.

---

## 3. Hipóteses, em ordem de probabilidade, e o teste que decide cada uma

**H1 – O dreno do Q1 não está em ~12 V em relação a AGND durante a tentativa.** É a mais provável. Causas possíveis:
- a) os fios + e − da fonte foram ligados **nos dois pinos do J6**. Isso põe a fonte em curto: ela entra em limitação de corrente e o J6 fica em ~0 V.
- b) a fonte do J6 é separada e o negativo dela **não está ligado ao J7 (AGND)**.
- c) o J6 foi energizado **depois** da tentativa. O firmware antigo nunca tentava de novo.

**Teste decisivo**, com multímetro, placa ligada e o firmware de diagnóstico na fase 1: medir **o dreno do Q1 (aba/C10+) em relação ao J7/AGND**.
- Se não der ~12 V, H1 está confirmada. **Correção:** ligar o + da fonte aos dois pinos do J6 (ou a um deles) e o − ao **J7 (AGND)**. Pode ser a mesma fonte do J8/VPWR.

**H2 – Existe fuga real no nó HSD com a placa alimentada.** Causas possíveis: gate–fonte do Q1 danificado, D10/D12 em curto, Schottky em curto, ou trilha.

**Teste decisivo**, só se H1 for descartada: com J6 a 12 V e Q1 desligado (fase 1), colocar **10 kΩ entre J6 e J5** e medir V(J5) em relação a AGND. A fuga vale R_fuga ≈ 10 k · V / (12 − V).
- Se der ~12 V, não há fuga. O firmware tenta a cada 500 ms, e o Q1 deve ser aceito na fase 2 (TP3 ≈ VPWR + 10 V).
- Se der ~1 V, a fuga é de ~1 kΩ e é real. Nesse caso, com a placa desligada, medir TP3↔J5 nas duas polaridades: o esperado é aberto. Medir também J5→J6 no modo diodo: o esperado é ~0,5 V num sentido e aberto no outro.
- **Retire o resistor depois do teste.** Ele força o resultado do teste de segurança.

**H3 – Defeito no detector do próprio Octal.** Só deve ser considerada se H1 e H2 forem descartadas, ou seja, se o nó HSD sobe (comprovado pelo teste com resistor) e mesmo assim HD_lkg continuar em 1.

---

## 4. O que mudou no firmware (`Sources/`)

| Arquivo | Mudança |
|---|---|
| `sb800.c/h` | Msg 0 escrita 2× depois do reset. Respostas salvas em `sb800_m0r` e `sb800_m0r2`; em `m0r2`, o RST_ext deve ser 0. |
| | `sb800_clear_faults()`: escreve clr = 1 e depois clr = 0 (nota 7). |
| | Máquina de estados do HD dentro de `sb800_service()`, um passo a cada 40 ms: **PREP** (hd_on = 0, LSD do Octal = 0, limpa HD) → **EDGE** (hd_on = 1) → **CHECK** (HD_lkg na msg 18, HD_oc na msg 5) → **ON**. Se reprovar, vai para **WAIT** e tenta de novo a cada 500 ms. Sobrecorrente repetida 3× leva a **LOCKED**. |
| | Novos bits de status: 0x20 HDLKG, 0x40 HDOC, 0x80 HDOK. |
| | Variáveis para watch: `sb800_hd_state`, `sb800_hd_tries`, `sb800_hd_lkg_fails`, `sb800_hd_resp_check`. |
| | Depois de um reset do chip, o HD é religado com uma nova borda. |
| `main.c` | `DIAG_Q1 1`: fase 1 com 30 s de Q1 desligado para as medições (LED PA4 pisca devagar); fase 2 tentando ligar (LED aceso fixo = aceito). Lê msg 3 e msg 8 a cada 0,5–1 s. |
| | `DIAG_Q1 0`: aplicação. Todas as saídas (Octal e Quad) ficam em zero até o Q1 ser aceito. Só depois disso o OCTAL1 liga e desliga a cada 10 s. Se o Q1 cair, as saídas são zeradas de novo e o programa espera. |
| `tools/log_msg18_v6.py` | Decodifica HD_lkg e os bits de status e mostra quando o Q1 passou a ser aceito. Uso: `python log_msg18_v6.py COM3 1500`. |

O firmware **não contorna** o teste de fuga. Quem decide continua sendo o CI. O firmware apenas gera uma nova borda de hd_on, com as saídas desligadas, até o teste passar. Como o CI não liga o gate quando o teste falha (Tabela 9), repetir a tentativa não aplica tensão nas válvulas.

Verificação feita aqui: o código passou por checagem de sintaxe C com gcc e foi simulado no PC contra um modelo do protocolo SPI do SB0800 (LFSR/ALU, msg 0 2×, HD_lkg na borda, clr). Resultado: SEED carregado, ERR_CNT = 0, retentativa a cada ~500 ms, Q1 aceito assim que o nó consegue subir, LSD zerados durante o teste. **Ainda não foi compilado no CodeWarrior nem testado na placa.**

## 5. Procedimento sugerido
1. Ligue o − da fonte do J6 ao **J7 (AGND)** e o + ao J6. Não ligue os dois polos nos dois pinos do J6.
2. Grave o firmware com `DIAG_Q1 1`, sem válvulas, e ligue VPWR, VCC5 e J6.
3. Na fase 1 (LED piscando devagar, 30 s), meça o dreno do Q1 (C10+) e o J5 em relação a AGND.
4. Na fase 2, observe se o LED fica aceso fixo. No debugger, `sb800_hd_state` = 4 significa aceito. Confira também TP3 ≈ VPWR + 10 V e J5 ≈ 12 V.
5. Se não aceitar com o dreno em 12 V, faça o teste de H2 com o resistor de 10 kΩ.
6. Depois que funcionar, use `DIAG_Q1 0` e conecte as válvulas.
