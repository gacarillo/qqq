/**
 * Vista Incerteza: Monte Carlo da cadeia distribuído entre workers, com histogramas,
 * percentis, sensibilidade por correlação de postos e índices de Sobol. Cada rodada usa
 * a combinação de ramos da receita; ramos diferentes são rodadas diferentes.
 */
import { h } from "../dom";
import { painel, botao, campoNumerico, seletor, aviso } from "../componentes";
import { br, num, sci } from "../formato";
import { melhorResultado, registrar } from "@/estado/app";
import { Grafico } from "@/visual/grafico/grafico";
import { ExecucaoMC } from "@/trabalho/cliente";
import { amostrar, ENTRADAS, SAIDAS, resumir, spearman, planoSaltelli, indicesSobol, sobolBootstrap, type Amostra, type Saida, type NomeSaida, type NomeEntrada } from "@/fisica/incerteza/montecarlo";
import { Aleatorio } from "@/nucleo/aleatorio";
import { carregar } from "@/parametros/parametros";
import { NOMES_RAMO } from "@/fisica/receita";
import { resumo as resumoNominal } from "@/fisica/cadeia";
import { csvNum } from "../formato";
import type { Vista } from "./tipos";

const CURTO: Record<NomeEntrada, string> = {
  energia: "energia", dose: "dose", inclinacao: "inclinação", oxido_nativo: "óxido nativo", dose_limiar: "limiar amorfo", fator_ne: "fator n_e", fator_spe: "aceleração SPE",
  T_rta: "T do RTA", T_spe: "T da SPE", Q_f: "carga fixa", n_estrela: "n*", n_dop: "dopagem resid.", vF: "v_F", mu_grafeno: "mobilidade",
};

