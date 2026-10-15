# gfetsim

Simulação encadeada e calibrável da porta local implantada de um GFET (LME, PSI-EPUSP).

A cadeia segue a fabricação. Primeiro a implantação de P a 30 keV, 3e15 cm⁻², 7°. Depois o recozimento (550 °C seguido de RTA ou de forno) e a oxidação seca de porta, ou o óxido por sputtering do artigo. Por fim a eletrostática da pilha grafeno/SiO₂/Si n⁺. Cada número físico vem do `params.yaml`, com etiqueta de origem, fonte e incerteza.

* [P] publicado e conferido
* [C] cálculo próprio a partir de [P]
* [I] inferência ou valor lembrado sem fonte conferida
* [B] dado de bancada ou da receita

## Instalação

```
pip install -e .[dev]
```

O módulo 1 precisa do binário do RustBCA.

```
git clone https://github.com/lcpp-org/RustBCA && cd RustBCA && cargo build --release
export GFETSIM_RUSTBCA=$PWD/target/release/RustBCA
```

Os resultados do RustBCA ficam em cache em `dados/cache_bca/`, então os testes e o notebook rodam sem recompilar.

## Uso

```
gfetsim rodar exemplos/receita_padrao.yaml --saida resultados/
gfetsim mapa-oxido --T 800 1000 --t 1 600
gfetsim incerteza exemplos/receita_padrao.yaml -n 1000
gfetsim calibrar dados/sputtering_calibracao.csv --modelo sputtering
gfetsim params --provisorios
python exemplos/gerar_resultados.py --n 1000     # tudo o que o relatório usa
pytest                                           # validações (inclui as lentas)
pytest -m "not lento"                            # só as rápidas
```

A receita YAML escolhe a variante de cada etapa e os ramos. O campo `aceitar_provisorios` decide se os valores [I] podem ser usados. Sem ele, qualquer modelo que dependa de um valor null para com `ParametroAusente`.

## Estrutura

| pasta | conteúdo |
|---|---|
| `src/gfetsim/implantacao` | embrulho do RustBCA, Pearson IV e I, camada amorfa, máscara |
| `src/gfetsim/recozimento` | SPE, Fair e Tsai implícito, solubilidade de Solmi, desativação, Masetti |
| `src/gfetsim/oxidacao` | Deal e Grove, Massoud, Ho e Plummer, segregação com fronteira móvel |
| `src/gfetsim/eletrico` | Poisson com Fermi-Dirac, grafeno com poças de carga, Kim e Jiménez, ruptura e FN |
| `src/gfetsim/incerteza` | Monte Carlo por ramo e Sobol |
| `src/gfetsim/calibracao` | regressão do sputtering, mínimos quadrados ponderados, emcee |
| `dados/` | dados do artigo do usuário e modelos de CSV para as medidas |
| `exemplos/` | receita padrão e roteiro que gera todos os resultados |
| `notebooks/` | notebook que reproduz as figuras |
| `relatorio/` | relatório em Word e PDF |
| `docs/` | tabela de referências conferidas e notas de conferência |

## O que validou e o que não validou

O relatório e o `pendencias.md` trazem a lista completa. Em resumo, os módulos 2 (duas etapas), 5 e 6 validam contra dado publicado. O módulo 1 valida contra o limiar medido a 300 K, depois que o critério de baixa temperatura falhou. O alcance só fica dentro da discordância entre fontes. O módulo 3 não tem dado publicado acessível para validação quantitativa, e o módulo 4 tem validação numérica e de forma, sem curva medida comparável.
