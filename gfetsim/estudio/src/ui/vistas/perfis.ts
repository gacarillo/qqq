/** Vista Perfis: os perfis 1D do centro da janela em cada etapa e as grandezas derivadas. */
import { h } from "../dom";
import { painel, seletor, alternador } from "../componentes";
import { br, sci } from "../formato";
import { loja, melhorResultado } from "@/estado/app";
import { Grafico, type Serie } from "@/visual/grafico/grafico";
import { trapz, maximo } from "@/nucleo/numerico";
import type { ResultadoCadeia } from "@/fisica/cadeia";
import type { Vista } from "./tipos";

function profundidade(x: ArrayLike<number>, C: ArrayLike<number>, nivel: number): number {
  let k0 = 0;
  for (let k = 1; k < C.length; k++) if (C[k] > C[k0]) k0 = k;
  for (let k = k0; k < C.length; k++) if (C[k] < nivel) return k === 0 ? 0 : x[k - 1] + ((Math.log10(C[k - 1]) - Math.log10(nivel)) / (Math.log10(C[k - 1]) - Math.log10(Math.max(C[k], 1)))) * (x[k] - x[k - 1]);
  return x[x.length - 1];
}

function dose(x: ArrayLike<number>, C: ArrayLike<number>): number {
  return trapz(C, Float64Array.from(x as ArrayLike<number>, (v) => v * 1e-7));
}