export function vistaIncerteza(): Vista {
  const P = carregar(true);
  const est = { n: 200, semente: 7, saida: "Rs_final" as NomeSaida, entrada: "dose" as NomeEntrada, nSobol: 16 };
  let exec: ExecucaoMC | null = null;
  let entradas: Amostra[] = [];
  let saidas: (Saida | null)[] = [];
  let concluidas = 0;
  let inicio = 0;
  let ramos = "";
  let sobol: { S1: number[]; ST: number[]; ic: { S1: [number, number][]; ST: [number, number][] }; saida: NomeSaida } | null = null;
  const gH = h("div"), gT = h("div"), gD = h("div"), gS = h("div");
  const hist = new Grafico(gH, { x: { rotulo: "valor" }, y: { rotulo: "amostras", min: 0 }, razao: 0.55, alturaMin: 220, alturaMax: 340, legenda: false });
  const rotuloEntrada = (v: number) => {
    const k = Math.round(v) - 1;
    return k >= 0 && k < ENTRADAS.length && Math.abs(v - Math.round(v)) < 1e-6 ? CURTO[ENTRADAS[k][0]] : "";
  };
  const torn = new Grafico(gT, { x: { rotulo: "correlação de postos de Spearman", min: -1, max: 1 }, y: { rotulo: "entrada", min: 0.4, max: ENTRADAS.length + 0.6, formato: rotuloEntrada, ticks: ENTRADAS.map((_, k) => k + 1) }, razao: 0.8, alturaMin: 320, alturaMax: 460, legenda: false, margemEsquerda: 128 });
  const disp = new Grafico(gD, { x: { rotulo: "entrada" }, y: { rotulo: "saída" }, razao: 0.62, alturaMin: 220, alturaMax: 340, legenda: false });
  const gSob = new Grafico(gS, { x: { rotulo: "índice de Sobol", min: 0, max: 1 }, y: { rotulo: "entrada", min: 0.4, max: ENTRADAS.length + 0.6, formato: rotuloEntrada, ticks: ENTRADAS.map((_, k) => k + 1) }, razao: 0.8, alturaMin: 320, alturaMax: 460, margemEsquerda: 128 });
  const tabela = h("div", { class: "tabela-rolagem", style: "max-height:420px" });
  const estado = h("div", { class: "barra-ferramentas" });
  const cN = campoNumerico({ rotulo: "Amostras", valor: est.n, min: 20, max: 2000, log: true, casas: 0, aoMudar: (v) => (est.n = Math.round(v)), id: "mc-n" });
  const cS = campoNumerico({ rotulo: "Semente", valor: est.semente, min: 1, max: 9999, passo: 1, casas: 0, aoMudar: (v) => (est.semente = Math.round(v)), id: "mc-semente" });
  const sSaida = seletor<NomeSaida>({ rotulo: "Saída", valor: est.saida, opcoes: SAIDAS.map(([k, n]) => [k, n]), aoMudar: (v) => { est.saida = v; desenhar(); }, id: "mc-saida" });
  const sEnt = seletor<NomeEntrada>({ rotulo: "Entrada no gráfico de dispersão", valor: est.entrada, opcoes: ENTRADAS.map(([k, , n]) => [k, n]), aoMudar: (v) => { est.entrada = v; desenhar(); }, id: "mc-entrada" });
  const cSob = campoNumerico({ rotulo: "Base do Sobol", valor: est.nSobol, min: 8, max: 256, log: true, casas: 0, aoMudar: (v) => (est.nSobol = Math.round(v)), id: "mc-sobol", dica: `custa base × ${ENTRADAS.length + 2} avaliações da cadeia` });
  const btRodar = botao("Rodar o Monte Carlo", () => rodar(), { primario: true, icone: "tocar", id: "mc-rodar" });
  const btParar = botao("Parar", () => parar(), { id: "mc-parar" });
  const btSobol = botao("Calcular índices de Sobol", () => rodarSobol(), { id: "mc-sobol-rodar" });
  const el = h(
    "div",
    { class: "vista", id: "vista-incerteza" },
    painel("Monte Carlo da cadeia", h("div", { class: "pilha" },
      h("div", { class: "grade-3" }, cN.el, cS.el, cSob.el),
      h("div", { class: "barra-ferramentas" }, btRodar, btParar, btSobol, estado),
      h("p", { class: "nota" }, `Cada amostra sorteia as ${ENTRADAS.length} entradas com incerteza declarada no params.yaml e roda a cadeia inteira, do implante ao C-V, com a combinação de ramos da receita. As varreduras (temperaturas do forno e da oxidação, resistividade do substrato) não são sorteadas. Para outro ramo, troque na receita e rode de novo.`),
    )),
    h("div", { class: "grade-2" },
      painel("Distribuição da saída", h("div", { class: "pilha" }, sSaida.el, gH)),
      painel("Sensibilidade por postos", gT),
    ),
    h("div", { class: "grade-2" },
      painel("Dispersão", h("div", { class: "pilha" }, sEnt.el, gD)),
      painel("Índices de Sobol da saída escolhida", h("div", { class: "pilha" }, gS, h("p", { class: "nota" }, "Primeira ordem pelo estimador de Saltelli e total pelo de Jansen, com intervalo de 95 % por reamostragem. Com base pequena os intervalos são largos; use para ordenar, não para ler a terceira casa."))),
    ),
    painel("Resumo de todas as saídas", tabela),
  );

  function rodar(): void {
    const res = melhorResultado();
    if (!res) return aviso("espere a cadeia nominal terminar", "erro");
    parar();
    const r = res.receita;
    entradas = amostrar(P, r, est.n, new Aleatorio(est.semente));
    saidas = new Array(est.n).fill(null);
    concluidas = 0;
    inicio = performance.now();
    ramos = [r.implante.variante === "A_mascara" ? "variante A" : "variante B", r.recozimento.variante === "A_rta" ? "RTA" : `forno ${r.recozimento.T_forno_C} °C`, NOMES_RAMO[r.recozimento.ramoDesativacao], r.oxidacao.metodo === "termico" ? `${NOMES_RAMO[r.oxidacao.ramoAceleracao]} a ${r.oxidacao.T_C} °C` : "óxido depositado", r.eletrico.sinalDop < 0 ? "dopagem p" : "dopagem n"].join(", ");
    registrar("info", `Monte Carlo com ${est.n} amostras, ramos ${ramos}`);
    let ultimo = 0;
    exec = new ExecucaoMC(r, res.oxidacao.t_min, entradas, (i, s) => {
      saidas[i] = s;
      concluidas++;
      if (performance.now() - ultimo > 400) {
        ultimo = performance.now();
        desenhar();
      }
    }, () => {
      exec = null;
      registrar("ok", `Monte Carlo concluído em ${br((performance.now() - inicio) / 1000, 1)} s, ${saidas.filter((s) => !s).length} falhas`);
      desenhar();
    });
    desenhar();
  }

  function parar(): void {
    exec?.parar();
    exec = null;
  }

  function rodarSobol(): void {
    const res = melhorResultado();
    if (!res) return;
    parar();
    const r = res.receita;
    const plano = planoSaltelli(P, r, est.nSobol, new Aleatorio(est.semente + 1000));
    const todas = [...plano.A, ...plano.B, ...plano.AB.flat()];
    const sai: (Saida | null)[] = new Array(todas.length).fill(null);
    const alvo = est.saida;
    inicio = performance.now();
    registrar("info", `Sobol com base ${est.nSobol}, ${todas.length} avaliações`);
    let feitas = 0;
    exec = new ExecucaoMC(r, res.oxidacao.t_min, todas, (i, s) => {
      sai[i] = s;
      feitas++;
      estado.replaceChildren(h("span", { class: "chip" }, `Sobol ${feitas} de ${todas.length}`));
    }, () => {
      exec = null;
      const N = est.nSobol;
      const val = (k: number) => sai[k]?.[alvo] ?? NaN;
      const fA = Array.from({ length: N }, (_, j) => val(j)), fB = Array.from({ length: N }, (_, j) => val(N + j));
      const fAB = ENTRADAS.map((_, i) => Array.from({ length: N }, (_, j) => val(2 * N + i * N + j)));
      const ok = fA.every(Number.isFinite) && fB.every(Number.isFinite) && fAB.every((f) => f.every(Number.isFinite));
      if (!ok) {
        aviso("algumas avaliações do Sobol falharam; aumente a base ou veja o console", "erro");
        return;
      }
      const s = indicesSobol(fA, fB, fAB);
      sobol = { ...s, ic: sobolBootstrap(fA, fB, fAB, 300), saida: alvo };
      registrar("ok", `Sobol concluído em ${br((performance.now() - inicio) / 1000, 1)} s`);
      desenhar();
    });
  }

  function histograma(v: number[], nb: number): { x: Float64Array; y: Float64Array } {
    const lo = Math.min(...v), hi = Math.max(...v);
    const w = (hi - lo) / nb || 1;
    const y = new Float64Array(nb);
    for (const a of v) y[Math.min(nb - 1, Math.floor((a - lo) / w))]++;
    return { x: Float64Array.from({ length: nb }, (_, k) => lo + (k + 0.5) * w), y };
  }

  function desenhar(): void {
    const validos = saidas.map((s, i) => [s, entradas[i]] as const).filter(([s]) => s !== null) as [Saida, Amostra][];
    const rodando = exec !== null;
    estado.replaceChildren(...[
      h("span", { class: `chip ${rodando ? "aviso" : concluidas ? "ok" : ""}` }, rodando ? `${concluidas} de ${saidas.length}` : concluidas ? `${validos.length} amostras` : "sem rodada"),
      ramos ? h("span", { class: "chip" }, ramos) : null,
      concluidas ? h("span", { class: "chip" }, `${br((performance.now() - inicio) / 1000, 1)} s`) : null,
    ].filter((x): x is HTMLSpanElement => x !== null));
    if (validos.length < 3) return;
    const nomeS = SAIDAS.find((s) => s[0] === est.saida)!;
    const v = validos.map(([s]) => s[est.saida]).filter(Number.isFinite);
    const R = resumir(v);
    const hs = histograma(v, Math.max(8, Math.min(40, Math.round(Math.sqrt(v.length)))));
    hist.o.x.rotulo = `${nomeS[1]}${nomeS[2] ? ` (${nomeS[2]})` : ""}`;
    const nominal = melhorResultado();
    hist.definir({
      series: [{ nome: "amostras", x: hs.x, y: hs.y, cor: "var(--s1)", tipo: "barras" }],
      regioes: [{ eixo: "x", de: R.p2_5, ate: R.p97_5, cor: "var(--s1)", alfa: 0.08, rotulo: "95 %" }],
      marcas: [
        { eixo: "x", valor: R.mediana, cor: "var(--texto)", rotulo: `mediana ${num(R.mediana, 4)}` },
        { eixo: "x", valor: R.p2_5, cor: "var(--texto-3)" },
        { eixo: "x", valor: R.p97_5, cor: "var(--texto-3)" },
        ...(nominal ? [] : []),
      ],
    });
    const corr = spearman(validos.map(([, a]) => a), validos.map(([s]) => s));
    const cs = ENTRADAS.map(([e]) => corr[est.saida][e]);
    torn.definir({
      // barras horizontais de 0 até a correlação, laranja positivas e azuis negativas
      series: cs.map((c, k) => ({ nome: ENTRADAS[k][0], x: [0, c], y: [k + 1, k + 1], cor: c >= 0 ? "var(--s2)" : "var(--s1)", largura: 11, legenda: false })),
      marcas: [{ eixo: "x", valor: 0, cor: "var(--texto-3)" }],
    });
    const nomeE = ENTRADAS.find((e) => e[0] === est.entrada)!;
    disp.o.x.rotulo = nomeE[2];
    disp.o.y.rotulo = nomeS[1];
    disp.definir({ series: [{ nome: "amostras", x: validos.map(([, a]) => a[est.entrada]), y: validos.map(([s]) => s[est.saida]), cor: "var(--s5)", tipo: "pontos", raio: 2.6 }] });
    if (sobol && sobol.saida === est.saida) {
      gSob.definir({
        series: [
          { nome: "primeira ordem S1", x: sobol.S1, y: ENTRADAS.map((_, k) => k + 0.85), cor: "var(--s3)", tipo: "pontos", raio: 4 },
          { nome: "total ST", x: sobol.ST, y: ENTRADAS.map((_, k) => k + 1.15), cor: "var(--s4)", tipo: "pontos", raio: 4 },
          ...ENTRADAS.map((_, k) => ({ nome: `ic ${k}`, x: sobol!.ic.ST[k], y: [k + 1.15, k + 1.15], cor: "var(--s4)", largura: 1.5, legenda: false })),
          ...ENTRADAS.map((_, k) => ({ nome: `ic1 ${k}`, x: sobol!.ic.S1[k], y: [k + 0.85, k + 0.85], cor: "var(--s3)", largura: 1.5, legenda: false })),
        ],
      });
    } else gSob.definir({ series: [] });
    tabela.replaceChildren(h("table", { class: "tabela" },
      h("thead", null, h("tr", null, ...["saída", "2,5 %", "mediana", "97,5 %", "média", "desvio", "nominal", "entrada mais influente"].map((t) => h("th", null, t)))),
      h("tbody", null, ...SAIDAS.map(([k, n, u]) => {
        const vals = validos.map(([s]) => s[k]).filter(Number.isFinite);
        const r = resumir(vals);
        const cc = ENTRADAS.map(([e]) => [e, corr[k][e]] as const).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
        const f = (x: number) => (Math.abs(x) >= 1e5 || (Math.abs(x) < 1e-2 && x !== 0) ? sci(x, 2) : num(x, 4));
        const influente = Math.abs(cc[1]) < 0.1 ? "nenhuma, saída quase constante" : `${CURTO[cc[0]]} (${br(cc[1], 2)})`;
        return h("tr", null, h("td", null, n, u ? ` (${u})` : ""), h("td", { class: "dado" }, f(r.p2_5)), h("td", { class: "dado" }, f(r.mediana)), h("td", { class: "dado" }, f(r.p97_5)), h("td", { class: "dado" }, f(r.media)), h("td", { class: "dado" }, f(r.desvio)), h("td", { class: "dado" }, nominal ? f(valorNominal(k)) : ""), h("td", null, influente));
      })),
    ));
  }

  function valorNominal(k: NomeSaida): number {
    const r = melhorResultado();
    if (!r) return NaN;
    const el2 = r.eletrico;
    let i5 = 0;
    for (let i = 0; i < el2.n_cm2.length; i++) if (Math.abs(el2.n_cm2[i] - 5e12) < Math.abs(el2.n_cm2[i5] - 5e12)) i5 = i;
    const mapa: Partial<Record<NomeSaida, number>> = {
      espessura_ox_nm: r.oxidacao.espessura_nm, Rs_final: r.oxidacao.Rs_ohm_sq, Rs_recozido: r.recozimento.Rs_ohm_sq, V_D: el2.V_D, ativo_superficie: r.oxidacao.estado.ativo[0],
      amorfo_nm: r.implante.amorfo_nm ? r.implante.amorfo_nm[1] : 0, perda_si_5e12: el2.perdaSi[i5], Rsq_grafeno_5e12: el2.R_quadrado_ohm[i5],
      fracao_ativa: resumoNominal(r).fracaoAtiva, C_min_sobre_Cox: resumoNominal(r).Cmin_sobre_Cox, E_ox_em_VD_mais_5V: resumoNominal(r).E_ox_VD5,
    };
    return mapa[k] ?? NaN;
  }

  function csv(): string {
    const cab = [...ENTRADAS.map((e) => e[0]), ...SAIDAS.map((s) => s[0])];
    const linhas = [cab.join(",")];
    saidas.forEach((s, i) => {
      if (!s) return;
      linhas.push([...ENTRADAS.map(([e]) => csvNum(entradas[i][e])), ...SAIDAS.map(([k]) => csvNum(s[k]))].join(","));
    });
    return `# Monte Carlo do gfetsim estúdio; ramos ${ramos}; semente ${est.semente}\n${linhas.join("\n")}`;
  }

  return {
    id: "incerteza",
    titulo: "Incerteza",
    el,
    ativar: desenhar,
    desativar() {
      /* o Monte Carlo continua rodando em segundo plano */
    },
    exportaveis: () => [
      { nome: "Monte Carlo, todas as amostras", csv },
      { nome: "distribuição da saída", png: (e) => hist.png(e), svg: () => hist.svg() },
      { nome: "sensibilidade por postos", png: (e) => torn.png(e), svg: () => torn.svg() },
      { nome: "índices de Sobol", png: (e) => gSob.png(e), svg: () => gSob.svg() },
    ],
  };
}

