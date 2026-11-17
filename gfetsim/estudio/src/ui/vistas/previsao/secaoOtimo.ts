/**
 * Seção 6, a receita ótima: mapa da chance de cumprir as especificações em duas
 * variáveis de receita e a receita que maximiza essa chance, com a dispersão do
 * equipamento e a incerteza que ainda resta nos parâmetros. A receita achada pode ir
 * direto para o painel de receita do estúdio.
 */
import { h } from "../../dom";
import { painel, botao, seletor, aviso, metrica } from "../../componentes";
import { trocarReceita, loja as lojaApp, registrar } from "@/estado/app";
import { definirCampo } from "@/fisica/receita";
import { MapaCalor, type PontoCalor } from "@/visual/grafico/mapaCalor";
import { DEF_VAR, type NomeVarReceita, type ValoresReceita } from "@/previsao/espaco";
import { lojaPrev, fila, emuladorAtual, posterioriAtual, alvoCompleto, fmtVar, fmtPct } from "./estado";

const CAMINHO: Record<NomeVarReceita, string> = {
  T_ox: "oxidacao.T_C",
  t_ox: "oxidacao.tempoFixo_min",
  T_rta: "recozimento.T_rta_C",
  t_rta: "recozimento.t_rta_s",
  T_forno: "recozimento.T_forno_C",
  t_forno: "recozimento.t_forno_min",
  T_spe: "recozimento.T_spe_C",
  t_spe: "recozimento.t_spe_min",
  dose: "implante.dose_cm2",
  energia: "implante.energia_keV",
};

/** Leva valores de receita da previsão para a receita do estúdio, num passo de desfazer. */
export function aplicarNaReceita(v: ValoresReceita): void {
  let r = lojaApp.get().receita;
  for (const [k, x] of Object.entries(v) as [NomeVarReceita, number][]) {
    if (x === undefined || !Number.isFinite(x)) continue;
    r = definirCampo(r, CAMINHO[k], k === "t_ox" ? Number(x.toFixed(2)) : Number(x.toPrecision(4)));
  }
  trocarReceita({ ...r, nome: "receita ótima da previsão" });
  registrar("ok", "receita da previsão aplicada ao painel; o tempo de oxidação ficou fixo");
}

