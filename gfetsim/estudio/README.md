# gfetsim estúdio

Aplicação de simulação do GFET de porta local que roda inteira no navegador. Os modelos do gfetsim foram portados para TypeScript e conferidos contra o pacote em Python por testes automáticos. A receita muda e a cadeia inteira é recalculada ao vivo, do implante de P ao transistor em operação.

## O que tem

| Vista | Conteúdo |
|---|---|
| Estrutura 2D | Corte na borda da máscara no estilo dos simuladores de processo, com mapa de cor e barra, isolinhas por década, malha, materiais, sonda, cortes vertical, lateral e livre, régua e linha do tempo do processo |
| Perfis | P total e ativo em cada etapa, histograma do RustBCA, energia nuclear contra o limiar de amorfização, evolução no recozimento e junção no tempo |
| Oxidação | Cinética acoplada com o fator de aceleração, ramos de Ho e Plummer, Nomura e sem aceleração, tempo até o alvo em função da temperatura, degrau de óxido na borda e P na interface |
| Dispositivo 3D | O GFET em Three.js da lâmina à operação, com a CVD e a transferência pela receita da seção 2.4 do artigo, corte A−A′ e a face cortada colorida pelo perfil calculado |
| Elétrico | Transistor em operação com varredura de V_G, histerese e tunelamento, bandas da pilha pelo Poisson, C-V, transferência com 40 dispositivos sorteados, saída, campo, f_T e capacitância quântica |
| Átomos | Cascatas completas de três íons do RustBCA e o grafeno sobre SiO₂ amorfo com a densidade local da tensão de porta |
| Incerteza | Monte Carlo da cadeia em vários workers, histogramas com percentis, sensibilidade por postos de Spearman e índices de Sobol com intervalo por reamostragem |
| Parâmetros | O params.yaml inteiro com etiqueta, incerteza e fonte, filtros e sobrescrita de qualquer valor, e a tabela de referências conferidas |
| Relatório | Documento da receita com tabelas, figuras, origem dos valores e limitações, baixado como HTML autocontido |

Também há modo apresentação, exportação de toda figura em PNG de alta resolução e SVG vetorial, dados em CSV, vídeo WebM da vista, receitas salvas no navegador ou em arquivo JSON, cenários fixados para comparação, desfazer e refazer, tema claro e escuro e atalhos de teclado.

## Como rodar

```
cd gfetsim/estudio
npm install
npm run dev          # servidor local com recarga
npm run verificar    # tipos, lint e testes
npm run build        # dist/index.html, um arquivo só com tudo embutido
```

O `dist/index.html` abre direto no navegador, sem servidor. O Three.js vem do jsDelivr pelo mapa de importação e só carrega quando uma vista 3D abre; sem rede, as vistas 2D continuam funcionando.

## Atalhos

| Tecla | Ação |
|---|---|
| Ctrl e Enter | simular agora |
| Ctrl e Z, Ctrl, Shift e Z | desfazer e refazer a receita |
| Alt e um número de 1 a 9 | trocar de vista |
| setas na barra de abas | vista anterior e seguinte |
| duplo clique num gráfico ou no corte | voltar ao enquadramento original |
| Ctrl e roda do mouse no corte | aproximar e afastar |

## Dados gerados em Python

| Script | Gera | Quando rodar |
|---|---|---|
| `scripts/exportar_params.py` | `src/dados/params.json` e `referencias.json` | sempre que o params.yaml ou docs/referencias.md mudarem |
| `scripts/tabela_bca.py` | `src/dados/tabela_bca.json`, 91 rodadas do RustBCA | se mudar o RustBCA, as densidades ou a faixa da tabela; cerca de 25 min |
| `scripts/exportar_referencias.py` | `tests/fixtures/*.json` | sempre que um módulo do gfetsim mudar |

## Validação

Cada módulo portado tem teste que roda a mesma entrada no gfetsim em Python e no estúdio. O registro completo, com as tolerâncias e o porquê de cada uma, está em [docs/validacao.md](docs/validacao.md). A arquitetura está em [docs/arquitetura.md](docs/arquitetura.md).

## Limites

O estúdio herda todas as limitações do gfetsim listadas no pendencias.md do pacote. Acrescenta duas. A implantação vem de uma tabela do RustBCA com 2×10⁴ íons por ponto, interpolada entre 5 e 100 keV, 0 e 5 nm de óxido nativo e 0 e 15° de inclinação; fora disso o cálculo é recusado. As cascatas atômicas são as da receita do params.yaml e não mudam com a energia escolhida.
