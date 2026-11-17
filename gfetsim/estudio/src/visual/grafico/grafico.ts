/**
 * Gráfico científico do estúdio: eixos lineares ou logarítmicos, eixo secundário,
 * bandas, marcas de referência, cursor com leitura de todas as séries, zoom por seleção
 * (duplo clique volta), legenda que liga e desliga séries, e exportação em PNG, SVG e CSV.
 */
import { h, aoRedimensionar, cssVar } from "@/ui/dom";
import { br, num, sobrescrito, csvNum } from "@/ui/formato";
import { PincelCanvas, PincelSVG, type Pincel } from "./pincel";

export interface OpcoesEixo {
  rotulo: string;
  log?: boolean;
  min?: number;
  max?: number;
  formato?: (v: number) => string;
  /** fração de folga nas pontas do eixo linear automático */
  folga?: number;
  incluirZero?: boolean;
  /** marcas fixas no eixo, no lugar das automáticas */
  ticks?: number[];
}

export interface Serie {
  nome: string;
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  cor: string;
  largura?: number;
  tracejado?: number[];
  tipo?: "linha" | "pontos" | "degrau" | "barras" | "area";
  eixo?: "y" | "y2";
  alfa?: number;
  raio?: number;
  banda?: { lo: ArrayLike<number>; hi: ArrayLike<number>; alfa?: number };
  legenda?: boolean;
  /** usada só na leitura do cursor e no CSV */
  unidade?: string;
}

export interface Marca {
  eixo: "x" | "y" | "y2";
  valor: number;
  cor: string;
  rotulo?: string;
  tracejado?: number[];
}

export interface Regiao {
  eixo: "x" | "y" | "y2";
  de: number;
  ate: number;
  cor: string;
  alfa?: number;
  rotulo?: string;
}

export interface PontoDestaque {
  x: number;
  y: number;
  cor: string;
  eixo?: "y" | "y2";
  rotulo?: string;
}

export interface Anotacao {
  x: number;
  y: number;
  texto: string;
  cor?: string;
  eixo?: "y" | "y2";
  alinhar?: "left" | "center" | "right";
}

export interface OpcoesGrafico {
  x: OpcoesEixo;
  y: OpcoesEixo;
  y2?: OpcoesEixo;
  altura?: number;
  razao?: number;
  alturaMin?: number;
  alturaMax?: number;
  legenda?: boolean;
  nomeArquivo?: string;
  rotuloAcessivel?: string;
  /** margem esquerda em px, para rótulos de categoria longos */
  margemEsquerda?: number;
}

export interface Conteudo {
  series: Serie[];
  marcas?: Marca[];
  regioes?: Regiao[];
  pontos?: PontoDestaque[];
  anotacoes?: Anotacao[];
}

interface Escala {
  min: number;
  max: number;
  log: boolean;
  p0: number;
  p1: number;
}

const resolverCor = (c: string, el: Element) => (c.startsWith("var(") ? cssVar(c.slice(4, -1), el) || "#888" : c);

function paraPx(v: number, e: Escala): number {
  if (e.log) {
    if (!(v > 0)) return NaN;
    return e.p0 + ((Math.log10(v) - Math.log10(e.min)) / (Math.log10(e.max) - Math.log10(e.min))) * (e.p1 - e.p0);
  }
  return e.p0 + ((v - e.min) / (e.max - e.min)) * (e.p1 - e.p0);
}

function dePx(p: number, e: Escala): number {
  const t = (p - e.p0) / (e.p1 - e.p0);
  return e.log ? 10 ** (Math.log10(e.min) + t * (Math.log10(e.max) - Math.log10(e.min))) : e.min + t * (e.max - e.min);
}

export function ticksLineares(a: number, b: number, n: number): number[] {
  const d = Math.abs(b - a);
  if (!(d > 0)) return [a];
  const bruto = d / Math.max(1, n);
  const p = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= bruto) ?? 10 * p;
  const out: number[] = [];
  for (let v = Math.ceil(Math.min(a, b) / passo) * passo; v <= Math.max(a, b) + passo * 1e-9; v += passo) out.push(Math.abs(v) < passo * 1e-9 ? 0 : Number(v.toPrecision(12)));
  return out;
}

