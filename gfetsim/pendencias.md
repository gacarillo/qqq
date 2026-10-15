# Pendências

Tudo o que está [I], null ou sem conferência. Cada item diz o que falta e o que resolve.

## Arquivos e dados de entrada que não estão na sessão

1. simulacao_implantacao.zip com roda.py e LEIAME.txt. Não está no repositório nem no Google Drive conectado. Sem ele o módulo 1 não roda. Resolve subir o zip para gfetsim/externo/ no branch.
2. Implantacao_porta_GFET.pdf. Mesma situação.
3. Ângulo de rotação (twist) da implantação. Com 7° de inclinação, a rotação decide se há canalização planar (110), segundo N1.
4. Densidade de corrente do feixe. Afeta o autorrecozimento e a espessura amorfa.
5. Dopante e resistividade do substrato. A resistividade fica como varredura, mas o dopante de fundo (P, As ou Sb) precisa ser informado.
6. Rampas do forno e do RTA.
7. Se há HF antes da implantação e antes da oxidação.
8. Ambiente da etapa de 550 °C.
9. Método de transferência do grafeno, metal de contato, W e L do canal.
10. Saída do SRIM, se houver.
11. Licença do IMSIL. Até chegar, a cauda segue pelo ramo de ajuste exponencial a SIMS publicado.

## Referências que não foram conferidas por completo

1. R5 Lie et al. MRS 342, 51 não aparece no índice. O trabalho de Lie que aparece é em GeSi. Confirmar se o Rp de ~133 nm usado na validação anterior do RustBCA é em Si puro.
2. N14 Massoud, Plummer e Irene, JES 132, 1745 (1985), sem DOI conferido. É a fonte certa das constantes de Si(100) seco.
3. R29 Ho e Plummer, página e parte II.
4. Páginas ou números de artigo de R18, R20, R24, R33, R34, R39, R42, R44, N10, N16, N18.
5. A2 e A3 têm DOI malformado no índice.
6. DOI do CODATA para as constantes físicas.
7. A fórmula de m(T) em O₂ seco de R21 veio ilegível no resumo.

## Números que existem só no texto completo e hoje estão [I] ou null

Prioridade alta (bloqueiam módulos)

1. Parâmetros de Fair e Tsai (R6). Há valores provisórios [I] lembrados de implementações do modelo.
2. Parâmetros de Masetti para P (R22). Há valores provisórios [I].
3. Constantes de Deal e Grove para O₂ seco e razão (111)/(100) (R25, N14). Há valores provisórios [I].
4. Parâmetros do regime fino de Massoud, C, Ea e L (R26, R28). Null.
5. Parâmetros de Ho e Plummer (R29). Null.
6. Cinética de desativação de P (R12, R12b). Null.
7. Solubilidade de P em função de T (R15). Faixa larga [I].
8. Limiar de amorfização de P a 30 keV (A1). Hoje sai do critério de Dennis e Hale (A4) aplicado ao dano do RustBCA, o que é [C].
9. Curvas SIMS de R2, R3, N1 e N2 para a cauda de canalização. Precisam ser digitalizadas com figura e página.
10. Fator +n para P 30 keV (R8). Faixa de 1 a 4.
11. Forma corrigida da ionização incompleta (R37 sobre R36).
12. Barreira Si/SiO₂ para Fowler-Nordheim (R45, R46). Valor provisório [I].
13. Velocidade de Fermi do grafeno e ε do Si e do SiO₂. Valores de livro-texto [I], sem fonte primária na lista.

Prioridade média

1. Curva de mobilidade de Qin (R24) para digitalizar.
2. Fração ativa logo após 550 °C (R14, R13).
3. Prefator da velocidade de SPE a 550 °C (N9 dá só a energia de ativação).
4. Faixas de Qf e Dit para óxido seco de 20 nm sobre Si muito dopado com P.
5. Faixas de resistência de contato e de mobilidade do grafeno CVD como prior da calibração.

## Pedido prático

Como a rede da sessão não alcança as editoras, a forma mais rápida de transformar [I] em [P] é você subir os PDFs para gfetsim/externo/pdfs/. A ordem de prioridade é R6, R22, N14, R26, R28, R29, R12b, R15, R17, A1, N1, R2, R8, R36, R37, R24, R20 e N10. Os de grafeno R34, R38, R42, R44 e R47 têm versão aberta no arXiv e posso lê-los daqui.
