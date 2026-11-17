/**
 * Seção 4, a previsão do próximo lote: a receita que vai ao forno, as especificações e
 * o que sai. Para cada saída, mediana e intervalos de 68 e 95 % pela posteriori e pela
 * priori, a parte da incerteza que medidas ainda podem tirar e a probabilidade de
 * cumprir tudo. A previsão pode ser guardada num lote antes da medida, para o placar.
 */
import { h } from "../../dom";
import { painel, botao, seletor, aviso, metrica, legenda, alternador } from "../../componentes";
import { br } from "../../formato";
import { registrar } from "@/estado/app";
import { SAIDAS, type NomeSaida } from "@/fisica/incerteza/montecarlo";
import { Grafico } from "@/visual/grafico/grafico";
import { NOME_SAIDA, TRANSFORMACAO } from "@/previsao/emulador";
import { instantaneo, type DistribuicaoSaida } from "@/previsao/preditiva";
import type { Especificacao } from "@/previsao/tipos";
import { ExecucaoPontos } from "@/trabalho/previsao";
import { lojaPrev, fila, emuladorAtual, posterioriAtual, alvoCompleto, fmtSaida, fmtVar, fmtPct, specsPadrao, receitaApp, COR } from "./estado";
import { abrirNovoLote } from "./secaoLotes";
import { histograma, serieDegrau } from "./graficos";

