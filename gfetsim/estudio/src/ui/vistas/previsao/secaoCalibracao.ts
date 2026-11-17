/**
 * Seção 3, a calibração: amostra a posteriori dos parâmetros com as medidas dos lotes e
 * mostra o que as medidas ensinaram. Priori contra posteriori de cada parâmetro, a
 * densidade conjunta de um par, os resíduos padronizados e o traço da cadeia.
 */
import { h } from "../../dom";
import { painel, botao, campoNumerico, seletor, aviso, metrica, legenda } from "../../componentes";
import { br, num, sci, tempo } from "../../formato";
import { registrar } from "@/estado/app";
import { Grafico } from "@/visual/grafico/grafico";
import { MapaCalor } from "@/visual/grafico/mapaCalor";
import { amostrarPrioriUnidade, type NomeCalib } from "@/previsao/espaco";
import { Aleatorio } from "@/nucleo/aleatorio";
import { lojaPrev, fila, emuladorAtual, rotuloGrandeza, COR, fmtPct } from "./estado";
import { histograma, serieDegrau, densidade2D, nivelDeMassa } from "./graficos";

export function secaoCalibracao(): { el: HTMLElement; atualizar: () => void } {
  const est = { passos: 3000, semente: 3, parA: "" as NomeCalib | "", parB: "" as NomeCalib | "" };
  const metricas = h("div", { class: "metricas prev-metricas" });
  const avisosEl = h("ul", { class: "lista-notas" });
  const pequenos = h("div", { class: "prev-multiplos" });
  const tabela = h("div", { class: "tabela-rolagem" });
  const gRes = h("div");
  const gTr = h("div");
  const gPar = h("div");
  const res = new Grafico(gRes, { x: { rotulo: "medida" }, y: { rotulo: "resíduo padronizado", min: -4, max: 4 }, razao: 0.5, alturaMin: 200, alturaMax: 280, legenda: false });
  const traco = new Grafico(gTr, { x: { rotulo: "passo" }, y: { rotulo: "log da posteriori, média dos caminhantes" }, razao: 0.45, alturaMin: 180, alturaMax: 260, legenda: false });
  const par = new MapaCalor(gPar, { rotulo: "densidade conjunta de dois parâmetros na posteriori", razao: 0.78, alturaMin: 260, alturaMax: 420 });
  const selA = seletor<string>({ rotulo: "Eixo x", valor: "", opcoes: [["", "escolha"]], aoMudar: (v) => { est.parA = v as NomeCalib; desenharPar(); }, id: "cal-par-a" });
  const selB = seletor<string>({ rotulo: "Eixo y", valor: "", opcoes: [["", "escolha"]], aoMudar: (v) => { est.parB = v as NomeCalib; desenharPar(); }, id: "cal-par-b" });
  const cP = campoNumerico({ rotulo: "Passos da cadeia", valor: est.passos, min: 300, max: 8000, log: true, casas: 0, aoMudar: (v) => (est.passos = Math.round(v)), id: "cal-passos" });
  const btCal = botao("Calibrar com as medidas", () => void calibrarAgora(), { primario: true, icone: "tocar", id: "cal-rodar" });
  const barra = h("div", { class: "prev-barra" }, h("i"));

  async function calibrarAgora(): Promise<void> {
    const s = lojaPrev.get();
    if (!s.emulador) return aviso("treine o emulador primeiro", "erro");
    lojaPrev.set({ calibrando: 0 });
    try {
      const r = await fila.executar(s.emulador.base, { op: "calibrar", emulador: s.emulador, lotes: s.lotes, passos: est.passos, semente: est.semente }, (f) => lojaPrev.set({ calibrando: f }));
      if (r.op !== "calibrar") return;
      lojaPrev.set({ calibracao: r.r, calibrando: null, previsao: null, plano: null, mapa: null });
      registrar("ok", `calibração com ${r.r.posterior.nTermos} medidas em ${tempo(r.r.ms / 1000)}`);
      r.r.avisos.forEach((a) => registrar("aviso", a));
      aviso("calibração pronta", "ok");
    } catch (e) {
      lojaPrev.set({ calibrando: null });
      aviso(`a calibração falhou: ${(e as Error).message}`, "erro");
    }
  }

  function fmtValor(nome: NomeCalib, v: number): string {
    const em = emuladorAtual();
    const c = em?.espaco.calib.find((x) => x.def.nome === nome);
    if (!c) return num(v, 3);
    return c.def.cientifico ? sci(v, 2) : br(v, c.def.casas);
  }

  function desenharPar(): void {
    const em = emuladorAtual();
    const c = lojaPrev.get().calibracao;
    if (!em || !c || !est.parA || !est.parB || est.parA === est.parB) {
      par.definir({ nx: 2, ny: 2, v: [0, 0, 0, 0], x: { rotulo: "escolha dois parâmetros", min: 0, max: 1 }, y: { rotulo: "", min: 0, max: 1 }, mapa: "viridis", faixa: [0, 1], rotuloBarra: "densidade relativa" });
      return;
    }
    const esp = em.espaco;
    const ja = esp.calib.findIndex((x) => x.def.nome === est.parA);
    const jb = esp.calib.findIndex((x) => x.def.nome === est.parB);
    if (ja < 0 || jb < 0) return;
    const S = c.posterior.S;
    const dc = c.posterior.dc;
    const a = Float64Array.from({ length: S }, (_, s) => c.posterior.amostras[s * dc + ja]);
    const b = Float64Array.from({ length: S }, (_, s) => c.posterior.amostras[s * dc + jb]);
    const n = 40;
    const g = densidade2D(a, b, n);
    const A = esp.calib[ja];
    const B = esp.calib[jb];
    const verdade = lojaPrev.get().lotes.find((l) => l.sintetico)?.sintetico?.verdade;
    const pontos = verdade && verdade[A.def.nome] !== undefined && verdade[B.def.nome] !== undefined ? [{ x: verdade[A.def.nome]!, y: verdade[B.def.nome]!, cor: "#ffffff", rotulo: "verdade do lote sintético", forma: "losango" as const }] : [];
    par.definir({
      nx: n, ny: n, v: g, mapa: "viridis", faixa: [0, 1], rotuloBarra: "densidade relativa",
      x: { rotulo: `${A.def.rotulo}${A.def.unidade ? ` (${A.def.unidade})` : ""}`, min: A.a, max: A.b, log: A.log },
      y: { rotulo: `${B.def.rotulo}${B.def.unidade ? ` (${B.def.unidade})` : ""}`, min: B.a, max: B.b, log: B.log },
      contornos: [{ nivel: nivelDeMassa(g, 0.68), cor: "#ffffff", rotulo: "68 %" }, { nivel: nivelDeMassa(g, 0.95), cor: "#ffffff", rotulo: "95 %", tracejado: [4, 3] }],
      pontos,
    });
  }

  function atualizar(): void {
    const s = lojaPrev.get();
    const em = emuladorAtual();
    const c = s.calibracao;
    btCal.disabled = !em || s.calibrando !== null;
    (barra.firstChild as HTMLElement).style.width = s.calibrando !== null ? `${100 * s.calibrando}%` : c ? "100%" : "0";
    metricas.replaceChildren();
    avisosEl.replaceChildren();
    pequenos.replaceChildren();
    if (!em) {
      tabela.replaceChildren(h("p", { class: "nota" }, "Treine o emulador para calibrar."));
      return;
    }
    const opcoes: [string, string][] = em.espaco.calib.map((x) => [x.def.nome, x.def.rotulo]);
    for (const [sel, atual, k] of [[selA, est.parA, 0], [selB, est.parB, 1]] as const) {
      sel.sel.replaceChildren(...opcoes.map(([v, t]) => h("option", { value: v }, t)));
      const escolhido = atual || opcoes[k]?.[0] || "";
      sel.sel.value = escolhido;
      if (k === 0) est.parA = escolhido as NomeCalib;
      else est.parB = escolhido as NomeCalib;
    }
    if (!c || c.nomes.join() !== em.espaco.calib.map((x) => x.def.nome).join()) {
      tabela.replaceChildren(h("p", { class: "nota" }, "Sem calibração para este emulador. Sem medidas, a previsão usa a priori do params.yaml; cada medida estreita o que o modelo acha possível."));
      res.definir({ series: [] });
      traco.definir({ series: [] });
      desenharPar();
      return;
    }
    const d = c.diagnostico;
    metricas.append(
      metrica("medidas usadas", String(c.posterior.nTermos)),
      metrica("amostras", String(c.posterior.S)),
      metrica("aceitação", d ? fmtPct(d.aceitacao) : "priori", { dica: "fração dos movimentos aceitos; entre 20 e 50 % é o usual no amostrador por conjunto" }),
      metrica("tamanho efetivo", d ? String(Math.round(d.ess)) : "sem cadeia", { dica: "amostras independentes equivalentes, pelo pior tempo de autocorrelação", alerta: !!d && d.ess < 200 }),
      metrica("R̂ máximo", d ? br(Math.max(...d.rhat), 3) : "sem cadeia", { dica: "abaixo de 1,05 as cadeias se misturaram", alerta: !!d && Math.max(...d.rhat) > 1.1 }),
      metrica("tempo", tempo(c.ms / 1000)),
    );
    for (const a of c.avisos) avisosEl.append(h("li", null, a));
    // priori contra posteriori, um gráfico pequeno por parâmetro
    const esp = em.espaco;
    esp.calib.forEach((cal, j) => {
      const S = c.posterior.S;
      const dc = c.posterior.dc;
      const pos = Float64Array.from({ length: S }, (_, s) => esp.vCalib(j, c.posterior.amostras[s * dc + j]));
      const nPri = 3000;
      const pri = new Float64Array(nPri);
      const rng = new Aleatorio(9 + j);
      for (let k = 0; k < nPri; k++) pri[k] = esp.vCalib(j, amostrarPrioriUnidade(cal.priori, rng));
      const hp = histograma(pri, cal.a, cal.b, 28, cal.log);
      const hq = histograma(pos, cal.a, cal.b, 28, cal.log);
      const caixa = h("div", { class: "prev-pequeno" });
      const g = new Grafico(caixa, { x: { rotulo: `${cal.def.rotulo}${cal.def.unidade ? ` (${cal.def.unidade})` : ""}`, log: cal.log && cal.b / cal.a > 20, min: cal.a, max: cal.b }, y: { rotulo: "densidade", min: 0 }, razao: 0.62, alturaMin: 150, alturaMax: 210, legenda: false });
      const verdade = s.lotes.find((l) => l.sintetico)?.sintetico?.verdade?.[cal.def.nome];
      g.definir({
        series: [serieDegrau(hp, "priori", COR.priori, { largura: 1.2 }), serieDegrau(hq, "posteriori", COR.posteriori, { tipo: "area", alfa: 0.35, largura: 1.6 })],
        marcas: verdade !== undefined ? [{ eixo: "x", valor: verdade, cor: COR.medido, rotulo: "verdade", tracejado: [3, 3] }] : [],
      });
      pequenos.append(caixa);
    });
    const linhas = c.resumo.map((r) => h("tr", null,
      h("td", null, r.rotulo),
      h("td", null, `${fmtValor(r.nome, r.priori.p50)} [${fmtValor(r.nome, r.priori.p2_5)}, ${fmtValor(r.nome, r.priori.p97_5)}]`),
      h("td", null, h("b", null, fmtValor(r.nome, r.posteriori.p50)), ` [${fmtValor(r.nome, r.posteriori.p2_5)}, ${fmtValor(r.nome, r.posteriori.p97_5)}]`),
      h("td", null, h("div", { class: "prev-medidor", "data-dica": "quanto a variância caiu em relação à priori" }, h("i", { style: `width:${Math.round(100 * r.encolhimento)}%` }), h("span", null, fmtPct(r.encolhimento)))),
    ));
    tabela.replaceChildren(h("table", { class: "tabela" },
      h("thead", null, h("tr", null, h("th", null, "parâmetro"), h("th", null, "priori, mediana [95 %]"), h("th", null, "posteriori, mediana [95 %]"), h("th", null, "o que as medidas ensinaram"))),
      h("tbody", null, ...linhas)));
    // resíduos
    const xs = c.residuos.map((_, i) => i + 1);
    res.o.x.ticks = xs;
    res.o.x.formato = (v: number) => {
      const r = c.residuos[Math.round(v) - 1];
      if (!r) return "";
      return rotuloGrandeza(r.grandeza).split(" ")[0];
    };
    res.definir({
      series: [{ nome: "resíduo", x: xs, y: c.residuos.map((r) => Math.max(-4, Math.min(4, r.z))), cor: COR.medido, tipo: "pontos", raio: 4 }],
      regioes: [{ eixo: "y", de: -1, ate: 1, cor: COR.posteriori, alfa: 0.14, rotulo: "68 %" }, { eixo: "y", de: -2, ate: 2, cor: COR.posteriori, alfa: 0.07 }],
      marcas: [{ eixo: "y", valor: 0, cor: "var(--texto-3)" }],
    });
    traco.definir({
      series: [{ nome: "log da posteriori", x: c.tracoLogp.map((_, i) => i), y: c.tracoLogp, cor: COR.posteriori, largura: 1.2 }],
      marcas: d ? [{ eixo: "x", valor: d.descarte, cor: "var(--texto-3)", rotulo: "fim do descarte", tracejado: [4, 3] }] : [],
    });
    desenharPar();
  }

  lojaPrev.observar((s) => s.calibracao, () => atualizar(), false);
  lojaPrev.observar((s) => s.calibrando, () => {
    const f = lojaPrev.get().calibrando;
    (barra.firstChild as HTMLElement).style.width = f !== null ? `${100 * f}%` : lojaPrev.get().calibracao ? "100%" : "0";
    btCal.disabled = f !== null;
  }, false);
  lojaPrev.observar((s) => s.emulador, () => atualizar(), false);

  const el = painel("3. Calibração bayesiana", h("div", { class: "pilha" },
    h("p", { class: "nota" }, "Amostrador por conjunto de Goodman e Weare sobre o emulador. A verossimilhança soma, em quadratura, o erro da medida, o erro do emulador, a discrepância de modelo do params.yaml e a dispersão do equipamento. Resíduos fora de ±2 em muitas medidas dizem que o modelo não explica o laboratório, e aí o certo é rever a física, não apertar a calibração."),
    h("div", { class: "barra-ferramentas" }, cP.el, btCal),
    barra,
    metricas,
    avisosEl,
    tabela,
    h("div", null, legenda([{ cor: "var(--texto-3)", texto: "priori do params.yaml" }, { cor: "var(--acento)", texto: "posteriori com as medidas" }, { cor: "var(--aviso)", texto: "verdade do lote sintético", tracejado: true }]), pequenos),
    h("div", { class: "grade-2" },
      h("div", { class: "pilha" }, h("h3", { class: "prev-sub" }, "Densidade conjunta"), h("div", { class: "grade-2" }, selA.el, selB.el), gPar, h("p", { class: "nota" }, "Uma faixa diagonal quer dizer que as medidas só fixam uma combinação dos dois; para separar, é preciso medir outra coisa.")),
      h("div", { class: "pilha" }, h("h3", { class: "prev-sub" }, "Resíduos padronizados"), gRes, h("h3", { class: "prev-sub" }, "Traço da cadeia"), gTr),
    ),
  ), [], { id: "prev-calibracao" });
  atualizar();
  return { el, atualizar };
}
