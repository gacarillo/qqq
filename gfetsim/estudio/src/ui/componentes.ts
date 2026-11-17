/** Componentes de interface do estúdio: campos com unidade e etiqueta, menus, avisos. */
import { h, novoId } from "./dom";
import { br, num } from "./formato";
import type { Etiqueta } from "@/parametros/parametros";

/* ---------------------------------------------------------------- ícones (traço simples, 16 px) */
const ICONES: Record<string, string> = {
  tocar: "M5 3.5v9l7-4.5z",
  pausar: "M5 3.5h2v9H5zM9 3.5h2v9H9z",
  desfazer: "M6 4 3 7l3 3M3.5 7H10a3 3 0 0 1 0 6H8",
  refazer: "M10 4l3 3-3 3M12.5 7H6a3 3 0 0 0 0 6h2",
  baixar: "M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10",
  camera: "M2.5 5.5h2l1.2-1.8h4.6l1.2 1.8h2v7h-11zM8 11.3a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z",
  gravar: "M8 12.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z",
  tela: "M2.5 3.5h11v7h-11zM6 13.5h4M8 10.5v3",
  tema: "M8 2.5a5.5 5.5 0 1 0 5.5 5.5A4.3 4.3 0 0 1 8 2.5z",
  menu: "M2.5 4.5h11M2.5 8h11M2.5 11.5h11",
  info: "M8 13.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM8 7.3v3.7M8 5.2v.1",
  reiniciar: "M3 8a5 5 0 1 0 1.5-3.6M3 3v3h3",
  regua: "M2.5 10.5 10.5 2.5l3 3-8 8zM5 8l1.5 1.5M7 6l1 1M9 4l1.5 1.5",
  corte: "M2 12 14 4M3 4h2M3 4v2",
  lupa: "M7 11.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM10.3 10.3 13.5 13.5",
  painel: "M2.5 3.5h11v9h-11zM10 3.5v9",
};

export function icone(nome: string): SVGSVGElement {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 16 16");
  s.setAttribute("width", "15");
  s.setAttribute("height", "15");
  s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", ICONES[nome] ?? "");
  const preenchido = nome === "tocar" || nome === "pausar" || nome === "gravar";
  p.setAttribute("fill", preenchido ? "currentColor" : "none");
  p.setAttribute("stroke", preenchido ? "none" : "currentColor");
  p.setAttribute("stroke-width", "1.4");
  p.setAttribute("stroke-linecap", "round");
  p.setAttribute("stroke-linejoin", "round");
  s.append(p);
  return s;
}

/* ---------------------------------------------------------------- dicas flutuantes */
let dicaEl: HTMLDivElement | null = null;
export function instalarDicas(raiz: HTMLElement = document.body): void {
  dicaEl = h("div", { class: "dica", role: "tooltip", hidden: true });
  document.body.append(dicaEl);
  const mostrar = (alvo: HTMLElement) => {
    const html = alvo.dataset.dica;
    if (!html || !dicaEl) return;
    dicaEl.innerHTML = html;
    dicaEl.hidden = false;
    const r = alvo.getBoundingClientRect();
    const d = dicaEl.getBoundingClientRect();
    let x = r.left + r.width / 2 - d.width / 2;
    x = Math.max(8, Math.min(window.innerWidth - d.width - 8, x));
    let y = r.bottom + 6;
    if (y + d.height > window.innerHeight - 8) y = r.top - d.height - 6;
    dicaEl.style.left = `${x}px`;
    dicaEl.style.top = `${y}px`;
  };
  const esconder = () => {
    if (dicaEl) dicaEl.hidden = true;
  };
  raiz.addEventListener("pointerover", (e) => {
    const alvo = (e.target as HTMLElement).closest<HTMLElement>("[data-dica]");
    if (alvo) mostrar(alvo);
  });
  raiz.addEventListener("pointerout", (e) => {
    const alvo = (e.target as HTMLElement).closest<HTMLElement>("[data-dica]");
    if (alvo && !alvo.contains(e.relatedTarget as Node)) esconder();
  });
  raiz.addEventListener("focusin", (e) => {
    const alvo = (e.target as HTMLElement).closest<HTMLElement>("[data-dica]");
    if (alvo) mostrar(alvo);
  });
  raiz.addEventListener("focusout", esconder);
  window.addEventListener("scroll", esconder, true);
}

