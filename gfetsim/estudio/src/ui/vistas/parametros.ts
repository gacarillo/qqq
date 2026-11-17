/**
 * Vista Parâmetros: o params.yaml inteiro, filtrável, com etiqueta, incerteza, fontes e
 * o que entrou no último cálculo; qualquer valor numérico pode ser sobrescrito na receita
 * e passa a valer [B]. Ao lado, a tabela de referências conferidas.
 */
import { h } from "../dom";
import { painel, botao, seletor, etiqueta, abrirModal, aviso } from "../componentes";
import { num } from "../formato";
import { loja, melhorResultado, trocarReceita } from "@/estado/app";
import { carregar, type NoParametro } from "@/parametros/parametros";
import referencias from "@/dados/referencias.json";
import type { Vista } from "./tipos";

interface Ref {
  id: string;
  texto: string;
  doi: string | null;
  situacao: string;
  garante: string;
  uso: string;
  secao: string;
}
const REFS = referencias as Record<string, Ref>;

function textoValor(n: NoParametro): string {
  const v = n.valor;
  if (v !== null && v !== undefined) return typeof v === "number" ? num(v, 4) : String(v);
  if (n.valor_provisorio !== null && n.valor_provisorio !== undefined) return `${typeof n.valor_provisorio === "number" ? num(n.valor_provisorio, 4) : String(n.valor_provisorio)} provisório`;
  if (n.faixa) return `${num(n.faixa.min, 3)} a ${num(n.faixa.max, 3)}`;
  return "null";
}

function textoIncerteza(n: NoParametro): string {
  const i = n.incerteza;
  if (!i) return "";
  switch (i.tipo) {
    case "normal": return `normal, σ ${num(i.sigma!, 3)}`;
    case "normal_rel": return `normal, σ ${num(100 * i.sigma_rel!, 3)} %`;
    case "uniforme": return `uniforme ${num(i.min!, 3)} a ${num(i.max!, 3)}`;
    case "loguniforme": return `log-uniforme ${num(i.min!, 3)} a ${num(i.max!, 3)}`;
    case "varredura": return `varredura ${num(i.min!, 3)} a ${num(i.max!, 3)}`;
  }
  return "";
}

function refsDe(n: NoParametro): HTMLElement[] {
  const ids = Array.isArray(n.ref) ? (n.ref as string[]) : [];
  return ids.map((id) => {
    const r = REFS[id];
    return h("span", { class: "chip", tabindex: 0, "data-dica": r ? `<b>${id}</b> ${r.texto}${r.doi ? `<br><code>${r.doi}</code>` : ""}<br>situação ${r.situacao}<br>${r.garante}` : `${id} sem entrada na tabela de referências` }, id);
  });
}