function formatoLinear(ticks: number[]): (v: number) => string {
  if (ticks.length < 2) return (v) => num(v);
  const passo = Math.abs(ticks[1] - ticks[0]);
  const maior = Math.max(...ticks.map(Math.abs));
  if (maior >= 1e5 || (passo < 1e-3 && maior < 1e-2)) {
    const e = Math.floor(Math.log10(maior || 1));
    return (v) => (v === 0 ? "0" : `${br(v / 10 ** e, Math.max(0, -Math.floor(Math.log10(passo / 10 ** e))))}e${e}`);
  }
  const casas = Math.max(0, -Math.floor(Math.log10(passo) + 1e-9));
  return (v) => br(v, Math.min(casas, 6));
}

export class Grafico {
  readonly raiz: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  private readonly legendaEl: HTMLElement;
  private readonly sonda: HTMLElement;
  private conteudo: Conteudo = { series: [] };
  private ocultas = new Set<string>();
  private zoom: { x?: [number, number]; y?: [number, number]; y2?: [number, number] } = {};
  private esc: { x: Escala; y: Escala; y2: Escala | null } | null = null;
  private selecao: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private cursor: { x: number; y: number } | null = null;
  private w = 0;
  private hgt = 0;
  private limparRO: () => void;

  constructor(container: HTMLElement, readonly o: OpcoesGrafico) {
    this.canvas = h("canvas", { class: "tela", role: "img", "aria-label": o.rotuloAcessivel ?? `${o.y.rotulo} em função de ${o.x.rotulo}` });
    this.sonda = h("div", { class: "sonda", hidden: true });
    this.legendaEl = h("div", { class: "legenda", style: "margin-top:6px" });
    this.raiz = h("div", { class: "grafico" }, h("div", { class: "palco" }, this.canvas, this.sonda), o.legenda === false ? null : this.legendaEl);
    container.append(this.raiz);
    this.limparRO = aoRedimensionar(this.raiz, () => this.desenhar());
    this.instalarInteracao();
  }

  destruir(): void {
    this.limparRO();
    this.raiz.remove();
  }

  definir(c: Conteudo): void {
    this.conteudo = c;
    this.montarLegenda();
    this.desenhar();
  }

  get dados(): Conteudo {
    return this.conteudo;
  }

  resetarZoom(): void {
    this.zoom = {};
    this.desenhar();
  }

  private montarLegenda(): void {
    if (this.o.legenda === false) return;
    this.legendaEl.replaceChildren();
    for (const s of this.conteudo.series) {
      if (s.legenda === false) continue;
      const oculta = this.ocultas.has(s.nome);
      const b = h(
        "button",
        { type: "button", class: "botao fantasma", style: `padding:1px 6px;opacity:${oculta ? 0.45 : 1}`, "aria-pressed": String(!oculta), "data-dica": "clique para mostrar ou esconder" },
        h("i", { class: s.tipo === "pontos" ? "ponto" : "", style: s.tracejado ? `background:repeating-linear-gradient(90deg, ${s.cor} 0 4px, transparent 4px 7px)` : `background:${s.cor}` }),
        s.nome,
      );
      b.addEventListener("click", () => {
        if (this.ocultas.has(s.nome)) this.ocultas.delete(s.nome);
        else this.ocultas.add(s.nome);
        this.montarLegenda();
        this.desenhar();
      });
      this.legendaEl.append(b);
    }
  }

  private tamanho(): { w: number; h: number } {
    const w = Math.max(200, Math.round(this.raiz.clientWidth || 400));
    let hh = this.o.altura ?? Math.round(w * (this.o.razao ?? 0.6));
    hh = Math.min(this.o.alturaMax ?? 520, Math.max(this.o.alturaMin ?? 180, hh));
    return { w, h: hh };
  }

