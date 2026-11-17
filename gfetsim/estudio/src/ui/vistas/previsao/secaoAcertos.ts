/**
 * Seção 7, o placar: para os lotes que tinham previsão guardada antes da medida,
 * quantas vezes a medida caiu nos intervalos de 68 e 95 %, o histograma do PIT e o
 * CRPS. É a prova de que a previsão do futuro vale alguma coisa, ou o aviso de que não.
 */
import { h } from "../../dom";
import { painel, metrica } from "../../componentes";
import { br } from "../../formato";
import { Grafico } from "@/visual/grafico/grafico";
import { NOME_SAIDA } from "@/previsao/emulador";
import { placar, wilson } from "@/previsao/caderno";
import { lojaPrev, fmtSaida, fmtPct, COR } from "./estado";

export function secaoAcertos(): { el: HTMLElement; atualizar: () => void } {
  const metricas = h("div", { class: "metricas prev-metricas" });
  const veredito = h("p", { class: "prev-veredito" });
  const tabela = h("div", { class: "tabela-rolagem", style: "max-height:360px" });
  const gZ = h("div");
  const gP = h("div");
  const gz = new Grafico(gZ, { x: { rotulo: "lote e saída" }, y: { rotulo: "erro em meias larguras do intervalo de 68 %", min: -4, max: 4 }, razao: 0.5, alturaMin: 220, alturaMax: 300, legenda: false });
  const gp = new Grafico(gP, { x: { rotulo: "PIT, posição da medida na preditiva", min: 0, max: 1 }, y: { rotulo: "lotes e saídas", min: 0 }, razao: 0.5, alturaMin: 220, alturaMax: 300, legenda: false });

  function atualizar(): void {
    const p = placar(lojaPrev.get().lotes);
    metricas.replaceChildren();
    if (!p.n) {
      veredito.textContent = "Ainda sem lotes com previsão guardada e medida. Na seção 4, guarde a previsão num lote antes de ir ao laboratório; depois entre as medidas dele. Cada par conta aqui.";
      tabela.replaceChildren();
      gz.definir({ series: [] });
      gp.definir({ series: [] });
      return;
    }
    const k68 = p.itens.filter((a) => a.dentro68).length;
    const k95 = p.itens.filter((a) => a.dentro95).length;
    const ic68 = wilson(k68, p.n);
    const ic95 = wilson(k95, p.n);
    metricas.append(
      metrica("comparações", String(p.n)),
      metrica("dentro do intervalo de 68 %", `${k68} de ${p.n}, ${fmtPct(p.cobertura68)}`, { dica: `esperado 68 %; intervalo de Wilson ${fmtPct(ic68[0])} a ${fmtPct(ic68[1])}`, alerta: 0.68 < ic68[0] || 0.68 > ic68[1] }),
      metrica("dentro do intervalo de 95 %", `${k95} de ${p.n}, ${fmtPct(p.cobertura95)}`, { dica: `esperado 95 %; intervalo de Wilson ${fmtPct(ic95[0])} a ${fmtPct(ic95[1])}`, alerta: 0.95 < ic95[0] || 0.95 > ic95[1] }),
      metrica("CRPS médio", br(p.crpsMedio, 3), { dica: "erro da preditiva inteira na escala transformada; menor é melhor e cai quando a previsão acerta e estreita" }),
    );
    const otimista = 0.68 > ic68[1] || 0.95 > ic95[1];
    const pessimista = 0.68 < ic68[0];
    veredito.textContent = p.n < 5
      ? "Poucas comparações para julgar; com menos de cinco, qualquer cobertura é compatível com uma previsão honesta."
      : otimista
        ? "As medidas caem fora dos intervalos mais do que deveriam. A previsão está confiante demais; aumente a discrepância de modelo no params.yaml ou reveja a física da saída que mais erra."
        : pessimista
          ? "As medidas caem dentro dos intervalos mais do que deveriam. A previsão está larga demais; a discrepância de modelo pode diminuir."
          : "A cobertura observada é compatível com a nominal. Por enquanto a previsão está calibrada.";
    const xs = p.itens.map((_, i) => i + 1);
    gz.o.x.ticks = xs.length <= 24 ? xs : undefined;
    gz.o.x.formato = (v: number) => {
      const a = p.itens[Math.round(v) - 1];
      return a && xs.length <= 24 ? a.loteNome.slice(0, 10) : String(Math.round(v));
    };
    gz.definir({
      series: [{ nome: "erro padronizado", x: xs, y: p.itens.map((a) => Math.max(-4, Math.min(4, a.z))), cor: COR.medido, tipo: "pontos", raio: 4.5 }],
      regioes: [{ eixo: "y", de: -1, ate: 1, cor: COR.posteriori, alfa: 0.15, rotulo: "68 %" }, { eixo: "y", de: -1.96, ate: 1.96, cor: COR.posteriori, alfa: 0.07, rotulo: "95 %" }],
      marcas: [{ eixo: "y", valor: 0, cor: "var(--texto-3)" }],
    });
    gp.definir({
      series: [{ nome: "PIT", x: p.pit.map((_, i) => (i + 0.5) / 10), y: p.pit, cor: COR.posteriori, tipo: "barras" }],
      marcas: [{ eixo: "y", valor: p.n / 10, cor: "var(--texto-3)", rotulo: "uniforme", tracejado: [4, 3] }],
    });
    tabela.replaceChildren(h("table", { class: "tabela" },
      h("thead", null, h("tr", null, h("th", null, "lote"), h("th", null, "saída"), h("th", null, "previsto, mediana [95 %]"), h("th", null, "medido"), h("th", null, ""))),
      h("tbody", null, ...p.itens.map((a) => h("tr", null,
        h("td", null, a.loteNome),
        h("td", null, NOME_SAIDA.get(a.s)?.rotulo ?? a.s),
        h("td", null, `${fmtSaida(a.s, a.p50)} [${fmtSaida(a.s, a.p2_5)}, ${fmtSaida(a.s, a.p97_5)}]`),
        h("td", null, h("b", null, fmtSaida(a.s, a.medido))),
        h("td", null, h("span", { class: `chip ${a.dentro68 ? "ok" : a.dentro95 ? "aviso" : "erro"}` }, a.dentro68 ? "dentro de 68 %" : a.dentro95 ? "dentro de 95 %" : "fora")),
      )))));
  }

  lojaPrev.observar((s) => s.lotes, () => atualizar(), false);
  const el = painel("7. Placar das previsões", h("div", { class: "pilha" },
    h("p", { class: "nota" }, "Só contam previsões guardadas antes da medida. Uma preditiva honesta põe 68 % das medidas no intervalo de 68 % e deixa o PIT plano; se o PIT tiver forma de U a previsão é estreita demais, se tiver forma de sino é larga demais."),
    metricas, veredito,
    h("div", { class: "grade-2" }, gZ, gP),
    tabela,
  ), [], { id: "prev-acertos" });
  atualizar();
  return { el, atualizar };
}