export function secaoOtimo(): { el: HTMLElement; atualizar: () => void } {
  const est = { a: "" as NomeVarReceita | "", b: "" as NomeVarReceita | "" };
  const gM = h("div");
  const mapa = new MapaCalor(gM, { rotulo: "chance de cumprir as especificações em duas variáveis de receita", razao: 0.72, alturaMin: 300, alturaMax: 560 });
  const info = h("div", { class: "pilha" });
  const selA = seletor<string>({ rotulo: "Eixo x", valor: "", opcoes: [["", "escolha"]], aoMudar: (v) => (est.a = v as NomeVarReceita), id: "otimo-a" });
  const selB = seletor<string>({ rotulo: "Eixo y", valor: "", opcoes: [["", "escolha"]], aoMudar: (v) => (est.b = v as NomeVarReceita), id: "otimo-b" });
  const bt = botao("Mapear e otimizar", () => void rodar(), { primario: true, icone: "grafico", id: "otimo-rodar" });

  async function rodar(): Promise<void> {
    const s = lojaPrev.get();
    const post = posterioriAtual();
    if (!s.emulador || !post) return aviso("treine o emulador primeiro", "erro");
    if (!est.a || !est.b || est.a === est.b) return aviso("escolha duas variáveis diferentes", "erro");
    if (!s.specs.some((e) => e.ativa)) return aviso("ative ao menos uma especificação na seção 4", "erro");
    lojaPrev.set({ mapeando: true });
    try {
      const r = await fila.executar(s.emulador.base, { op: "mapa", emulador: s.emulador, posterior: post, receita: alvoCompleto(), specs: s.specs, eixos: [est.a, est.b], n: 30, semente: 17 });
      if (r.op === "mapa") lojaPrev.set({ mapa: r.r, mapeando: false });
    } catch (e) {
      lojaPrev.set({ mapeando: false });
      aviso(`o mapa falhou: ${(e as Error).message}`, "erro");
    }
  }

  function atualizar(): void {
    const s = lojaPrev.get();
    const em = emuladorAtual();
    bt.disabled = !em || s.mapeando;
    info.replaceChildren();
    if (!em) {
      info.append(h("p", { class: "nota" }, "Treine o emulador para mapear."));
      return;
    }
    const vars = em.espaco.vars.map((a) => [a.def.nome, `${a.def.rotulo} (${a.def.unidade})`] as [string, string]);
    for (const [sel, k] of [[selA, 0], [selB, 1]] as const) {
      sel.sel.replaceChildren(...vars.map(([v, t]) => h("option", { value: v }, t)));
      const atual = k === 0 ? est.a : est.b;
      const v = atual && vars.some(([x]) => x === atual) ? atual : vars[k]?.[0] ?? "";
      sel.sel.value = v;
      if (k === 0) est.a = v as NomeVarReceita;
      else est.b = v as NomeVarReceita;
    }
    if (vars.length < 2) info.append(h("p", { class: "nota" }, "O mapa precisa de duas variáveis de receita no emulador."));
    const m = s.mapa;
    if (!m) {
      info.append(h("p", { class: "nota" }, s.mapeando ? "calculando a chance em 900 receitas e otimizando…" : "O mapa usa as especificações da seção 4 e a posteriori da seção 3. Cada célula é a chance média sobre 160 sorteios fixos dos parâmetros e da dispersão do equipamento."));
      return;
    }
    const dx = DEF_VAR.get(m.x.nome)!;
    const dy = DEF_VAR.get(m.y.nome)!;
    const pontos: PontoCalor[] = [{ x: m.atual.x, y: m.atual.y, cor: "#ffffff", rotulo: `receita atual ${fmtPct(m.atual.p)}`, forma: "circulo" }];
    if (m.otimo) {
      const ox = m.otimo.receita[m.x.nome];
      const oy = m.otimo.receita[m.y.nome];
      if (ox !== undefined && oy !== undefined) pontos.push({ x: ox, y: oy, cor: "#ffd166", rotulo: `ótima ${fmtPct(m.otimo.p)}`, forma: "estrela" });
    }
    mapa.definir({
      nx: m.nx, ny: m.ny, v: m.P, mapa: "viridis", faixa: [0, 1], rotuloBarra: "chance de cumprir", formatoBarra: (v) => fmtPct(v),
      x: { rotulo: `${dx.rotulo} (${dx.unidade})`, min: m.x.min, max: m.x.max, log: m.x.log, formato: dx.cientifico ? (v) => fmtVar(m.x.nome, v) : undefined },
      y: { rotulo: `${dy.rotulo} (${dy.unidade})`, min: m.y.min, max: m.y.max, log: m.y.log, formato: dy.cientifico ? (v) => fmtVar(m.y.nome, v) : undefined },
      contornos: [{ nivel: 0.5, cor: "#ffffff", rotulo: "50 %", tracejado: [4, 3] }, { nivel: 0.9, cor: "#ffffff", rotulo: "90 %" }],
      pontos,
    });
    const o = m.otimo;
    info.append(h("div", { class: "metricas" },
      metrica("chance na receita atual", `${fmtPct(m.atual.p)} ± ${fmtPct(1.96 * m.atual.ep, 1)}`),
      metrica("chance na receita ótima", o ? `${fmtPct(o.p)} ± ${fmtPct(1.96 * o.ep, 1)}` : "sem otimização"),
    ));
    if (o) {
      info.append(h("table", { class: "tabela" }, h("tbody", null, ...Object.entries(o.receita).map(([k, v]) => {
        const d = DEF_VAR.get(k as NomeVarReceita)!;
        const at = alvoCompleto()[k as NomeVarReceita];
        return h("tr", null, h("td", null, d.rotulo), h("td", null, h("b", null, `${fmtVar(k as NomeVarReceita, v as number)} ${d.unidade}`)), h("td", { class: "prev-fraco" }, at !== undefined ? `agora ${fmtVar(k as NomeVarReceita, at)}` : ""));
      }))));
      if (o.naBorda.length) info.append(h("p", { class: "prev-alerta" }, `O ótimo encosta na borda da faixa de treino em ${o.naBorda.join(", ")}. A receita melhor pode estar fora dela; treine o emulador com a faixa ampliada antes de confiar.`));
      info.append(h("div", { class: "barra-ferramentas" },
        botao("Prever esta receita", () => lojaPrev.set({ alvo: { ...o.receita } }), { dica: "leva a receita ótima para a seção 4" }),
        botao("Aplicar no painel de receita", () => aplicarNaReceita(o.receita), { primario: true, dica: "troca a receita do estúdio; dá para desfazer com Ctrl e Z" }),
      ));
    }
    for (const a of m.avisos) info.append(h("p", { class: "prev-alerta" }, a));
  }

  lojaPrev.observar((s) => s.mapa, () => atualizar(), false);
  lojaPrev.observar((s) => s.mapeando, () => atualizar(), false);
  lojaPrev.observar((s) => s.emulador, () => { lojaPrev.set({ mapa: null }); atualizar(); }, false);
  lojaPrev.observar((s) => s.calibracao, () => lojaPrev.set({ mapa: null }), false);
  const el = painel("6. Receita com mais chance de cumprir", h("div", { class: "pilha" },
    h("p", { class: "nota" }, "A chance de cada receita integra a incerteza que resta nos parâmetros e a dispersão do equipamento, então a receita ótima é a mais robusta, não a do modelo nominal. Com poucas medidas o mapa é largo; ele aperta a cada lote calibrado."),
    h("div", { class: "barra-ferramentas" }, selA.el, selB.el, bt),
    h("div", { class: "grade-principal" }, gM, info),
  ), [], { id: "prev-otimo" });
  atualizar();
  return { el, atualizar };
}