const DESCRICAO_ETIQUETA: Record<string, string> = {
  P: "valor publicado e verificado",
  C: "cálculo próprio a partir de valores [P]",
  I: "inferência sem fonte conferida, valor provisório",
  B: "receita ou dado de bancada do usuário",
  "?": "sem etiqueta",
};

export function etiqueta(e: Etiqueta | string, detalhe = ""): HTMLSpanElement {
  const t = String(e);
  return h("span", { class: `etiqueta ${t}`, tabindex: 0, "data-dica": `<b>[${t}]</b> ${DESCRICAO_ETIQUETA[t] ?? ""}${detalhe ? `<br>${detalhe}` : ""}`, "aria-label": `etiqueta ${t}` }, t);
}

/* ---------------------------------------------------------------- campos */
export interface OpcoesCampoNumerico {
  rotulo: string;
  unidade?: string;
  valor: number;
  min: number;
  max: number;
  passo?: number;
  log?: boolean;
  etiqueta?: Etiqueta | string;
  dica?: string;
  casas?: number;
  /** formato científico no campo de texto */
  cientifico?: boolean;
  aoMudar: (v: number) => void;
  /** durante o arraste (antes de soltar), opcional */
  aoArrastar?: (v: number) => void;
  id?: string;
}

export function campoNumerico(o: OpcoesCampoNumerico): { el: HTMLElement; definir: (v: number) => void } {
  const id = o.id ?? novoId("campo");
  const N = 1000;
  const paraFaixa = (v: number) => (o.log ? ((Math.log10(v) - Math.log10(o.min)) / (Math.log10(o.max) - Math.log10(o.min))) * N : ((v - o.min) / (o.max - o.min)) * N);
  const deFaixa = (f: number) => {
    let v = o.log ? 10 ** (Math.log10(o.min) + (f / N) * (Math.log10(o.max) - Math.log10(o.min))) : o.min + (f / N) * (o.max - o.min);
    if (o.passo && !o.log) v = Math.round(v / o.passo) * o.passo;
    if (o.log) {
      const e = Math.floor(Math.log10(v));
      v = Number((v / 10 ** e).toFixed(2)) * 10 ** e;
    }
    return v;
  };
  const fmt = (v: number) => (o.cientifico ? v.toExponential(2).replace("e+", "e") : o.casas !== undefined ? br(v, o.casas).replace(/\./g, "") : num(v, 4).replace(/\./g, ""));
  const faixa = h("input", { type: "range", min: 0, max: N, step: 1, id: id + "-faixa", "aria-label": o.rotulo });
  const texto = h("input", { type: "text", inputmode: "decimal", id, spellcheck: false, "aria-label": `${o.rotulo}${o.unidade ? ` em ${o.unidade}` : ""}` });
  const caixa = h("div", { class: "entrada-num" }, texto, o.unidade ? h("span", null, o.unidade) : null);
  let atual = o.valor;
  const definir = (v: number) => {
    atual = v;
    faixa.value = String(Math.round(paraFaixa(Math.min(Math.max(v, o.min), o.max))));
    if (document.activeElement !== texto) texto.value = fmt(v);
    caixa.classList.remove("invalida");
  };
  faixa.addEventListener("input", () => {
    const v = deFaixa(+faixa.value);
    texto.value = fmt(v);
    o.aoArrastar?.(v);
  });
  faixa.addEventListener("change", () => {
    atual = deFaixa(+faixa.value);
    o.aoMudar(atual);
  });
  const confirmar = () => {
    const s = texto.value.trim().replace(/\s/g, "").replace("×10", "e").replace(",", ".").replace("−", "-");
    const v = Number(s);
    if (!Number.isFinite(v) || v < o.min || v > o.max) {
      caixa.classList.add("invalida");
      texto.title = `aceita de ${num(o.min)} a ${num(o.max)}${o.unidade ? " " + o.unidade : ""}`;
      return;
    }
    caixa.classList.remove("invalida");
    if (v !== atual) {
      definir(v);
      o.aoMudar(v);
    }
  };
  texto.addEventListener("change", confirmar);
  texto.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      confirmar();
      texto.blur();
    } else if (e.key === "Escape") {
      texto.value = fmt(atual);
      texto.blur();
    }
  });
  texto.addEventListener("blur", () => (texto.value = fmt(atual)));
  definir(o.valor);
  const el = h(
    "div",
    { class: "campo" },
    h("label", { class: "campo-rotulo", for: id }, h("span", { class: "nome", "data-dica": o.dica ?? null }, o.rotulo), o.etiqueta ? etiqueta(o.etiqueta, o.dica ?? "") : null),
    h("div", { class: "campo-linha" }, faixa, caixa),
  );
  return { el, definir };
}

