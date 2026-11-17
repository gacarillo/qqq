/**
 * Vista Previsão: o estúdio deixa de só simular e passa a prever o próximo lote com a
 * incerteza que resta, aprendendo com cada medida. Sete passos, do emulador ao placar,
 * com uma barra no topo que mostra onde o fluxo está e leva a cada passo.
 */
import "@/estilos/previsao.css";
import { h } from "../../dom";
import { fmtPct, lojaPrev, emuladorAtual } from "./estado";
import { secaoEmulador } from "./secaoEmulador";
import { secaoLotes } from "./secaoLotes";
import { secaoCalibracao } from "./secaoCalibracao";
import { secaoPrevisao } from "./secaoPrevisao";
import { secaoPlano } from "./secaoPlano";
import { secaoOtimo } from "./secaoOtimo";
import { secaoAcertos } from "./secaoAcertos";
import { placar } from "@/previsao/caderno";
import type { Exportavel, Vista } from "../tipos";
import { salvarArquivo, nomeArquivo } from "@/exportar/salvar";

interface Passo {
  id: string;
  titulo: string;
  estado: () => { texto: string; classe: "ok" | "aviso" | "erro" | "" };
}

export function vistaPrevisao(): Vista {
  const secoes = [secaoEmulador(), secaoLotes(), secaoCalibracao(), secaoPrevisao(), secaoPlano(), secaoOtimo(), secaoAcertos()];
  const passos: Passo[] = [
    { id: "prev-emulador", titulo: "Emulador", estado: () => {
      const s = lojaPrev.get();
      if (s.treino) return { texto: s.treino.fase === "simulando" ? `${s.treino.feitos} de ${s.treino.total}` : "ajustando", classe: "aviso" };
      const em = emuladorAtual();
      if (!em) return { texto: "não treinado", classe: "erro" };
      const q = em.saidas.map((x) => em.qualidade.get(x)?.Q2 ?? 0).sort((a, b) => a - b);
      return { texto: `Q² ${q[Math.floor(q.length / 2)]?.toFixed(2) ?? "?"}`, classe: "ok" };
    } },
    { id: "prev-lotes", titulo: "Lotes", estado: () => {
      const l = lojaPrev.get().lotes;
      const n = l.reduce((a, x) => a + x.medidas.length, 0);
      return { texto: `${l.length} lotes, ${n} medidas`, classe: n ? "ok" : "" };
    } },
    { id: "prev-calibracao", titulo: "Calibração", estado: () => {
      const s = lojaPrev.get();
      if (s.calibrando !== null) return { texto: "amostrando", classe: "aviso" };
      if (!s.calibracao) return { texto: "priori", classe: "" };
      return { texto: `${s.calibracao.posterior.nTermos} medidas`, classe: s.calibracao.avisos.length ? "aviso" : "ok" };
    } },
    { id: "prev-previsao", titulo: "Previsão", estado: () => {
      const r = lojaPrev.get().previsao;
      return r ? { texto: `chance ${fmtPct(r.pEspec)}`, classe: (r.pEspec ?? 0) >= 0.9 ? "ok" : (r.pEspec ?? 0) >= 0.5 ? "aviso" : "erro" } : { texto: "a calcular", classe: "" };
    } },
    { id: "prev-plano", titulo: "Próxima medida", estado: () => {
      const r = lojaPrev.get().plano;
      return r && r.itens[0] ? { texto: `${fmtPct(r.itens[0].reducao)} a menos`, classe: "ok" } : { texto: "a ordenar", classe: "" };
    } },
    { id: "prev-otimo", titulo: "Receita ótima", estado: () => {
      const m = lojaPrev.get().mapa;
      return m?.otimo ? { texto: fmtPct(m.otimo.p), classe: m.otimo.p >= 0.9 ? "ok" : "aviso" } : { texto: "a mapear", classe: "" };
    } },
    { id: "prev-acertos", titulo: "Placar", estado: () => {
      const p = placar(lojaPrev.get().lotes);
      return p.n ? { texto: `${fmtPct(p.cobertura68)} em 68 %`, classe: Math.abs(p.cobertura68 - 0.68) < 0.2 ? "ok" : "aviso" } : { texto: "sem pares", classe: "" };
    } },
  ];
  const barra = h("nav", { class: "prev-passos", "aria-label": "passos da previsão" });
  const el = h("div", { class: "vista vista-previsao", id: "vista-previsao" },
    h("header", { class: "prev-topo" },
      h("div", null, h("h2", null, "Prever o próximo lote"), h("p", { class: "nota" }, "O modelo físico vira um emulador, as suas medidas calibram o que ele não sabe e a previsão diz o que a próxima receita vai dar, com a chance de cumprir a especificação. Cada lote medido melhora a próxima previsão, e o placar mostra se ela merece confiança.")),
      barra),
    ...secoes.map((s) => s.el));

  function desenharPassos(): void {
    barra.replaceChildren(...passos.map((p, i) => {
      const e = p.estado();
      const b = h("button", { type: "button", class: `prev-passo ${e.classe}` }, h("span", { class: "n" }, String(i + 1)), h("span", { class: "t" }, p.titulo), h("span", { class: "e" }, e.texto));
      b.addEventListener("click", () => document.getElementById(p.id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return b;
    }));
  }
  lojaPrev.assinar(() => desenharPassos());
  desenharPassos();

  return {
    id: "previsao",
    titulo: "Previsão",
    el,
    ativar() {
      secoes.forEach((s) => s.atualizar());
      desenharPassos();
    },
    exportaveis(): Exportavel[] {
      const s = lojaPrev.get();
      const out: Exportavel[] = [];
      const pv = s.previsao;
      if (pv) out.push({ nome: "previsão do lote", csv: () => {
        const linhas = ["saida;p2_5;p16;mediana;p84;p97_5;priori_p2_5;priori_p97_5"];
        for (const [k, d] of Object.entries(pv.posteriori)) {
          const q = pv.priori[k as keyof typeof pv.priori];
          if (d && q) linhas.push([k, d.p2_5, d.p16, d.p50, d.p84, d.p97_5, q.p2_5, q.p97_5].join(";"));
        }
        return linhas.join("\n") + "\n";
      } });
      if (s.calibracao) out.push({ nome: "amostras da posteriori", csv: () => {
        const c = s.calibracao!;
        const em = emuladorAtual();
        const linhas = [c.nomes.join(";")];
        for (let k = 0; k < c.posterior.S; k++) linhas.push(c.nomes.map((_, j) => String(em ? em.espaco.vCalib(j, c.posterior.amostras[k * c.posterior.dc + j]) : c.posterior.amostras[k * c.posterior.dc + j])).join(";"));
        return linhas.join("\n") + "\n";
      } });
      out.push({ nome: "caderno de lotes (JSON)", csv: () => JSON.stringify(lojaPrev.get().lotes, null, 1) });
      return out;
    },
  };
}

/** Guarda o estado inteiro da previsão num arquivo, para levar a outra máquina. */
export async function exportarTudo(): Promise<void> {
  const s = lojaPrev.get();
  await salvarArquivo(nomeArquivo("previsao", "json"), JSON.stringify({ emulador: s.emulador, lotes: s.lotes, specs: s.specs, alvo: s.alvo }));
}
