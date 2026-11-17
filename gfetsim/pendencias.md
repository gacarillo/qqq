# Pendências

Tudo o que ainda está [I], null ou sem conferência. Cada item diz o que falta e o que resolve. A lista de valores provisórios que de fato entram nos cálculos sai do comando `gfetsim params --provisorios` e aparece no relatório.

## Validações que não fecharam

1. **Módulo 1, limiar de amorfização.** O critério de 6e23 eV/cm³ (A4) prevê limiar de 1,5e14 cm⁻², dez vezes abaixo do medido a 300 K (A2). A6 mostra que esse valor é de 4 K. O modelo passou a usar o limiar medido a 300 K (ramo limiar_TA). Resolve ler A1, que mede exatamente P de 30 keV.
2. **Módulo 1, alcance.** O teste só confere que o RustBCA fica dentro da discordância publicada (G1 contra K1). O Rp do RustBCA fica 15 a 21 % abaixo da relação de G1. Resolve um SIMS do usuário ou o texto de N1 ou R3.
3. **Módulo 2, ativação em uma etapa.** O modelo ativa 100 % sem a etapa de 550 °C, contra 40 a 60 % (R13) e 67 % (R19). Falta a cinética dos aglomerados P-defeito (R12b). A receita usa sempre a etapa de 550 °C, caso em que o modelo valida, mas a variante B carrega um ramo com o limite de R19.
4. **Módulo 3 sem validação quantitativa.** Nenhum resumo acessível traz espessura contra tempo de óxido seco fino em Si(100). Os testes conferem a implementação e o comportamento qualitativo. Resolve uma medida do usuário (`dados/medidas_espessura_oxido.csv`) ou o texto de N14, R26 ou N23.
5. **Módulo 4.** A validação é numérica (Poisson contra Boltzmann analítico) e de forma (R34, R39, R42). Não há curva medida de GFET com porta de Si n+ para comparar. Resolve a medida de transferência do próprio dispositivo (`dados/medidas_transferencia.csv`).

## Achados da validação do estúdio

1. Camada amorfa sensível ao ruído. `implantacao.modulo.camada_amorfa` usa o máximo bruto da perda nuclear num histograma de 0,5 nm, que com 10⁵ íons tem cerca de 5 % de ruído por faixa. Na rodada de 30 keV o máximo caiu num pico de ruído junto à superfície e o fim da camada amorfa ficou em 35,25 nm; com a perda suavizada em 3,5 nm ele vai para 37,8 nm. Sugestão para o pacote, suavizar a perda nuclear antes de tomar o máximo [C].
2. Constantes. O params.yaml diz CODATA 2018, mas o scipy 1.18 já usa o CODATA 2022. ε₀ e m₀ mudam menos de 10⁻⁹ relativo; vale atualizar o texto do params.yaml.
3. Integrador da oxidação. `cinetica.espessura` usa LSODA com rtol de 10⁻⁸ e atol de 10⁻⁶, que erra até 7×10⁻⁶ relativo no primeiro minuto. É desprezível para a receita, mas um atol de 10⁻⁹ custa pouco.
4. Fator de Ho e Plummer acima do máximo de Nomura. Com as razões de vacâncias provisórias [I], o fator F começa perto de 4,5 a 900 °C e cai para 2,6 no fim da oxidação, acima do máximo de 2,1 que R23 mede em Si implantado. Os dois ramos seguem separados, mas isso reforça a necessidade de ler as razões intrínsecas em R29.
5. Fator F em dente de serra. Na oxidação acoplada o Si consumido sai em fatias inteiras de 0,5 nm, e o P ativo na interface salta a cada fatia. A espessura final não muda, mas a curva de F fica serrilhada. Uma interpolação da interface dentro da célula resolveria [C].

## Entradas que dependem do usuário

1. `simulacao_implantacao.zip` (roda.py e LEIAME.txt) e `Implantacao_porta_GFET.pdf`. O módulo 1 usa um embrulho próprio do RustBCA (commit a356280); falta conciliar com o roda.py.
2. Ângulo de rotação (twist). Decide a canalização planar (110) a 7° (N1). Sem ele, a cauda de canalização não entra.
3. Densidade de corrente do feixe e temperatura real da lâmina. Afetam o limiar de amorfização (A4).
4. Dopante e resistividade do substrato. A C-V sob a porta não depende da resistividade, mas a isolação depende (ver relatório).
5. Rampas do forno e do RTA, ambiente da etapa de 550 °C e se há HF antes da implantação e da oxidação.
6. W, L e metal de contato do GFET. Os resultados elétricos estão por quadrado.
7. Medidas para calibração. Os modelos de CSV estão em `dados/`.