  private faixa(eixo: "x" | "y" | "y2", o: OpcoesEixo): [number, number] {
    const z = this.zoom[eixo];
    if (z) return z;
    let lo = Infinity, hi = -Infinity;
    const usar = (v: number) => {
      if (!Number.isFinite(v) || (o.log && v <= 0)) return;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    };
    const xr = eixo !== "x" ? (this.zoom.x ?? (this.o.x.min !== undefined && this.o.x.max !== undefined ? [this.o.x.min, this.o.x.max] : null)) : null;
    for (const s of this.conteudo.series) {
      if (this.ocultas.has(s.nome)) continue;
      if (eixo === "x") for (let i = 0; i < s.x.length; i++) usar(s.x[i]);
      else if ((s.eixo ?? "y") === eixo) {
        for (let i = 0; i < s.y.length; i++) {
          if (xr && (s.x[i] < xr[0] || s.x[i] > xr[1])) continue;
          usar(s.y[i]);
          if (s.banda) {
            usar(s.banda.lo[i]);
            usar(s.banda.hi[i]);
          }
        }
      }
    }
    for (const p of this.conteudo.pontos ?? []) if (eixo === "x") usar(p.x);
    else if ((p.eixo ?? "y") === eixo) usar(p.y);
    if (o.incluirZero && !o.log) {
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 0);
    }
    if (o.min !== undefined) lo = o.min;
    if (o.max !== undefined) hi = o.max;
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return o.log ? [1, 10] : [0, 1];
    if (o.log) {
      if (o.min === undefined) lo = 10 ** Math.floor(Math.log10(lo) + 1e-9);
      if (o.max === undefined) hi = 10 ** Math.ceil(Math.log10(hi) - 1e-9);
      if (hi <= lo) hi = lo * 10;
      return [lo, hi];
    }
    if (hi === lo) {
      const d = Math.abs(lo) * 0.1 || 1;
      return [lo - d, hi + d];
    }
    const f = o.folga ?? (eixo === "x" ? 0 : 0.05);
    const d = (hi - lo) * f;
    return [o.min !== undefined ? lo : lo - d, o.max !== undefined ? hi : hi + d];
  }

  /** Desenha em qualquer pincel com o tamanho dele. */
  desenharEm(p: Pincel, interativo: boolean): void {
    const el = this.raiz;
    const C = (n: string) => cssVar(n, el);
    const corTexto = C("--texto-2"), corTexto3 = C("--texto-3"), corGrade = C("--grade"), corBorda = C("--borda-forte");
    const fonte = C("--f-dado") || "monospace";
    const W = p.largura, H = p.altura;
    const temY2 = !!this.o.y2 && this.conteudo.series.some((s) => s.eixo === "y2");
    const margem = { e: this.o.margemEsquerda ?? 60, d: temY2 ? 60 : 14, t: 12, b: 40 };
    const [x0, x1] = this.faixa("x", this.o.x);
    const [y0, y1] = this.faixa("y", this.o.y);
    const ex: Escala = { min: x0, max: x1, log: !!this.o.x.log, p0: margem.e, p1: W - margem.d };
    const ey: Escala = { min: y0, max: y1, log: !!this.o.y.log, p0: H - margem.b, p1: margem.t };
    let ey2: Escala | null = null;
    if (temY2 && this.o.y2) {
      const [a, b] = this.faixa("y2", this.o.y2);
      ey2 = { min: a, max: b, log: !!this.o.y2.log, p0: H - margem.b, p1: margem.t };
    }
    if (interativo) this.esc = { x: ex, y: ey, y2: ey2 };
    const escDe = (eixo?: "y" | "y2") => (eixo === "y2" && ey2 ? ey2 : ey);
    p.retangulo(0, 0, W, H, C("--tela"));
    // grade e ticks
    const ticks = (e: Escala, n: number): { v: number; maior: boolean }[] => {
      if (!e.log) return ticksLineares(e.min, e.max, n).map((v) => ({ v, maior: true }));
      const out: { v: number; maior: boolean }[] = [];
      const a = Math.floor(Math.log10(e.min)), b = Math.ceil(Math.log10(e.max));
      const decadas = b - a;
      const passo = Math.max(1, Math.ceil(decadas / Math.max(2, n)));
      for (let k = a; k <= b; k++) {
        if ((k - a) % passo === 0) out.push({ v: 10 ** k, maior: true });
        if (decadas <= 8 && passo === 1) for (let m = 2; m < 10; m++) out.push({ v: m * 10 ** k, maior: false });
      }
      return out.filter((t) => t.v >= e.min * (1 - 1e-9) && t.v <= e.max * (1 + 1e-9));
    };
    const tx = this.o.x.ticks ? this.o.x.ticks.map((v) => ({ v, maior: true })) : ticks(ex, Math.max(3, Math.floor((ex.p1 - ex.p0) / 80)));
    const ty = this.o.y.ticks ? this.o.y.ticks.map((v) => ({ v, maior: true })) : ticks(ey, Math.max(3, Math.floor((ey.p0 - ey.p1) / 46)));
    const fmtX = this.o.x.formato ?? (ex.log ? (v: number) => `10${sobrescrito(Math.round(Math.log10(v)))}` : formatoLinear(tx.map((t) => t.v)));
    const fmtY = this.o.y.formato ?? (ey.log ? (v: number) => `10${sobrescrito(Math.round(Math.log10(v)))}` : formatoLinear(ty.map((t) => t.v)));
    for (const t of tx) {
      const px = paraPx(t.v, ex);
      p.linha([px, px], [ey.p1, ey.p0], { cor: corGrade, largura: t.maior ? 1 : 0.6, alfa: t.maior ? 1 : 0.6 });
      if (t.maior) p.texto(fmtX(t.v), px, H - margem.b + 15, { cor: corTexto3, tamanho: 11, alinhar: "center", fonte });
    }
    for (const t of ty) {
      const py = paraPx(t.v, ey);
      p.linha([ex.p0, ex.p1], [py, py], { cor: corGrade, largura: t.maior ? 1 : 0.6, alfa: t.maior ? 1 : 0.6 });
      if (t.maior) p.texto(fmtY(t.v), margem.e - 6, py + 4, { cor: corTexto3, tamanho: 11, alinhar: "right", fonte });
    }
    if (ey2 && this.o.y2) {
      const t2 = ticks(ey2, Math.max(3, Math.floor((ey2.p0 - ey2.p1) / 46)));
      const fmt2 = this.o.y2.formato ?? (ey2.log ? (v: number) => `10${sobrescrito(Math.round(Math.log10(v)))}` : formatoLinear(t2.map((t) => t.v)));
      for (const t of t2) if (t.maior) p.texto(fmt2(t.v), W - margem.d + 6, paraPx(t.v, ey2) + 4, { cor: corTexto3, tamanho: 11, alinhar: "left", fonte });
      p.texto(this.o.y2.rotulo, W - 12, (ey.p0 + ey.p1) / 2, { cor: corTexto, tamanho: 11, alinhar: "center", rotacao: Math.PI / 2 });
    }
    p.texto(this.o.x.rotulo, (ex.p0 + ex.p1) / 2, H - 8, { cor: corTexto, tamanho: 11, alinhar: "center" });
    if (!this.o.margemEsquerda || this.o.margemEsquerda < 100) p.texto(this.o.y.rotulo, 13, (ey.p0 + ey.p1) / 2, { cor: corTexto, tamanho: 11, alinhar: "center", rotacao: -Math.PI / 2 });
    // conteúdo recortado na área do gráfico
    p.recortar(ex.p0, ey.p1, ex.p1 - ex.p0, ey.p0 - ey.p1);
    for (const r of this.conteudo.regioes ?? []) {
      const cor = resolverCor(r.cor, el);
      if (r.eixo === "x") {
        const a = paraPx(r.de, ex), b = paraPx(r.ate, ex);
        p.retangulo(Math.min(a, b), ey.p1, Math.abs(b - a), ey.p0 - ey.p1, cor, r.alfa ?? 0.15);
        if (r.rotulo) p.texto(r.rotulo, Math.min(a, b) + 4, ey.p1 + 12, { cor, tamanho: 11, fonte });
      } else {
        const e = escDe(r.eixo === "y2" ? "y2" : "y");
        const a = paraPx(r.de, e), b = paraPx(r.ate, e);
        p.retangulo(ex.p0, Math.min(a, b), ex.p1 - ex.p0, Math.abs(b - a), cor, r.alfa ?? 0.15);
        if (r.rotulo) p.texto(r.rotulo, ex.p1 - 4, Math.min(a, b) + 12, { cor, tamanho: 11, alinhar: "right", fonte });
      }
    }
    for (const s of this.conteudo.series) {
      if (this.ocultas.has(s.nome)) continue;
      const e = escDe(s.eixo);
      const cor = resolverCor(s.cor, el);
      const n = Math.min(s.x.length, s.y.length);
      const xs = new Float64Array(n), ys = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        xs[i] = paraPx(s.x[i], ex);
        ys[i] = paraPx(s.y[i], e);
      }
      if (s.banda) {
        const pts: number[] = [], qts: number[] = [];
        for (let i = 0; i < n; i++) {
          pts.push(xs[i]);
          qts.push(paraPx(s.banda.hi[i], e));
        }
        for (let i = n - 1; i >= 0; i--) {
          pts.push(xs[i]);
          qts.push(paraPx(s.banda.lo[i], e));
        }
        const ok = qts.every(Number.isFinite);
        if (ok) p.poligono(pts, qts, cor, s.banda.alfa ?? 0.18);
      }
      const tipo = s.tipo ?? "linha";
      if (tipo === "area") {
        const base = paraPx(e.log ? e.min : Math.max(e.min, Math.min(0, e.max)), e);
        p.poligono([xs[0], ...xs, xs[n - 1]], [base, ...ys], cor, s.alfa ?? 0.25);
        p.linha(xs, ys, { cor, largura: s.largura ?? 1.5 });
      } else if (tipo === "pontos") {
        for (let i = 0; i < n; i++) if (Number.isFinite(xs[i]) && Number.isFinite(ys[i])) p.circulo(xs[i], ys[i], s.raio ?? 2.5, cor, undefined, s.alfa ?? 0.85);
      } else if (tipo === "barras") {
        const base = paraPx(e.log ? e.min : Math.max(e.min, 0), e);
        const larg = n > 1 ? Math.abs(xs[1] - xs[0]) * 0.85 : 8;
        for (let i = 0; i < n; i++) if (Number.isFinite(ys[i])) p.retangulo(xs[i] - larg / 2, Math.min(ys[i], base), larg, Math.abs(base - ys[i]), cor, s.alfa ?? 0.75);
      } else if (tipo === "degrau") {
        const dx: number[] = [], dy: number[] = [];
        for (let i = 0; i < n; i++) {
          if (i > 0) {
            dx.push(xs[i]);
            dy.push(ys[i - 1]);
          }
          dx.push(xs[i]);
          dy.push(ys[i]);
        }
        p.linha(dx, dy, { cor, largura: s.largura ?? 1.5, tracejado: s.tracejado, alfa: s.alfa });
      } else p.linha(xs, ys, { cor, largura: s.largura ?? 1.8, tracejado: s.tracejado, alfa: s.alfa });
    }
    for (const m of this.conteudo.marcas ?? []) {
      const cor = resolverCor(m.cor, el);
      if (m.eixo === "x") {
        const px = paraPx(m.valor, ex);
        p.linha([px, px], [ey.p1, ey.p0], { cor, largura: 1, tracejado: m.tracejado ?? [4, 3] });
        // rótulo das marcas verticais embaixo, para não colidir com as horizontais
        if (m.rotulo) p.texto(m.rotulo, px + 4, ey.p0 - 6, { cor, tamanho: 11, fonte });
      } else {
        const e = escDe(m.eixo === "y2" ? "y2" : "y");
        const py = paraPx(m.valor, e);
        p.linha([ex.p0, ex.p1], [py, py], { cor, largura: 1, tracejado: m.tracejado ?? [4, 3] });
        if (m.rotulo) p.texto(m.rotulo, ex.p1 - 4, py - 4, { cor, tamanho: 11, alinhar: "right", fonte });
      }
    }
    for (const a of this.conteudo.anotacoes ?? []) p.texto(a.texto, paraPx(a.x, ex), paraPx(a.y, escDe(a.eixo)), { cor: resolverCor(a.cor ?? "var(--texto-2)", el), tamanho: 11, alinhar: a.alinhar ?? "left", fonte });
    for (const pt of this.conteudo.pontos ?? []) {
      const px = paraPx(pt.x, ex), py = paraPx(pt.y, escDe(pt.eixo));
      if (Number.isFinite(px) && Number.isFinite(py)) {
        p.circulo(px, py, 5, resolverCor(pt.cor, el), C("--superficie"));
        if (pt.rotulo) p.texto(pt.rotulo, px + 8, py - 6, { cor: resolverCor(pt.cor, el), tamanho: 11, fonte });
      }
    }
    if (interativo && this.cursor) {
      const { x } = this.cursor;
      if (x >= ex.p0 && x <= ex.p1) p.linha([x, x], [ey.p1, ey.p0], { cor: C("--texto-3"), largura: 1, alfa: 0.6 });
    }
    if (interativo && this.selecao) {
      const s = this.selecao;
      p.retangulo(Math.min(s.x0, s.x1), Math.min(s.y0, s.y1), Math.abs(s.x1 - s.x0), Math.abs(s.y1 - s.y0), C("--acento"), 0.12, C("--acento"));
    }
    p.restaurar();
    p.retangulo(ex.p0, ey.p1, ex.p1 - ex.p0, ey.p0 - ey.p1, "none", 1, corBorda);
  }

  desenhar(): void {
    const { w, h: hh } = this.tamanho();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(hh * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(hh * dpr);
      this.canvas.style.height = `${hh}px`;
    }
    this.w = w;
    this.hgt = hh;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.desenharEm(new PincelCanvas(ctx, w, hh, cssVar("--f-dado", this.raiz) || "monospace"), true);
  }

  /** Imagem em escala maior para figuras de artigo e slides. */
  png(escala = 3): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = Math.round(this.w * escala);
    c.height = Math.round(this.hgt * escala);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
    this.desenharEm(new PincelCanvas(ctx, this.w, this.hgt, cssVar("--f-dado", this.raiz) || "monospace"), false);
    return c;
  }

  svg(): string {
    const p = new PincelSVG(this.w, this.hgt, cssVar("--f-dado", this.raiz) || "monospace");
    this.desenharEm(p, false);
    return p.resultado();
  }

  csv(): string {
    const linhas: string[] = [];
    for (const s of this.conteudo.series) {
      linhas.push(`# ${s.nome}${s.unidade ? ` (${s.unidade})` : ""}`);
      linhas.push(`${this.o.x.rotulo},${s.eixo === "y2" && this.o.y2 ? this.o.y2.rotulo : this.o.y.rotulo}`);
      for (let i = 0; i < Math.min(s.x.length, s.y.length); i++) linhas.push(`${csvNum(s.x[i])},${csvNum(s.y[i])}`);
      linhas.push("");
    }
    return linhas.join("\n");
  }

  private instalarInteracao(): void {
    const c = this.canvas;
    const local = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    let arrastando = false;
    c.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.pointerType === "touch") return;
      const p = local(e);
      this.selecao = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      arrastando = true;
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener("pointermove", (e) => {
      const p = local(e);
      this.cursor = p;
      if (arrastando && this.selecao) {
        this.selecao.x1 = p.x;
        this.selecao.y1 = p.y;
      }
      this.desenhar();
      this.atualizarSonda(p.x, p.y);
    });
    c.addEventListener("pointerup", () => {
      if (arrastando && this.selecao && this.esc) {
        const s = this.selecao;
        if (Math.abs(s.x1 - s.x0) > 8 && Math.abs(s.y1 - s.y0) > 8) {
          const xa = dePx(Math.min(s.x0, s.x1), this.esc.x), xb = dePx(Math.max(s.x0, s.x1), this.esc.x);
          const ya = dePx(Math.max(s.y0, s.y1), this.esc.y), yb = dePx(Math.min(s.y0, s.y1), this.esc.y);
          this.zoom.x = [xa, xb];
          this.zoom.y = [ya, yb];
          if (this.esc.y2) this.zoom.y2 = [dePx(Math.max(s.y0, s.y1), this.esc.y2), dePx(Math.min(s.y0, s.y1), this.esc.y2)];
        }
      }
      arrastando = false;
      this.selecao = null;
      this.desenhar();
    });
    c.addEventListener("pointerleave", () => {
      this.cursor = null;
      this.sonda.hidden = true;
      this.desenhar();
    });
    c.addEventListener("dblclick", () => this.resetarZoom());
  }

  private atualizarSonda(px: number, py: number): void {
    if (!this.esc) return;
    const { x: ex } = this.esc;
    if (px < ex.p0 || px > ex.p1) {
      this.sonda.hidden = true;
      return;
    }
    const xv = dePx(px, ex);
    const linhas: string[] = [`<b>${this.o.x.rotulo}</b> ${num(xv, 4)}`];
    for (const s of this.conteudo.series) {
      if (this.ocultas.has(s.nome) || s.legenda === false || s.tipo === "pontos" || s.x.length === 0) continue;
      let k = 0;
      let melhor = Infinity;
      for (let i = 0; i < s.x.length; i++) {
        const d = Math.abs(s.x[i] - xv);
        if (d < melhor) {
          melhor = d;
          k = i;
        }
      }
      linhas.push(`<span style="color:${resolverCor(s.cor, this.raiz)}">■</span> ${s.nome} <b>${num(s.y[k], 4)}${s.unidade ? " " + s.unidade : ""}</b>`);
    }
    this.sonda.innerHTML = linhas.slice(0, 9).join("<br>");
    this.sonda.hidden = false;
    const larg = this.sonda.offsetWidth;
    this.sonda.style.left = `${px + 14 + larg > this.w ? px - larg - 14 : px + 14}px`;
    this.sonda.style.top = `${Math.max(4, Math.min(this.hgt - this.sonda.offsetHeight - 4, py - 10))}px`;
  }
}