export function vistaPerfis(): Vista {
  const gP = h("div"), gF = h("div"), gR = h("div"), gT = h("div");
  const graf = new Grafico(gP, { x: { rotulo: "profundidade (nm)", min: 0, max: 300 }, y: { rotulo: "concentração de P (cm⁻³)", log: true, min: 1e15, max: 1e22 }, razao: 0.5, alturaMin: 260, alturaMax: 460 });
  const grafFn = new Grafico(gF, { x: { rotulo: "profundidade (nm)", min: 0, max: 150 }, y: { rotulo: "energia nuclear (eV/cm³)", log: true }, razao: 0.62, alturaMin: 220, alturaMax: 340 });
  const grafRec = new Grafico(gR, { x: { rotulo: "profundidade (nm)", min: 0, max: 300 }, y: { rotulo: "concentração (cm⁻³)", log: true, min: 1e15, max: 1e22 }, razao: 0.62, alturaMin: 220, alturaMax: 340 });
  const grafT = new Grafico(gT, { x: { rotulo: "tempo na etapa (s)" }, y: { rotulo: "profundidade a 10¹⁸ (nm)" }, y2: { rotulo: "fração ativa (%)", min: 0, max: 100 }, razao: 0.62, alturaMin: 220, alturaMax: 340 });
  const estado = { etapas: { implante: true, spe: false, quente: true, oxidacao: true }, ativo: true, quadro: 0 };
  const tabela = h("div", { class: "tabela-rolagem" });
  const faixa = h("input", { type: "range", min: 0, max: 0, value: 0, step: 1, id: "perf-quadro", "aria-label": "quadro do recozimento" });
  const rotQuadro = h("span", { class: "nota" });
  faixa.addEventListener("input", () => {
    estado.quadro = +faixa.value;
    desenharRec();
  });
  const alts = (Object.keys(estado.etapas) as (keyof typeof estado.etapas)[]).map((k) =>
    alternador({ implante: "implantado", spe: "após a SPE", quente: "após o recozimento", oxidacao: "após a oxidação" }[k], estado.etapas[k], (v) => { estado.etapas[k] = v; desenhar(); }).el);
  const altAtivo = alternador("mostrar o P ativo", true, (v) => { estado.ativo = v; desenhar(); }).el;
  const selEixo = seletor({ valor: "300", opcoes: [["100", "até 100 nm"], ["300", "até 300 nm"], ["600", "até 600 nm"]], aoMudar: (v) => { graf.o.x.max = +v; graf.resetarZoom(); }, id: "perf-eixo" });

  const el = h(
    "div",
    { class: "vista", id: "vista-perfis" },
    painel("Perfil de P no centro da janela", h("div", { class: "pilha" }, h("div", { class: "barra-ferramentas" }, ...alts, altAtivo, selEixo.el), gP, h("p", { class: "nota" }, "Arraste para aproximar, duplo clique volta. Pontos são o histograma do RustBCA; linhas cheias são P total e as tracejadas P ativo. Cenários fixados pelo menu Projeto aparecem em outras cores.")),
    ),
    h("div", { class: "grade-2" },
      painel("Dano do implante e camada amorfa", h("div", { class: "pilha" }, gF, h("p", { class: "nota" }, "A região amorfa é onde a energia nuclear por volume passa do limiar, que é a energia no pico quando a dose é a dose limiar medida a 300 K (A2)."))),
      painel("Resumo por etapa", tabela),
    ),
    h("div", { class: "grade-2" },
      painel("Perfil ao longo do recozimento", h("div", { class: "pilha" }, h("div", { class: "barra-ferramentas" }, faixa, rotQuadro), gR)),
      painel("Junção e ativação no tempo", gT),
    ),
  );

  function seriesEtapas(res: ResultadoCadeia, prefixo = "", cor?: string, tracoBase?: number[]): Serie[] {
    const s: Serie[] = [];
    const add = (nome: string, x: ArrayLike<number>, C: ArrayLike<number>, A: ArrayLike<number> | null, c: string) => {
      s.push({ nome: `${prefixo}${nome}, total`, x, y: C, cor: cor ?? c, unidade: "cm⁻³", tracejado: tracoBase });
      if (A && estado.ativo) s.push({ nome: `${prefixo}${nome}, ativo`, x, y: A, cor: cor ?? c, tracejado: [5, 4], unidade: "cm⁻³" });
    };
    const im = res.implante, rz = res.recozimento, ox = res.oxidacao;
    if (estado.etapas.implante) add("implantado", im.x_nm, im.C_cm3, null, "var(--s5)");
    const spe = rz.quadros.filter((q) => q.etapa === "SPE").at(-1);
    if (estado.etapas.spe && spe) add("após a SPE", rz.estado.x_nm, spe.C, spe.ativo, "var(--s4)");
    if (estado.etapas.quente) add("após o recozimento", rz.estado.x_nm, rz.estado.C, rz.estado.ativo, "var(--s2)");
    if (estado.etapas.oxidacao && ox.metodo === "termico") add("após a oxidação", ox.estado.x_nm, ox.estado.C, ox.estado.ativo, "var(--s1)");
    return s;
  }

  function desenhar(): void {
    const res = melhorResultado();
    if (!res) return;
    const im = res.implante;
    const series = seriesEtapas(res);
    if (estado.etapas.implante) {
      const hx: number[] = [], hy: number[] = [];
      for (let i = 0; i < im.hist_C_cm3.length; i += 4) if (im.hist_C_cm3[i] > 0) {
        hx.push(im.x_nm[i]);
        hy.push(im.hist_C_cm3[i]);
      }
      series.push({ nome: "histograma do RustBCA", x: hx, y: hy, cor: "var(--s5)", tipo: "pontos", raio: 1.8, legenda: true });
    }
    for (const c of loja.get().comparacao) {
      const o = c.resultado.oxidacao.metodo === "termico" ? c.resultado.oxidacao.estado : c.resultado.recozimento.estado;
      series.push({ nome: `${c.nome}, ativo final`, x: o.x_nm, y: o.ativo, cor: c.cor, tracejado: [2, 3], unidade: "cm⁻³" });
    }
    const rz = res.recozimento;
    graf.definir({
      series,
      marcas: [
        { eixo: "y", valor: rz.n_e, cor: "var(--p-ativo)", rotulo: `n_e(${rz.etapas.at(-1)!.T_C} °C)` },
        { eixo: "y", valor: rz.C_sat, cor: "var(--p-inativo)", rotulo: "C_sat" },
        { eixo: "x", valor: im.momentos.media, cor: "var(--texto-3)", rotulo: `Rp ${br(im.momentos.media, 1)} nm` },
      ],
      regioes: im.amorfo_nm ? [{ eixo: "x", de: im.amorfo_nm[0], ate: im.amorfo_nm[1], cor: "var(--texto-3)", alfa: 0.12, rotulo: "amorfo" }] : [],
    });
    // dano
    const E = Float64Array.from(im.Fn_eV_cm, (v) => v * im.dose_cm2);
    const lim = maximo(im.Fn_eV_cm) * im.dose_limiar;
    grafFn.definir({
      series: [{ nome: "energia nuclear depositada", x: im.x_nm, y: E, cor: "var(--s2)", tipo: "area", unidade: "eV/cm³" }],
      marcas: [{ eixo: "y", valor: lim, cor: "var(--erro)", rotulo: `limiar, ${sci(im.dose_limiar, 1)} cm⁻² no pico` }],
      regioes: im.amorfo_nm ? [{ eixo: "x", de: im.amorfo_nm[0], ate: im.amorfo_nm[1], cor: "var(--texto-3)", alfa: 0.14, rotulo: "amorfo" }] : [],
    });
    // tabela
    const linhas: [string, ArrayLike<number>, ArrayLike<number>, ArrayLike<number> | null, number | null][] = [
      ["implantado", im.x_nm, im.C_cm3, null, null],
      ["após o recozimento", rz.estado.x_nm, rz.estado.C, rz.estado.ativo, rz.Rs_ohm_sq],
    ];
    if (res.oxidacao.metodo === "termico") linhas.push(["após a oxidação", res.oxidacao.estado.x_nm, res.oxidacao.estado.C, res.oxidacao.estado.ativo, res.oxidacao.Rs_ohm_sq]);
    tabela.replaceChildren(h("table", { class: "tabela" },
      h("thead", null, h("tr", null, ...["etapa", "dose total", "dose ativa", "pico", "a 10¹⁸ cm⁻³", "Rs"].map((t) => h("th", null, t)))),
      h("tbody", null, ...linhas.map(([n, x, C, A, Rs]) => h("tr", null,
        h("td", null, n), h("td", { class: "dado" }, `${sci(dose(x, C), 2)} cm⁻²`), h("td", { class: "dado" }, A ? `${sci(dose(x, A), 2)} cm⁻²` : "nenhuma"),
        h("td", { class: "dado" }, `${sci(maximo(C), 2)}`), h("td", { class: "dado" }, `${br(profundidade(x, A ?? C, 1e18), 1)} nm`), h("td", { class: "dado" }, Rs ? `${br(Rs, 1)} Ω/□` : "n/d"),
      ))),
    ), h("p", { class: "nota", style: "margin-top:8px" }, `A profundidade a 10¹⁸ usa o P ativo depois do implante. Rs usa a mobilidade de Masetti com parâmetros provisórios [I]. Cálculo em ${res.borda ? "1D e 2D" : "1D"}.`));
    faixa.max = String(Math.max(0, rz.quadros.length - 1));
    if (estado.quadro > rz.quadros.length - 1) estado.quadro = rz.quadros.length - 1;
    desenharRec();
    // evolução
    const quentes = rz.quadros.filter((q) => q.etapa !== "SPE");
    grafT.definir({
      series: [
        { nome: "profundidade do P ativo a 10¹⁸", x: quentes.map((q) => q.t_s), y: quentes.map((q) => profundidade(rz.estado.x_nm, q.ativo, 1e18)), cor: "var(--s1)", unidade: "nm" },
        { nome: "fração ativa", x: quentes.map((q) => q.t_s), y: quentes.map((q) => (100 * dose(rz.estado.x_nm, q.ativo)) / dose(rz.estado.x_nm, q.C)), cor: "var(--s3)", eixo: "y2", unidade: "%" },
      ],
    });
  }

  function desenharRec(): void {
    const res = melhorResultado();
    if (!res) return;
    const rz = res.recozimento;
    const q = rz.quadros[estado.quadro];
    if (!q) return;
    faixa.value = String(estado.quadro);
    rotQuadro.textContent = `${q.etapa} a ${q.T_C} °C, ${q.t_s >= 120 ? `${br(q.t_s / 60, 1)} min` : `${br(q.t_s, 1)} s`}${q.frenteAmorfa_nm !== null ? `, frente amorfa em ${br(q.frenteAmorfa_nm, 1)} nm` : ""}`;
    grafRec.definir({
      series: [
        { nome: "P total", x: rz.estado.x_nm, y: q.C, cor: "var(--p-inativo)", unidade: "cm⁻³" },
        { nome: "P ativo", x: rz.estado.x_nm, y: q.ativo, cor: "var(--p-ativo)", unidade: "cm⁻³" },
      ],
      marcas: q.frenteAmorfa_nm !== null ? [{ eixo: "x", valor: q.frenteAmorfa_nm, cor: "var(--texto-3)", rotulo: "frente da SPE" }] : [{ eixo: "y", valor: rz.n_e, cor: "var(--p-ativo)", rotulo: "n_e" }],
    });
  }

  loja.assinar((n, a) => {
    if (n.resultado !== a.resultado || n.resultadoBorda !== a.resultadoBorda || n.comparacao !== a.comparacao) desenhar();
  });
  return {
    id: "perfis",
    titulo: "Perfis",
    el,
    ativar: desenhar,
    exportaveis: () => [
      { nome: "perfil de P por etapa", png: (e) => graf.png(e), svg: () => graf.svg(), csv: () => graf.csv() },
      { nome: "energia nuclear e camada amorfa", png: (e) => grafFn.png(e), svg: () => grafFn.svg(), csv: () => grafFn.csv() },
      { nome: "perfil no recozimento", png: (e) => grafRec.png(e), svg: () => grafRec.svg(), csv: () => grafRec.csv() },
      { nome: "junção e ativação no tempo", png: (e) => grafT.png(e), svg: () => grafT.svg(), csv: () => grafT.csv() },
    ],
    telaVideo: () => graf.canvas,
  };
}