export function secaoPrevisao(): { el: HTMLElement; atualizar: () => void } {
  const est = { saida: "espessura_ox_nm" as NomeSaida };
  const caixaAlvo = h("div", { class: "grade-3" });
  const caixaSpecs = h("div", { class: "prev-specs" });
  const grande = h("div", { class: "prev-grande" });
  const tabela = h("div", { class: "tabela-rolagem" });
  const avisosEl = h("ul", { class: "lista-notas" });
  const conf = h("div", { class: "tabela-rolagem" });
  const gH = h("div");
  const hist = new Grafico(gH, { x: { rotulo: "valor" }, y: { rotulo: "densidade", min: 0 }, razao: 0.5, alturaMin: 220, alturaMax: 320, legenda: false });
  const selSaida = seletor<NomeSaida>({ rotulo: "Saída no histograma", valor: est.saida, opcoes: SAIDAS.map(([k, r]) => [k, r]), aoMudar: (v) => { est.saida = v; desenharHist(); }, id: "prev-saida-hist" });
  const btPrever = botao("Prever o lote", () => void preverAgora(), { primario: true, icone: "alvo", id: "prev-prever" });
  const btGuardar = botao("Guardar num lote novo", () => guardar(), { dica: "cria um lote com esta receita e esta previsão; quando a medida chegar, o placar compara" });
  const btConferir = botao("Conferir na cadeia completa", () => conferir(), { dica: "roda a cadeia de verdade em 12 sorteios da posteriori e compara com o emulador" });
  const btReceita = botao("Usar a receita do painel", () => { lojaPrev.set({ alvo: {} }); montarAlvo(); }, { fantasma: true });

  function montarAlvo(): void {
    const em = emuladorAtual();
    caixaAlvo.replaceChildren();
    if (!em) return;
    const alvo = alvoCompleto();
    for (const a of em.espaco.vars) {
      const v = alvo[a.def.nome];
      const mostrar = (x: number) => (a.def.cientifico ? x.toExponential(3).replace("e+", "e") : String(Number(x.toPrecision(5)))).replace(".", ",");
      const input = h("input", { type: "text", id: `alvo-${a.def.nome}`, value: v === undefined ? "" : mostrar(v), spellcheck: false, inputmode: "decimal" });
      input.addEventListener("change", () => {
        const x = Number(input.value.replace(",", "."));
        if (!Number.isFinite(x)) return;
        lojaPrev.set((s) => ({ alvo: { ...s.alvo, [a.def.nome]: x } }));
      });
      const fora = v !== undefined && (v < a.min || v > a.max);
      caixaAlvo.append(h("label", { class: "campo", for: input.id },
        h("span", { class: "campo-rotulo" }, h("span", { class: "nome" }, `${a.def.rotulo} (${a.def.unidade})`), fora ? h("span", { class: "chip erro" }, "fora da faixa") : null),
        input,
        h("span", { class: "prev-fraco" }, `treino de ${fmtVar(a.def.nome, a.min)} a ${fmtVar(a.def.nome, a.max)}${a.dispersao > 0 ? `; dispersão ${fmtVar(a.def.nome, a.dispersao)}` : ""}`)));
    }
  }

  function montarSpecs(): void {
    let specs = lojaPrev.get().specs;
    if (!specs.length) {
      specs = specsPadrao(receitaApp());
      lojaPrev.set({ specs });
    }
    caixaSpecs.replaceChildren(h("div", { class: "prev-spec cab" }, h("span", null, ""), h("span", null, "saída"), h("span", null, "mínimo"), h("span", null, "máximo")));
    const mudar = (i: number, e: Partial<Especificacao>) => lojaPrev.set((s) => ({ specs: s.specs.map((x, k) => (k === i ? { ...x, ...e } : x)) }));
    specs.forEach((e, i) => {
      const alt = alternador("", e.ativa, (v) => mudar(i, { ativa: v }));
      const campo = (v: number | null, chave: "min" | "max") => {
        const inp = h("input", { type: "text", value: v === null ? "" : String(v).replace(".", ","), placeholder: "sem limite", inputmode: "decimal", "aria-label": `${chave === "min" ? "mínimo" : "máximo"} de ${NOME_SAIDA.get(e.s)?.rotulo}`, spellcheck: false });
        inp.addEventListener("change", () => {
          const t = inp.value.trim();
          const x = Number(t.replace(",", "."));
          mudar(i, { [chave]: t === "" || !Number.isFinite(x) ? null : x });
        });
        return inp;
      };
      const sel = h("select", { "aria-label": "saída da especificação" }, ...SAIDAS.map(([k, r]) => h("option", { value: k }, r)));
      sel.value = e.s;
      sel.addEventListener("change", () => mudar(i, { s: sel.value as NomeSaida }));
      caixaSpecs.append(h("div", { class: "prev-spec" }, alt.el, h("span", null, sel, h("small", null, ` ${NOME_SAIDA.get(e.s)?.unidade ?? ""}`)), campo(e.min, "min"), campo(e.max, "max"), botao("remover", () => lojaPrev.set((s) => ({ specs: s.specs.filter((_, k) => k !== i) })), { fantasma: true })));
    });
    caixaSpecs.append(h("div", { class: "barra-ferramentas" },
      botao("Especificação", () => lojaPrev.set((s) => ({ specs: [...s.specs, { s: "Rs_final", min: null, max: null, ativa: true }] })), { icone: "mais", fantasma: true }),
      botao("Voltar ao padrão", () => lojaPrev.set({ specs: specsPadrao(receitaApp()) }), { fantasma: true })));
  }

  async function preverAgora(): Promise<void> {
    const s = lojaPrev.get();
    const em = emuladorAtual();
    const post = posterioriAtual();
    if (!em || !post || !s.emulador) return aviso("treine o emulador primeiro", "erro");
    lojaPrev.set({ prevendo: true });
    try {
      const r = await fila.executar(s.emulador.base, { op: "prever", emulador: s.emulador, posterior: post, receita: alvoCompleto(), specs: s.specs, n: 4000, semente: 5 });
      if (r.op === "prever") lojaPrev.set({ previsao: r.r, prevendo: false, conferencia: null });
    } catch (e) {
      lojaPrev.set({ prevendo: false });
      aviso(`a previsão falhou: ${(e as Error).message}`, "erro");
    }
  }

  function guardar(): void {
    const s = lojaPrev.get();
    if (!s.previsao || !s.emulador) return aviso("rode a previsão primeiro", "erro");
    const snap = instantaneo(s.previsao, s.emulador.chave, s.calibracao?.posterior.nTermos ?? 0);
    abrirNovoLote({ receita: alvoCompleto(), previsao: snap, nome: `planejado ${s.lotes.length + 1}`, nota: "previsão guardada antes da medida" }, (l) => registrar("ok", `${l.nome} guardado com a previsão`));
  }

  function conferir(): void {
    const em = emuladorAtual();
    const post = posterioriAtual();
    if (!em || !post) return aviso("treine o emulador primeiro", "erro");
    const esp = em.espaco;
    const ur = esp.unidadeReceita(alvoCompleto());
    const n = 12;
    const zs = Array.from({ length: n }, (_, k) => {
      const s = Math.floor(((k + 0.5) * post.S) / n);
      return esp.juntar(ur, post.amostras.subarray(s * post.dc, (s + 1) * post.dc));
    });
    const pontos = zs.map((z) => esp.pontoFisico(z));
    const cadeia: (Record<string, number> | null)[] = new Array(n).fill(null);
    conf.replaceChildren(h("p", { class: "nota" }, "rodando 12 cadeias completas…"));
    new ExecucaoPontos(esp.base, pontos, (i, s) => (cadeia[i] = s as unknown as Record<string, number> | null), () => {
      const linhas = em.saidas.map((s) => {
        const ems = zs.map((z) => em.media(s, z));
        const cas = cadeia.map((c) => c?.[s] ?? NaN);
        const log = TRANSFORMACAO[s] === "log";
        const dif = ems.map((v, i) => (log ? Math.log(v / cas[i]) : v - cas[i])).filter(Number.isFinite);
        const pior = dif.reduce((a, b) => Math.max(a, Math.abs(b)), 0);
        const declarado = em.erroT(s);
        const ok = pior <= 3 * declarado + 1e-12;
        return { s, ems, cas, pior, declarado, ok, log };
      });
      lojaPrev.set({ conferencia: linhas.map((l) => ({ s: l.s, emulador: l.ems, cadeia: l.cas })) });
      conf.replaceChildren(h("table", { class: "tabela" },
        h("thead", null, h("tr", null, h("th", null, "saída"), h("th", null, "maior diferença"), h("th", null, "erro declarado"), h("th", null, ""))),
        h("tbody", null, ...linhas.map((l) => h("tr", null,
          h("td", null, NOME_SAIDA.get(l.s)?.rotulo ?? l.s),
          h("td", null, l.log ? `${br(100 * (Math.exp(l.pior) - 1), 1)} %` : `${fmtSaida(l.s, l.pior)} ${NOME_SAIDA.get(l.s)?.unidade ?? ""}`),
          h("td", null, l.log ? `${br(100 * (Math.exp(l.declarado) - 1), 1)} %` : `${fmtSaida(l.s, l.declarado)}`),
          h("td", null, h("span", { class: `chip ${l.ok ? "ok" : "erro"}` }, l.ok ? "dentro de 3×" : "acima de 3×")),
        )))));
      registrar("info", "conferência do emulador contra a cadeia completa concluída");
    });
  }

  function desenharHist(): void {
    const r = lojaPrev.get().previsao;
    const d = r?.posteriori[est.saida];
    const q = r?.priori[est.saida];
    if (!r || !d || !q) {
      hist.definir({ series: [] });
      return;
    }
    const log = TRANSFORMACAO[est.saida] === "log" && q.p2_5 > 0;
    const a = Math.min(q.p2_5, d.p2_5);
    const b = Math.max(q.p97_5, d.p97_5);
    const pad = log ? 1.15 : (b - a) * 0.12 || 1;
    const lo = log ? a / pad : a - pad;
    const hi = log ? b * pad : b + pad;
    hist.o.x.log = log;
    hist.o.x.rotulo = `${NOME_SAIDA.get(est.saida)?.rotulo} (${NOME_SAIDA.get(est.saida)?.unidade || "adim."})`;
    const spec = lojaPrev.get().specs.find((e) => e.ativa && e.s === est.saida);
    hist.definir({
      series: [serieDegrau(histograma(q.amostras, lo, hi, 50, log), "priori", COR.priori, { largura: 1.2 }), serieDegrau(histograma(d.amostras, lo, hi, 50, log), "posteriori", COR.posteriori, { tipo: "area", alfa: 0.35, largura: 1.6 })],
      regioes: spec ? [{ eixo: "x", de: spec.min ?? lo, ate: spec.max ?? hi, cor: COR.ok, alfa: 0.12, rotulo: "especificação" }] : [],
      marcas: [{ eixo: "x", valor: d.p50, cor: COR.posteriori, rotulo: "mediana" }, { eixo: "x", valor: d.p2_5, cor: COR.posteriori, tracejado: [3, 3] }, { eixo: "x", valor: d.p97_5, cor: COR.posteriori, tracejado: [3, 3] }],
    });
  }

  function linhaSaida(s: NomeSaida, d: DistribuicaoSaida, q: DistribuicaoSaida): HTMLElement {
    const u = NOME_SAIDA.get(s)?.unidade ?? "";
    const tot = Math.hypot(d.desvioEpistemicoT, d.desvioIrredutivelT);
    const frac = tot > 0 ? d.desvioEpistemicoT ** 2 / tot ** 2 : 0;
    return h("tr", null,
      h("td", null, NOME_SAIDA.get(s)?.rotulo ?? s),
      h("td", null, h("b", null, fmtSaida(s, d.p50)), ` ${u}`),
      h("td", null, `${fmtSaida(s, d.p16)} a ${fmtSaida(s, d.p84)}`),
      h("td", null, `${fmtSaida(s, d.p2_5)} a ${fmtSaida(s, d.p97_5)}`),
      h("td", { class: "prev-fraco" }, `${fmtSaida(s, q.p2_5)} a ${fmtSaida(s, q.p97_5)}`),
      h("td", null, h("div", { class: "prev-medidor", "data-dica": "parte da variância que vem dos parâmetros calibráveis; o resto é erro do emulador, discrepância e dispersão do equipamento, que medida nenhuma tira" }, h("i", { style: `width:${Math.round(100 * frac)}%` }), h("span", null, fmtPct(frac)))),
    );
  }

  function atualizar(): void {
    const s = lojaPrev.get();
    const em = emuladorAtual();
    btPrever.disabled = !em || s.prevendo;
    btGuardar.disabled = !s.previsao;
    btConferir.disabled = !em;
    montarAlvo();
    montarSpecs();
    grande.replaceChildren();
    avisosEl.replaceChildren();
    const r = s.previsao;
    if (!em) {
      tabela.replaceChildren(h("p", { class: "nota" }, "Treine o emulador para prever."));
      desenharHist();
      return;
    }
    if (!r) {
      tabela.replaceChildren(h("p", { class: "nota" }, s.prevendo ? "calculando 4000 sorteios da preditiva…" : "Ajuste a receita e as especificações e clique em prever. Sem calibração, a previsão usa a priori."));
      desenharHist();
      return;
    }
    const nMed = s.calibracao?.posterior.nTermos ?? 0;
    grande.append(
      h("div", { class: "prev-numero" }, h("span", null, "chance de cumprir todas as especificações"), h("b", null, fmtPct(r.pEspec, 0)), h("small", null, r.pEspecPriori !== null ? `${fmtPct(r.pEspecPriori, 0)} só com a priori` : "nenhuma especificação ativa")),
      h("div", { class: "metricas" }, ...r.pPorEspec.map((p) => metrica(`${NOME_SAIDA.get(p.s)?.rotulo}`, fmtPct(p.p), { dica: `priori ${fmtPct(p.pPriori)}`, alerta: p.p < 0.5 })), metrica("medidas na calibração", String(nMed), { dica: nMed ? "a posteriori usa as medidas dos lotes" : "sem medidas, a previsão é a da priori" })),
    );
    for (const a of r.avisos) avisosEl.append(h("li", null, a));
    const linhas = em.saidas.filter((x) => r.posteriori[x] && r.priori[x]).map((x) => linhaSaida(x, r.posteriori[x]!, r.priori[x]!));
    tabela.replaceChildren(h("table", { class: "tabela" },
      h("thead", null, h("tr", null, h("th", null, "saída"), h("th", null, "mediana"), h("th", null, "68 %"), h("th", null, "95 %"), h("th", null, "95 % só com a priori"), h("th", null, "incerteza que medidas tiram"))),
      h("tbody", null, ...linhas)));
    desenharHist();
  }

  lojaPrev.observar((s) => s.previsao, () => atualizar(), false);
  lojaPrev.observar((s) => s.prevendo, () => atualizar(), false);
  lojaPrev.observar((s) => s.emulador, () => atualizar(), false);
  lojaPrev.observar((s) => s.calibracao, () => lojaPrev.set({ previsao: null }), false);
  lojaPrev.observar((s) => s.specs, () => montarSpecs(), false);
  lojaPrev.observar((s) => s.alvo, () => montarAlvo(), false);

  const el = painel("4. Previsão do próximo lote", h("div", { class: "pilha" },
    h("p", { class: "nota" }, "Cada sorteio pega um conjunto de parâmetros da posteriori, aplica a dispersão do equipamento à receita, avalia o emulador e soma o erro dele e a discrepância de modelo. É a resposta para o que este lote vai dar, com a incerteza que ainda existe."),
    h("h3", { class: "prev-sub" }, "Receita do lote"), caixaAlvo, h("div", { class: "barra-ferramentas" }, btReceita),
    h("h3", { class: "prev-sub" }, "Especificações"), caixaSpecs,
    h("div", { class: "barra-ferramentas" }, btPrever, btGuardar, btConferir),
    grande, avisosEl, tabela,
    h("div", { class: "grade-2" },
      h("div", { class: "pilha" }, selSaida.el, gH, legenda([{ cor: "var(--texto-3)", texto: "priori" }, { cor: "var(--acento)", texto: "posteriori" }, { cor: "var(--ok)", texto: "faixa da especificação" }])),
      h("div", { class: "pilha" }, h("h3", { class: "prev-sub" }, "Emulador contra a cadeia nesta receita"), conf, h("p", { class: "nota" }, "Se a diferença passar de três vezes o erro declarado, o emulador não é confiável nesta receita; treine de novo com mais pontos ou uma faixa mais estreita."))),
  ), [], { id: "prev-previsao" });
  atualizar();
  return { el, atualizar };
}