export function vistaParametros(): Vista {
  const P = carregar(true);
  const folhas = P.folhas();
  const filtro = { texto: "", etiqueta: "todas", so: "todos" };
  const corpo = h("tbody");
  const resumo = h("div", { class: "barra-ferramentas" });
  const busca = h("input", { type: "search", class: "entrada-texto", placeholder: "buscar por chave, nota ou referência", id: "par-busca", "aria-label": "buscar parâmetro" });
  busca.addEventListener("input", () => {
    filtro.texto = busca.value.trim().toLowerCase();
    render();
  });
  const sEt = seletor({ valor: "todas", opcoes: [["todas", "todas as etiquetas"], ["P", "[P] publicado"], ["C", "[C] calculado"], ["I", "[I] provisório"], ["B", "[B] receita ou bancada"]], aoMudar: (v) => { filtro.etiqueta = v; render(); }, id: "par-etiqueta" });
  const sSo = seletor({ valor: "todos", opcoes: [["todos", "todos os parâmetros"], ["usados", "usados no último cálculo"], ["nulos", "ainda null"], ["sobrescritos", "sobrescritos na receita"]], aoMudar: (v) => { filtro.so = v; render(); }, id: "par-so" });
  const tabelaRefs = h("div", { class: "tabela-rolagem", style: "max-height:560px" });
  const el = h(
    "div",
    { class: "vista", id: "vista-parametros" },
    painel("Parâmetros do params.yaml", h("div", { class: "pilha" },
      h("div", { class: "busca" }, busca, sEt.el, sSo.el),
      resumo,
      h("div", { class: "tabela-rolagem", style: "max-height:620px" }, h("table", { class: "tabela" },
        h("thead", null, h("tr", null, ...["chave", "valor", "unidade", "etiqueta", "incerteza", "fontes", "nota", ""].map((t) => h("th", null, t)))), corpo)),
      h("p", { class: "nota" }, "A borda à esquerda marca os parâmetros lidos no último cálculo. Sobrescrever muda só a receita deste estúdio; o params.yaml do pacote fica igual."),
    )),
    painel("Referências conferidas", tabelaRefs),
  );

  function sobrescrever(chave: string, n: NoParametro): void {
    const atual = loja.get().receita.sobrescrever[chave];
    const base = typeof n.valor === "number" ? n.valor : typeof n.valor_provisorio === "number" ? n.valor_provisorio : undefined;
    const entrada = h("input", { class: "entrada-texto", value: String(atual ?? base ?? ""), id: "par-novo", style: "width:100%" });
    abrirModal(`Sobrescrever ${chave}`, h("div", { class: "pilha" },
      h("p", { class: "nota" }, `${n.nota ?? ""}`),
      h("div", { class: "campo" }, h("label", { class: "campo-rotulo", for: "par-novo" }, `novo valor${n.unidade ? ` em ${n.unidade}` : ""}`), entrada),
      h("p", { class: "nota" }, "O valor passa a valer [B] e entra em todo cálculo desta receita, Monte Carlo incluído."),
    ), [
      ...(atual !== undefined ? [{ texto: "Voltar ao params.yaml", acao: () => {
        const r = loja.get().receita;
        const s = { ...r.sobrescrever };
        delete s[chave];
        trocarReceita({ ...r, sobrescrever: s });
      } }] : []),
      { texto: "Cancelar" },
      { texto: "Aplicar", primario: true, acao: () => {
        const v = Number(entrada.value.replace(",", ".").replace("−", "-"));
        if (!Number.isFinite(v)) {
          aviso("o valor precisa ser um número", "erro");
          return false;
        }
        const r = loja.get().receita;
        trocarReceita({ ...r, sobrescrever: { ...r.sobrescrever, [chave]: v } });
        aviso(`${chave} agora vale ${num(v, 4)} [B]`, "ok");
      } },
    ]);
  }

  function render(): void {
    const res = melhorResultado();
    const usados = new Set(res?.usos.map((u) => u.chave) ?? []);
    const sob = loja.get().receita.sobrescrever;
    const linhas = folhas.filter(({ chave, no }) => {
      const et = sob[chave] !== undefined ? "B" : P.etiqueta(chave);
      if (filtro.etiqueta !== "todas" && et !== filtro.etiqueta) return false;
      if (filtro.so === "usados" && !usados.has(chave)) return false;
      if (filtro.so === "nulos" && !(no.valor === null || no.valor === undefined)) return false;
      if (filtro.so === "sobrescritos" && sob[chave] === undefined) return false;
      if (filtro.texto) {
        const alvo = `${chave} ${no.nota ?? ""} ${(no.ref ?? []).join(" ")}`.toLowerCase();
        if (!alvo.includes(filtro.texto)) return false;
      }
      return true;
    });
    corpo.replaceChildren(...linhas.slice(0, 400).map(({ chave, no }) => {
      const et = sob[chave] !== undefined ? "B" : P.etiqueta(chave);
      const numerico = typeof no.valor === "number" || typeof no.valor_provisorio === "number";
      return h("tr", { class: usados.has(chave) ? "usado" : "" },
        h("td", { style: "min-width:220px" }, h("code", { style: "word-break:normal;overflow-wrap:anywhere" }, ...chave.split(".").flatMap((parte, i, l) => (i < l.length - 1 ? [parte + ".", h("wbr")] : [parte])))),
        h("td", { class: "dado" }, sob[chave] !== undefined ? `${num(sob[chave], 4)} (receita)` : textoValor(no)),
        h("td", null, no.unidade ?? ""),
        h("td", null, etiqueta(et)),
        h("td", null, textoIncerteza(no)),
        h("td", null, h("span", { style: "display:flex;gap:4px;flex-wrap:wrap" }, ...refsDe(no))),
        h("td", { style: "max-width:46ch;color:var(--texto-2)" }, no.nota ?? no.conferido_em ?? ""),
        h("td", null, numerico ? botao("Sobrescrever", () => sobrescrever(chave, no), { fantasma: true }) : null),
      );
    }));
    const n = { P: 0, C: 0, I: 0, B: 0 } as Record<string, number>;
    for (const f of folhas) n[P.etiqueta(f.chave)] = (n[P.etiqueta(f.chave)] ?? 0) + 1;
    resumo.replaceChildren(...[
      h("span", { class: "chip" }, `${linhas.length} de ${folhas.length} parâmetros`),
      ...["P", "C", "I", "B"].map((e) => h("span", { class: "chip" }, etiqueta(e), ` ${n[e] ?? 0}`)),
      h("span", { class: "chip" }, `${usados.size} lidos no último cálculo`),
      Object.keys(sob).length ? h("span", { class: "chip aviso" }, `${Object.keys(sob).length} sobrescritos`) : null,
    ].filter((x): x is HTMLSpanElement => x !== null));
  }

  function renderRefs(): void {
    const lista = Object.values(REFS);
    tabelaRefs.replaceChildren(h("table", { class: "tabela" },
      h("thead", null, h("tr", null, ...["ID", "referência", "DOI", "situação", "o que o resumo garante", "uso no modelo"].map((t) => h("th", null, t)))),
      h("tbody", null, ...lista.map((r) => h("tr", null,
        h("td", { class: "dado" }, r.id), h("td", { style: "max-width:52ch" }, r.texto),
        h("td", null, r.doi && r.doi.startsWith("10.") ? h("a", { href: `https://doi.org/${r.doi}`, target: "_blank", rel: "noopener", style: "color:var(--acento)" }, r.doi) : r.doi ?? ""),
        h("td", null, h("span", { class: `chip ${r.situacao.startsWith("OK") ? "ok" : r.situacao.includes("NÃO") || r.situacao.includes("DIVERGE") ? "erro" : ""}` }, r.situacao)),
        h("td", { style: "max-width:40ch;color:var(--texto-2)" }, r.garante), h("td", { style: "max-width:40ch;color:var(--texto-2)" }, r.uso),
      ))),
    ));
  }

  loja.assinar((n, a) => {
    if (n.resultado !== a.resultado || n.receita.sobrescrever !== a.receita.sobrescrever) render();
  });
  return {
    id: "parametros",
    titulo: "Parâmetros",
    el,
    ativar() {
      render();
      if (!tabelaRefs.firstChild) renderRefs();
    },
    exportaveis: () => [{
      nome: "parâmetros usados no cálculo",
      csv: () => {
        const r = melhorResultado();
        const l = ["chave,valor,etiqueta,origem"];
        for (const u of r?.usos ?? []) l.push(`${u.chave},${String(u.valor).replace(/,/g, ";")},${u.etiqueta},${u.origem}`);
        return l.join("\n");
      },
    }],
  };
}
