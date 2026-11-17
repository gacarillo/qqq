/** Utilitários de DOM sem framework: criação declarativa, eventos e limpeza. */
type Filho = Node | string | number | null | undefined | false | Filho[];
type Atributos = Record<string, unknown> & {
  class?: string;
  style?: Partial<CSSStyleDeclaration> | string;
  dataset?: Record<string, string>;
};

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, atrs: Atributos | null = null, ...filhos: Filho[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (atrs) {
    for (const [k, v] of Object.entries(atrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = String(v);
      else if (k === "style") {
        if (typeof v === "string") el.setAttribute("style", v);
        else Object.assign(el.style, v);
      } else if (k === "dataset") Object.assign(el.dataset, v as Record<string, string>);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === "html") el.innerHTML = String(v);
      else if (v === true) el.setAttribute(k, "");
      else if (k in el && typeof v !== "string") (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, String(v));
    }
  }
  anexar(el, filhos);
  return el;
}

export function anexar(el: Element, filhos: Filho[]): void {
  for (const f of filhos.flat(Infinity as 1) as Filho[]) {
    if (f === null || f === undefined || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
}

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, atrs: Record<string, string | number> = {}, ...filhos: (SVGElement | string)[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(atrs)) el.setAttribute(k, String(v));
  for (const f of filhos) el.append(typeof f === "string" ? document.createTextNode(f) : f);
  return el;
}

export function limpar(el: Element): void {
  while (el.firstChild) el.firstChild.remove();
}

/** Agrupa funções de limpeza (ouvintes, observadores) para desmontar uma vista. */
export class Limpeza {
  private fs: (() => void)[] = [];
  add(f: (() => void) | (() => boolean)): void {
    this.fs.push(() => void f());
  }
  ouvir<K extends keyof WindowEventMap>(alvo: Window, tipo: K, f: (e: WindowEventMap[K]) => void, o?: AddEventListenerOptions): void;
  ouvir<K extends keyof HTMLElementEventMap>(alvo: HTMLElement, tipo: K, f: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions): void;
  ouvir(alvo: EventTarget, tipo: string, f: (e: Event) => void, o?: AddEventListenerOptions): void {
    alvo.addEventListener(tipo, f, o);
    this.fs.push(() => alvo.removeEventListener(tipo, f, o));
  }
  executar(): void {
    this.fs.splice(0).reverse().forEach((f) => f());
  }
}

/** Observa o tamanho de um elemento e chama f com largura e altura em CSS px. */
export function aoRedimensionar(el: Element, f: (w: number, h: number) => void): () => void {
  const ro = new ResizeObserver((ents) => {
    for (const e of ents) f(e.contentRect.width, e.contentRect.height);
  });
  ro.observe(el);
  return () => ro.disconnect();
}

export function debounce<A extends unknown[]>(f: (...a: A) => void, ms: number): (...a: A) => void {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...a: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => f(...a), ms);
  };
}

export const reduzirMovimento = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

let contadorId = 0;
export function novoId(prefixo = "c"): string {
  return `${prefixo}-${++contadorId}`;
}

export function cssVar(nome: string, el: Element = document.documentElement): string {
  return getComputedStyle(el).getPropertyValue(nome).trim();
}