## Referências que não foram conferidas por completo

1. R5 Lie et al. MRS 342, 51 não aparece no índice.
2. N14 Massoud, Plummer e Irene, JES 132, 1745, sem DOI conferido.
3. R29 Ho e Plummer, página e parte II. As razões de vacâncias carregadas do modelo seguem provisórias.
4. Páginas ou números de artigo de R18, R20, R24, R33, R34, R39, R42, R44, N10, N16 e N18.
5. A2 e A3 com DOI malformado no índice.
6. DOI do CODATA.
7. A fórmula de m(T) de R21, ilegível no resumo.
8. Eg0 e a faixa de validade de N26.
9. Valores lidos em fonte secundária (S1, S2), que citam a primária mas não foram comparados com ela.

## Números que hoje estão [I] e entram nos cálculos

Prioridade alta

1. Fair e Tsai, D0 e Ea das três difusividades (R6).
2. Masetti para P, todos os parâmetros (R22).
3. nᵢ(T) em temperatura de processo (forma A T^1,5 exp(−Eg/2kT)).
4. Razões de vacâncias carregadas no modelo de Ho e Plummer (R29). Hoje usam as razões de difusividade de Fair e Tsai.
5. Prefator da velocidade de SPE e fator de aceleração por P.
6. εr do Si e do SiO₂, Nc do Si a 300 K, afinidade eletrônica do Si.
7. Barreira Si/SiO₂ para Fowler-Nordheim.
8. Fração da energia nuclear que vai para processos atômicos (só usada no critério de baixa temperatura).

Prioridade média

1. Faixas de Qf e Dit para óxido seco de 20 nm sobre Si muito dopado com P.
2. Faixa de resistência de contato e prior de mobilidade do grafeno CVD.
3. Permissividade estática do óxido depositado por sputtering.
4. Diferença de função trabalho entre grafeno e Si n+, que desloca a tensão de Dirac em algumas centenas de mV e hoje fica dentro da calibração de V_D.
5. Cinética de desativação abaixo de 700 °C (R12b).

## Física que o modelo não tem

1. Canalização (IMSIL indisponível, twist desconhecido).
2. TED. Falta o prefator da dissolução dos {311}. Afeta a cauda, pouco a superfície.
3. Cauda acelerada de Fair e Tsai (dissociação do par P-V).
4. Aglomerados P-defeito e sua cinética (R12, R12b).
5. Oxidação acelerada por difusão (OED) do P durante a oxidação de porta.
6. Estreitamento de banda no Si n+.
7. Efeitos 2D na janela de contato da porta. A borda da máscara agora tem um modelo 2D em `recozimento/borda2d.py`, com a sombra de 7°, o espalhamento lateral do RustBCA, o recozimento por separação de operadores e a oxidação por coluna. Ele não tem difusão lateral durante a oxidação nem tensão mecânica na borda [C].
7a. O modelo 2D mostra que com Ho e Plummer a 900 °C o óxido chega a 19,8 nm sobre a porta e fica em 6,8 nm sobre o substrato, um degrau de 13 nm na borda da região n⁺. Isso afeta a cobertura do grafeno e a isolação fora da porta e precisa de medida.
7b. No forno B a 900 °C o P avança cerca de 110 nm por baixo da máscara a 10 nm de profundidade.
7c. O desenho da janela da porta, a definição do canal, o metal e a ordem dos contatos não estão na receita. A cena 3D da animação supõe esses passos e os marca como [I].
8. Ilhas de grafeno multicamada (17 % da área no artigo) e trincas.
9. Histerese por água (R47, R49). O modelo de relaxação está em `eletrico/histerese.py`, mas alfa e tau só saem de medidas de ida e volta do dispositivo.

## Pedido prático

A rede da sessão não alcança as editoras. Para trocar [I] por [P], o mais rápido é subir os PDFs para `gfetsim/externo/pdfs/`. A ordem de prioridade é R6, R22, N14, R26, R28, R29, R12b, A1, N1, R2, R8, R36, R37, R24, R20, N10 e N23.
