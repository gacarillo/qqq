/**
 * Seção 5, a próxima medida: ordena as medidas possíveis pelo quanto cada uma reduziria,
 * em média, a incerteza da saída escolhida na receita-alvo. Responde onde gastar a
 * próxima tarde de laboratório.
 */
import { h } from "../../dom";
import { painel, botao, seletor, aviso } from "../../componentes";
import { br } from "../../formato";
import { SAIDAS, type NomeSaida } from "@/fisica/incerteza/montecarlo";
import { Grafico } from "@/visual/grafico/grafico";
import { NOME_SAIDA, TRANSFORMACAO } from "@/previsao/emulador";
import type { Candidato } from "@/previsao/planejamento";
import { erroTipico, type Grandeza } from "@/previsao/tipos";
import { lojaPrev, fila, emuladorAtual, posterioriAtual, alvoCompleto, parametrosDe, rotuloGrandeza, fmtPct, MEDIVEIS, COR } from "./estado";

export function secaoPlano(): { el: HTMLElement; atualizar: () => void } {
  const est = { alvo: "V_D" as NomeSaida };
  const gB = h("div");
  const barras = new Grafico(gB, { x: { rotulo: "redução esperada do desvio da previsão (%)", min: 0 }, y: { rotulo: "medida", min: 0.4, max: 1.6 }, razao: 0.6, alturaMin: 240, alturaMax: 460, legenda: false, margemEsquerda: 210 });
  const tabela = h("div", { class: "tabela-rolagem" });
  const resumo = h("p", { class: "nota" });
  const selAlvo = seletor<NomeSaida>({ rotulo: "Saída que você quer acertar", valor: est.alvo, opcoes: SAIDAS.map(([k, r]) => [k, r]), aoMudar: (v) => (est.alvo = v), id: "plano-alvo" });
  const bt = botao("Ordenar as medidas", () => void rodar(), { primario: true, icone: "grafico", id: "plano-rodar" });

  function candidatos(): Candidato[] {
    const em = emuladorAtual();
    if (!em) return [];
    const p = parametrosDe(em.espaco.base);
    const alvo = alvoCompleto();
    const out: Candidato[] = [];
    for (const s of MEDIVEIS) {
      if (!em.tem(s)) continue;
      const t = erroTipico(p, s);
      out.push({ grandeza: s, receita: alvo, rotuloReceita: "na receita-alvo", sigma: t.sigma, relativo: t.relativo });
    }
    for (const c of em.espaco.calib) {
      if (c.def.nome !== "n_dop" && c.def.nome !== "mu_grafeno") continue;
      const g = `param:${c.def.nome}` as Grandeza;
      const t = erroTipico(p, g);
      out.push({ grandeza: g, receita: alvo, rotuloReceita: c.def.nome === "n_dop" ? "Raman do grafeno" : "ajuste da transferência", sigma: t.sigma, relativo: t.relativo });
    }
    return out;
  }

  async function rodar(): Promise<void> {
    const s = lojaPrev.get();
    const post = posterioriAtual();
    if (!s.emulador || !post) return aviso("treine o emulador primeiro", "erro");
    if (!emuladorAtual()?.tem(est.alvo)) return aviso("essa saída não foi emulada", "erro");
    lojaPrev.set({ planejando: true });
    try {
      const r = await fila.executar(s.emulador.base, { op: "planejar", emulador: s.emulador, posterior: post, receita: alvoCompleto(), alvo: est.alvo, candidatos: candidatos(), semente: 31 });
      if (r.op === "planejar") lojaPrev.set({ plano: r.r, planejando: false });
    } catch (e) {
      lojaPrev.set({ planejando: false });
      aviso(`o planejamento falhou: ${(e as Error).message}`, "erro");
    }
  }

  function fmtDesvio(s: NomeSaida, t: number): string {
    return TRANSFORMACAO[s] === "log" ? `${br(100 * (Math.exp(t) - 1), 1)} %` : `${br(t, 3)} ${NOME_SAIDA.get(s)?.unidade ?? ""}`;
  }

  function atualizar(): void {
    const s = lojaPrev.get();
    bt.disabled = !emuladorAtual() || s.planejando;
    const r = s.plano;
    if (!r) {
      tabela.replaceChildren(h("p", { class: "nota" }, s.planejando ? "repesando a posteriori com resultados fictícios…" : "Escolha a saída que importa e ordene. A análise sorteia resultados possíveis de cada medida, repesa a posteriori e vê quanto a incerteza do alvo cairia em média."));
      barras.definir({ series: [] });
      resumo.textContent = "";
      return;
    }
    const n = r.itens.length;
    barras.o.y.max = n + 0.6;
    barras.o.y.ticks = r.itens.map((_, i) => n - i);
    barras.o.y.formato = (v: number) => {
      const it = r.itens[n - Math.round(v)];
      return it ? rotuloGrandeza(it.candidato.grandeza).replace(" (medida direta)", "") : "";
    };
    // barras horizontais de 0 até a redução, mais forte na primeira
    barras.definir({ series: r.itens.map((i, k) => ({ nome: `m${k}`, x: [0, 100 * Math.max(0, i.reducao)], y: [n - k, n - k], cor: k === 0 ? COR.ok : COR.posteriori, largura: 13, legenda: false })) });
    const tot = Math.hypot(r.desvioEpistemicoAgora, r.desvioIrredutivel);
    resumo.textContent = `Hoje o desvio de ${NOME_SAIDA.get(r.alvo)?.rotulo} na receita-alvo é ${fmtDesvio(r.alvo, tot)}, dos quais ${fmtPct(r.desvioEpistemicoAgora ** 2 / (tot ** 2 || 1))} da variância vêm dos parâmetros e podem cair com medidas. O resto, ${fmtDesvio(r.alvo, r.desvioIrredutivel)}, é piso: erro do emulador, discrepância e dispersão do equipamento.`;
    tabela.replaceChildren(h("table", { class: "tabela" },
      h("thead", null, h("tr", null, h("th", null, "medida"), h("th", null, "onde"), h("th", null, "erro suposto"), h("th", null, "desvio depois"), h("th", null, "redução"), h("th", { "data-dica": "amostras efetivas médias depois da repesagem; abaixo de 30 o número é aproximado" }, "amostras"))),
      h("tbody", null, ...r.itens.map((i) => h("tr", null,
        h("td", null, rotuloGrandeza(i.candidato.grandeza)),
        h("td", { class: "prev-fraco" }, i.candidato.rotuloReceita),
        h("td", null, i.candidato.relativo ? `${br(100 * i.candidato.sigma, 1)} %` : String(i.candidato.sigma)),
        h("td", null, fmtDesvio(r.alvo, Math.hypot(i.desvioEpistemicoDepois, r.desvioIrredutivel))),
        h("td", null, h("b", null, fmtPct(i.reducao, 1))),
        h("td", { class: i.essMedio < 30 ? "prev-alerta" : "prev-fraco" }, String(Math.round(i.essMedio))),
      )))));
  }

  lojaPrev.observar((s) => s.plano, () => atualizar(), false);
  lojaPrev.observar((s) => s.planejando, () => atualizar(), false);
  lojaPrev.observar((s) => s.calibracao, () => lojaPrev.set({ plano: null }), false);
  lojaPrev.observar((s) => s.emulador, () => atualizar(), false);
  const el = painel("5. Qual medida fazer a seguir", h("div", { class: "pilha" },
    h("p", { class: "nota" }, "Análise pré-posterior: o valor de uma medida é quanto ela deve estreitar a previsão que importa, antes de você fazê-la. Medidas que não dependem dos parâmetros que pesam no alvo ficam no fim da lista."),
    h("div", { class: "barra-ferramentas" }, selAlvo.el, bt),
    resumo,
    h("div", { class: "grade-2" }, gB, tabela),
  ), [], { id: "prev-plano" });
  atualizar();
  return { el, atualizar };
}
