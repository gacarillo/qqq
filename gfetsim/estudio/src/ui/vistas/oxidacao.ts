/** Vista Oxidação: cinética acoplada, ramos de aceleração, mapa T por tempo e o degrau na borda. */
import { h } from "../dom";
import { painel } from "../componentes";
import { br } from "../formato";
import { loja, melhorResultado } from "@/estado/app";
import { Grafico } from "@/visual/grafico/grafico";
import { carregar } from "@/parametros/parametros";
import * as cin from "@/fisica/oxidacao/cinetica";
import { linspace } from "@/nucleo/numerico";
import type { Vista } from "./tipos";

export function vistaOxidacao(): Vista {
  const g1 = h("div"), g2 = h("div"), g3 = h("div"), g4 = h("div");
  const gx = new Grafico(g1, { x: { rotulo: "tempo (min)", min: 0 }, y: { rotulo: "espessura do óxido (nm)", min: 0 }, y2: { rotulo: "fator de aceleração F", min: 0.8 }, razao: 0.55, alturaMin: 260, alturaMax: 420 });
  const gT = new Grafico(g2, { x: { rotulo: "temperatura (°C)" }, y: { rotulo: "tempo até o alvo (min)", log: true }, razao: 0.62, alturaMin: 220, alturaMax: 340 });
  const gB = new Grafico(g3, { x: { rotulo: "lateral y (nm)" }, y: { rotulo: "espessura do óxido (nm)", min: 0 }, razao: 0.62, alturaMin: 220, alturaMax: 340 });
  const gI = new Grafico(g4, { x: { rotulo: "profundidade a partir da interface (nm)", min: 0, max: 40 }, y: { rotulo: "P ativo (cm⁻³)", log: true, min: 1e17, max: 2e21 }, razao: 0.62, alturaMin: 220, alturaMax: 340 });
  const nota = h("p", { class: "nota" });
  const el = h(
    "div",
    { class: "vista", id: "vista-oxidacao" },
    painel("Crescimento do óxido de porta", h("div", { class: "pilha" }, g1, nota)),
    h("div", { class: "grade-2" },
      painel("Tempo até a espessura alvo", h("div", { class: "pilha" }, g2, h("p", { class: "nota" }, "Massoud com F constante. As curvas de F = 1 e F = 2,1 limitam os ramos; o ponto é a receita atual com o acoplamento completo."))),
      painel("Degrau de óxido na borda da porta", h("div", { class: "pilha" }, g3, h("p", { class: "nota" }, "Oxidação por coluna sobre o estado 2D recozido. Sobre o Si muito dopado da janela o óxido cresce mais rápido."))),
    ),
    painel("P ativo junto à interface", h("div", { class: "pilha" }, g4, h("p", { class: "nota" }, "Antes e depois da oxidação. No ramo de acúmulo clássico o P da fatia consumida volta ao Si (m ≥ 1000, R17)."))),
  );
  const P = carregar(true);

  function desenhar(): void {
    const res = melhorResultado();
    if (!res) return;
    const ox = res.oxidacao, rc = res.receita.oxidacao;
    if (ox.metodo !== "termico" || !ox.t_min) {
      nota.textContent = `Óxido depositado por sputtering, ${br(ox.espessura_nm, 1)} nm. Não consome Si nem segrega P, e a cinética térmica não se aplica.`;
      gx.definir({ series: [] });
      gB.definir({ series: [] });
      gI.definir({ series: [] });
    } else {
      const tMax = ox.t_min * 1.15;
      const ts = linspace(0, tMax, 120);
      const x1 = cin.espessura(P, rc.T_C, ts, 0, rc.modelo, 1);
      const x21 = cin.espessura(P, rc.T_C, ts, 0, rc.modelo, 2.1);
      const dg = cin.espessura(P, rc.T_C, ts, 0, "deal_grove", 1);
      gx.definir({
        series: [
          { nome: "acoplado, receita atual", x: ox.curva.t, y: ox.curva.x, cor: "var(--s1)", largura: 2.4, unidade: "nm" },
          { nome: "F = 1, Si leve (N10)", x: ts, y: x1, cor: "var(--texto-3)", tracejado: [5, 4], unidade: "nm" },
          { nome: "F = 2,1 (R23)", x: ts, y: x21, cor: "var(--s2)", tracejado: [5, 4], unidade: "nm" },
          { nome: "Deal e Grove, fora da faixa validada", x: ts, y: dg, cor: "var(--s4)", tracejado: [2, 3], unidade: "nm" },
          { nome: "fator F", x: ox.curva.t, y: ox.curva.F, cor: "var(--s3)", eixo: "y2" },
        ],
        marcas: [{ eixo: "y", valor: rc.alvo_nm, cor: "var(--texto-3)", rotulo: `alvo ${br(rc.alvo_nm, 1)} nm` }, { eixo: "x", valor: ox.t_min, cor: "var(--texto-3)", rotulo: `${br(ox.t_min, 1)} min` }],
      });
      nota.textContent = `Oxidação seca a ${rc.T_C} °C. A curva acoplada recalcula F a cada passo pelo P ativo na interface; ${br(ox.siConsumido_nm, 1)} nm de Si consumidos. Deal e Grove valem acima de 30 nm (R25) e aparecem só como referência.`;
      const borda = res.borda?.oxidacao;
      if (borda) {
        const y = res.borda!.grade.y;
        gB.definir({
          series: borda.map((q, k) => ({ nome: `${br(q.t_min, 1)} min`, x: y, y: q.xox, cor: ["var(--s5)", "var(--s4)", "var(--s2)", "var(--s3)", "var(--s1)"][k % 5], unidade: "nm" })),
          marcas: [{ eixo: "x", valor: 0, cor: "var(--texto-3)", rotulo: "borda da máscara" }],
        });
      } else gB.definir({ series: [{ nome: "sobre a porta", x: [-300, 400], y: [ox.espessura_nm, ox.espessura_nm], cor: "var(--s1)" }, { nome: "fora da porta, mesma duração", x: [-300, 400], y: [ox.espessuraCampo_nm, ox.espessuraCampo_nm], cor: "var(--s2)", tracejado: [5, 4] }] });
      const rz = res.recozimento.estado;
      gI.definir({
        series: [
          { nome: "antes da oxidação", x: rz.x_nm, y: rz.ativo, cor: "var(--s2)", unidade: "cm⁻³" },
          { nome: "depois da oxidação", x: ox.estado.x_nm, y: ox.estado.ativo, cor: "var(--s1)", unidade: "cm⁻³" },
          { nome: "P total depois", x: ox.estado.x_nm, y: ox.estado.C, cor: "var(--p-inativo)", tracejado: [4, 3], unidade: "cm⁻³" },
        ],
      });
    }
    // tempo até o alvo
    const Ts = linspace(800, 1000, 21);
    const t1 = Float64Array.from(Ts, (T) => cin.tempoPara(P, T, rc.alvo_nm, 0, rc.modelo, 1));
    const t2 = Float64Array.from(Ts, (T) => cin.tempoPara(P, T, rc.alvo_nm, 0, rc.modelo, 2.1));
    gT.definir({
      series: [
        { nome: "F = 1", x: Ts, y: t1, cor: "var(--texto-3)", unidade: "min" },
        { nome: "F = 2,1", x: Ts, y: t2, cor: "var(--s2)", unidade: "min" },
      ],
      pontos: ox.t_min ? [{ x: rc.T_C, y: ox.t_min, cor: "var(--s1)", rotulo: `${br(ox.t_min, 1)} min` }] : [],
    });
  }

  loja.assinar((n, a) => {
    if (n.resultado !== a.resultado || n.resultadoBorda !== a.resultadoBorda) desenhar();
  });
  return {
    id: "oxidacao",
    titulo: "Oxidação",
    el,
    ativar: desenhar,
    exportaveis: () => [
      { nome: "cinética de oxidação", png: (e) => gx.png(e), svg: () => gx.svg(), csv: () => gx.csv() },
      { nome: "tempo até o alvo", png: (e) => gT.png(e), svg: () => gT.svg(), csv: () => gT.csv() },
      { nome: "degrau de óxido na borda", png: (e) => gB.png(e), svg: () => gB.svg(), csv: () => gB.csv() },
      { nome: "P ativo na interface", png: (e) => gI.png(e), svg: () => gI.svg(), csv: () => gI.csv() },
    ],
  };
}
