# Validação do porte contra o gfetsim em Python

Os testes ficam em `tests/` e rodam com `npm test`. As referências saem de `scripts/exportar_referencias.py`, que chama as funções originais do gfetsim com entradas fixas. Hoje são 58 testes e todos passam.

## Tolerâncias

| Módulo | Comparação | Tolerância | Observação |
|---|---|---|---|
| Fermi-Dirac F₁/₂ | 13 valores de η entre −50 e 119 | 10⁻⁶ relativo | em η = −40 o quad do Python erra 9×10⁻⁴ por causa da tolerância absoluta de 1,5×10⁻⁸ num valor de 4×10⁻¹⁸; ali o teste usa a expansão exp(η)(1 − exp(η)/2^1,5) |
| spline cúbica | interp1d cúbica com extrapolação | 10⁻⁹ | inclui um teste de grade uniforme, que pegou um erro de pivô nulo na primeira versão |
| transformada de distância | distance_transform_edt com espaçamentos 2 e 4 | 10⁻¹² | exata |
| Pearson | quatro conjuntos de momentos | 10⁻⁹ | os quatro caem no tipo I, como no Python |
| Si, n_i, n_e, C_sat, Masetti, Qin | valores em temperaturas e concentrações | 10⁻¹² | |
| difusão de Fair e Tsai | um passo, RTA de 10 s e forno de 30 min | 10⁻⁶ acima de 10¹⁴ cm⁻³ | |
| recozimento | três variantes e ramos | 10⁻⁶ | |
| cinética de Massoud | espessura em cinco tempos | 10⁻⁷ contra a solução de tolerância apertada, 10⁻⁵ contra o LSODA padrão | o LSODA do gfetsim, com rtol de 10⁻⁸ e atol de 10⁻⁶, erra até 7×10⁻⁶ relativo no primeiro minuto; com tolerância de 10⁻¹² ele coincide com o porte |
| oxidação acoplada | cinco combinações de ramos | 10⁻⁹ na espessura, 10⁻⁶ nos perfis | |
| tempo até o alvo | bissecção com acoplamento | 10⁻⁵ | |
| Poisson | potencial e curvatura em sete cargas | 10⁻⁶ | |
| grafeno | tabela n(µ), densidade, capacitância e Jiménez | de 10⁻⁹ a 10⁻⁴ | a capacitância é derivada numérica dos dois lados |
| módulo elétrico completo | C-V, n, campo, resistência e ruptura | 2×10⁻⁴ | |
| borda 2D | mapa inicial, camada amorfa, difusão 2D, SPE e RTA | 10⁻⁶ | até duas células no limiar exato podem divergir pela aproximação do erf |
| implantação a 30 keV | tabela contra 10⁵ íons | Rp em 0,5 nm, ΔRp em 2 %, dose retida em 0,5 % | ver a nota sobre a camada amorfa |
| implantação a 42 keV | tabela interpolada contra uma rodada nova do RustBCA | Rp em 1 %, níveis do perfil em 2,5 nm | no flanco íngreme o erro relativo da concentração exagera, então o teste compara a profundidade dos níveis |
| índices de Sobol | função de Ishigami | 0,05 | contra os valores analíticos |

## Achados da validação

**Camada amorfa.** O fim da camada amorfa diferia 2,5 nm entre o porte e o Python a 30 keV. A causa está no gfetsim em Python. O critério usa o máximo da perda nuclear num histograma de 0,5 nm com 10⁵ íons, que tem cerca de 5 % de ruído por faixa, e nesta rodada o máximo caiu num pico de ruído na primeira faixa junto à superfície. Com a perda suavizada em 3,5 nm o Python dá o mesmo resultado que o porte dentro de 1 nm. A recomendação para o pacote em Python está no pendencias.md.

**Constantes.** O params.yaml diz CODATA 2018, mas o scipy 1.18 usado pelo gfetsim já traz o CODATA 2022. ε₀ e m₀ mudam menos de 10⁻⁹ relativo. O estúdio usa os valores do scipy para concordar com o Python.

**Integrador da oxidação.** A diferença de até 7×10⁻⁶ na espessura vinha do LSODA com a tolerância padrão, não do porte.