export interface OpcoesSeletor<V extends string> {
  rotulo?: string;
  valor: V;
  opcoes: [V, string][];
  aoMudar: (v: V) => void;
  etiqueta?: Etiqueta | string;
  dica?: string;
  id?: string;
}

export function seletor<V extends string>(o: OpcoesSeletor<V>): { el: HTMLElement; sel: HTMLSelectElement; definir: (v: V) => void } {
  const id = o.id ?? novoId("sel");
  const sel = h("select", { id, "aria-label": o.rotulo ?? null }, ...o.opcoes.map(([v, t]) => h("option", { value: v }, t)));
  sel.value = o.valor;
  sel.addEventListener("change", () => o.aoMudar(sel.value as V));
  const el = o.rotulo
    ? h("div", { class: "campo" }, h("label", { class: "campo-rotulo", for: id }, h("span", { class: "nome", "data-dica": o.dica ?? null }, o.rotulo), o.etiqueta ? etiqueta(o.etiqueta, o.dica ?? "") : null), sel)
    : sel;
  return { el, sel, definir: (v) => (sel.value = v) };
}

export function alternador(rotulo: string, marcado: boolean, aoMudar: (v: boolean) => void, dica?: string): { el: HTMLLabelElement; caixa: HTMLInputElement } {
  const caixa = h("input", { type: "checkbox", id: novoId("alt") });
  caixa.checked = marcado;
  caixa.addEventListener("change", () => aoMudar(caixa.checked));
  return { el: h("label", { class: "alternador", "data-dica": dica ?? null }, caixa, rotulo), caixa };
}

export function botao(conteudo: string | (Node | string)[], aoClicar: (e: MouseEvent) => void, o: { primario?: boolean; fantasma?: boolean; icone?: string; dica?: string; id?: string; atalho?: string; pressionado?: boolean } = {}): HTMLButtonElement {
  const filhos = typeof conteudo === "string" ? [conteudo] : conteudo;
  const b = h(
    "button",
    { type: "button", class: `botao${o.primario ? " primario" : ""}${o.fantasma ? " fantasma" : ""}`, id: o.id ?? null, "data-dica": o.dica ?? null, "aria-pressed": o.pressionado === undefined ? null : String(o.pressionado) },
    o.icone ? icone(o.icone) : null,
    ...filhos.map((f) => (typeof f === "string" && f ? h("span", null, f) : f)),
    o.atalho ? h("kbd", null, o.atalho) : null,
  );
  b.addEventListener("click", aoClicar);
  return b;
}

export function painel(titulo: string, corpo: Node, ferramentas: (Node | null)[] = [], o: { semMargem?: boolean; id?: string } = {}): HTMLElement {
  return h(
    "section",
    { class: "painel", id: o.id ?? null, "aria-label": titulo },
    h("header", { class: "painel-cab" }, h("h2", null, titulo), h("span", { class: "espaco" }), ...ferramentas),
    h("div", { class: `painel-corpo${o.semMargem ? " sem-margem" : ""}` }, corpo),
  );
}

export function metrica(rotulo: string, valor: string, o: { etiqueta?: string; dica?: string; alerta?: boolean } = {}): HTMLElement {
  return h("div", { class: `metrica${o.alerta ? " alerta" : ""}` }, h("b", { title: valor }, valor), h("span", null, h("em", { "data-dica": o.dica ?? null }, rotulo), o.etiqueta ? etiqueta(o.etiqueta, o.dica ?? "") : null));
}

/* ---------------------------------------------------------------- avisos, menus e janelas */
let pilhaToast: HTMLElement | null = null;
export function aviso(texto: string, tipo: "info" | "ok" | "erro" = "info", ms = 3600): void {
  if (!pilhaToast) {
    pilhaToast = h("div", { class: "toast-pilha", role: "status", "aria-live": "polite" });
    document.body.append(pilhaToast);
  }
  const t = h("div", { class: `toast ${tipo}` }, texto);
  pilhaToast.append(t);
  setTimeout(() => t.remove(), ms);
}

export interface ItemMenu {
  texto: string;
  detalhe?: string;
  acao?: () => void;
  separador?: boolean;
  desativado?: boolean;
}

let menuAberto: HTMLElement | null = null;
export function fecharMenu(): void {
  menuAberto?.remove();
  menuAberto = null;
}

export function abrirMenu(ancora: HTMLElement, itens: ItemMenu[]): void {
  fecharMenu();
  const m = h("div", { class: "menu", role: "menu" });
  for (const it of itens) {
    if (it.separador) {
      m.append(h("hr"));
      continue;
    }
    const b = h("button", { type: "button", role: "menuitem", disabled: it.desativado ?? false }, h("span", null, it.texto), it.detalhe ? h("small", null, it.detalhe) : null);
    b.addEventListener("click", () => {
      fecharMenu();
      it.acao?.();
    });
    m.append(b);
  }
  document.body.append(m);
  const r = ancora.getBoundingClientRect();
  const mr = m.getBoundingClientRect();
  m.style.left = `${Math.max(8, Math.min(window.innerWidth - mr.width - 8, r.left))}px`;
  m.style.top = `${r.bottom + mr.height + 8 > window.innerHeight ? Math.max(8, r.top - mr.height - 4) : r.bottom + 4}px`;
  menuAberto = m;
  (m.querySelector("button") as HTMLButtonElement | null)?.focus();
  setTimeout(() => {
    const fora = (e: Event) => {
      if (!m.contains(e.target as Node)) {
        fecharMenu();
        document.removeEventListener("pointerdown", fora, true);
      }
    };
    document.addEventListener("pointerdown", fora, true);
  }, 0);
  m.addEventListener("keydown", (e) => {
    const bs = [...m.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
    const i = bs.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      fecharMenu();
      ancora.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      bs[(i + 1) % bs.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      bs[(i - 1 + bs.length) % bs.length]?.focus();
    }
  });
}

export function abrirModal(titulo: string, conteudo: Node, acoes: { texto: string; primario?: boolean; acao?: () => boolean | void }[]): () => void {
  const fundo = h("div", { class: "modal-fundo" });
  const fechar = () => fundo.remove();
  const caixa = h(
    "div",
    { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": titulo },
    h("h2", null, titulo),
    conteudo,
    h("div", { class: "acoes" }, ...acoes.map((a) => botao(a.texto, () => {
      if (a.acao?.() !== false) fechar();
    }, { primario: a.primario }))),
  );
  fundo.append(caixa);
  fundo.addEventListener("pointerdown", (e) => {
    if (e.target === fundo) fechar();
  });
  fundo.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fechar();
  });
  document.body.append(fundo);
  (caixa.querySelector("input, select, button") as HTMLElement | null)?.focus();
  return fechar;
}

export function legenda(itens: { cor: string; texto: string; ponto?: boolean; tracejado?: boolean }[]): HTMLElement {
  return h("div", { class: "legenda" }, ...itens.map((i) => h("span", null, h("i", { class: i.ponto ? "ponto" : "", style: i.tracejado ? `background: repeating-linear-gradient(90deg, ${i.cor} 0 4px, transparent 4px 7px)` : `background:${i.cor}` }), i.texto)));
}
