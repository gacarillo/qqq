/**
 * Visualizador de campo 2D no estilo dos simuladores de processo: corte transversal com
 * lateral na horizontal e profundidade para baixo, mesma escala nos dois eixos, mapa de
 * cor com barra, isolinhas por década, malha da simulação, regiões de material (óxido,
 * máscara, camada amorfa), sonda no cursor, cortes vertical, horizontal e livre, régua e
 * zoom. Desenha pelo Pincel, então exporta em PNG de alta resolução e em SVG.
 */
import { h, aoRedimensionar, cssVar } from "@/ui/dom";
import { num, sci, sobrescrito, br } from "@/ui/formato";
import { lut, type NomeMapa } from "../cores/mapas";
import { PincelCanvas, PincelSVG, type Pincel } from "../grafico/pincel";
import { isolinhas } from "./isolinhas";
import { ticksLineares } from "../grafico/grafico";

export interface Quadro2DVista {
  /** profundidade (nm, para baixo a partir da superfície original do Si) e lateral (nm) */
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  /** valores no índice i*ny + j */
  v: ArrayLike<number>;
  /** óxido e Si consumido por coluna (nm), opcionais */
  xox?: ArrayLike<number>;
  si?: ArrayLike<number>;
  /** máscara sobre y < 0 com esta espessura (nm), 0 sem máscara */
  mascara_nm?: number;
  /** células ainda amorfas, desenhadas hachuradas */
  amorfo?: ArrayLike<number>;
  /** sombra da máscara (nm) para desenhar o feixe na implantação */
  sombra_nm?: number;
}

export interface Grandeza {
  nome: string;
  unidade: string;
  log: boolean;
  min: number;
  max: number;
  /** níveis das isolinhas, no valor da grandeza */
  niveis: number[];
}

export type Ferramenta = "sonda" | "corte_v" | "corte_h" | "corte_livre" | "regua" | "mover";

export interface Corte {
  tipo: "v" | "h" | "livre";
  a: [number, number]; // (y, x) em nm
  b: [number, number];
  s: Float64Array; // distância ao longo do corte (nm)
  v: Float64Array;
}

export interface OpcoesCampo {
  mapa: NomeMapa;
  isolinhas: boolean;
  malha: boolean;
  materiais: boolean;
  escalaReal: boolean;
  aoCortar?: (c: Corte) => void;
}

export class Campo2D {
  readonly raiz: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  private readonly sonda: HTMLElement;
  private quadro: Quadro2DVista | null = null;
  private grandeza: Grandeza | null = null;
  private img: HTMLCanvasElement = document.createElement("canvas");
  private imgChave = "";
  private vista = { y0: -300, y1: 400, x0: -40, x1: 300 }; // nm
  private ferramenta: Ferramenta = "sonda";
  private corte: Corte | null = null;
  private regua: { a: [number, number]; b: [number, number] } | null = null;
  private arraste: { tipo: Ferramenta; ini: [number, number]; vistaIni: { y0: number; y1: number; x0: number; x1: number }; px0: [number, number] } | null = null;
  private area = { x: 0, y: 0, w: 1, h: 1 };
  private W = 0;
  private H = 0;
  private limparRO: () => void;

  constructor(container: HTMLElement, public o: OpcoesCampo) {
    this.canvas = h("canvas", { class: "tela", role: "img", "aria-label": "Corte transversal com o campo escolhido em cores" });
    this.sonda = h("div", { class: "sonda", hidden: true });
    this.raiz = h("div", { class: "palco" }, this.canvas, this.sonda);
    container.append(this.raiz);
    this.limparRO = aoRedimensionar(this.raiz, () => this.desenhar());
    this.instalar();
  }

  destruir(): void {
    this.limparRO();
    this.raiz.remove();
  }

  definirFerramenta(f: Ferramenta): void {
    this.ferramenta = f;
    this.canvas.style.cursor = f === "mover" ? "grab" : "crosshair";
  }

  definir(qOriginal: Quadro2DVista, g: Grandeza): void {
    const q = Campo2D.noReferencialFixo(qOriginal);
    const mudouGrade = !this.quadro || this.quadro.x.length !== q.x.length || this.quadro.y.length !== q.y.length || this.quadro.y[0] !== q.y[0];
    this.quadro = q;
    this.grandeza = g;
    this.imgChave = "";
    if (mudouGrade) this.ajustar();
    if (this.corte) this.recalcularCorte();
    this.desenhar();
  }

  /**
   * Na oxidação a profundidade de cada coluna é medida a partir da interface atual. Para
   * desenhar tudo no referencial da superfície original, a coluna j desce si[j] nm; acima
   * da interface o valor fica indefinido (transparente).
   */
  private static noReferencialFixo(q: Quadro2DVista): Quadro2DVista {
    if (!q.si || !Array.from(q.si).some((v) => v > 0)) return q;
    const nx = q.x.length, ny = q.y.length;
    const dx = q.x[1] - q.x[0];
    const v = new Float64Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      const d = q.si[j] ?? 0;
      for (let i = 0; i < nx; i++) {
        const xr = q.x[i] - d; // profundidade a partir da interface atual
        const f = (xr - q.x[0]) / dx;
        if (xr < 0) v[i * ny + j] = NaN;
        else if (f <= 0) v[i * ny + j] = q.v[j];
        else {
          const k = Math.min(nx - 2, Math.floor(f)), t = Math.min(1, f - k);
          v[i * ny + j] = q.v[k * ny + j] * (1 - t) + q.v[(k + 1) * ny + j] * t;
        }
      }
    }
    return { ...q, v };
  }

  ajustar(): void {
    if (!this.quadro) return;
    const q = this.quadro;
    const topo = Math.max(q.mascara_nm ?? 0, ...(q.xox ? Array.from(q.xox) : [0])) + 20;
    // começa na região da borda, onde está a física 2D; o duplo clique mostra a grade inteira
    const y0 = Math.max(q.y[0], -220), y1 = Math.min(q.y[q.y.length - 1], 300);
    this.vista = { y0, y1, x0: -Math.max(30, topo), x1: Math.min(q.x[q.x.length - 1], 260) };
    this.desenhar();
  }

  zoom(f: number, centro?: [number, number]): void {
    const v = this.vista;
    const cy = centro ? centro[0] : (v.y0 + v.y1) / 2;
    const cx = centro ? centro[1] : (v.x0 + v.x1) / 2;
    this.vista = { y0: cy + (v.y0 - cy) * f, y1: cy + (v.y1 - cy) * f, x0: cx + (v.x0 - cx) * f, x1: cx + (v.x1 - cx) * f };
    this.desenhar();
  }

  /** Valor bilinear no ponto (y, x) em nm. */
  valorEm(y: number, x: number): number {
    const q = this.quadro;
    if (!q) return NaN;
    const nx = q.x.length, ny = q.y.length;
    const fi = (x - q.x[0]) / (q.x[1] - q.x[0]);
    const fj = (y - q.y[0]) / (q.y[1] - q.y[0]);
    if (fi < 0 || fj < 0 || fi > nx - 1 || fj > ny - 1) return NaN;
    const i = Math.min(nx - 2, Math.floor(fi)), j = Math.min(ny - 2, Math.floor(fj));
    const ti = fi - i, tj = fj - j;
    const g = this.grandeza;
    const tr = (v: number) => (g?.log ? Math.log10(Math.max(v, 1e-300)) : v);
    const a = tr(q.v[i * ny + j]), b = tr(q.v[i * ny + j + 1]), c = tr(q.v[(i + 1) * ny + j]), d = tr(q.v[(i + 1) * ny + j + 1]);
    const r = (1 - ti) * ((1 - tj) * a + tj * b) + ti * ((1 - tj) * c + tj * d);
    return g?.log ? 10 ** r : r;
  }

  private superficieEm(y: number): { si: number; xox: number } {
    const q = this.quadro;
    if (!q || !q.xox) return { si: 0, xox: 0 };
    const j = Math.round((y - q.y[0]) / (q.y[1] - q.y[0]));
    const k = Math.max(0, Math.min(q.y.length - 1, j));
    return { si: q.si?.[k] ?? 0, xox: q.xox[k] ?? 0 };
  }

  private recalcularCorte(): void {
    if (!this.corte || !this.quadro) return;
    const { a, b, tipo } = this.corte;
    this.corte = this.amostrarCorte(tipo, a, b);
    this.o.aoCortar?.(this.corte);
  }

  private amostrarCorte(tipo: Corte["tipo"], a: [number, number], b: [number, number]): Corte {
    const n = 300;
    const s = new Float64Array(n), v = new Float64Array(n);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      const y = a[0] + t * (b[0] - a[0]), x = a[1] + t * (b[1] - a[1]);
      s[k] = tipo === "v" ? x : tipo === "h" ? y : t * L;
      v[k] = this.valorEm(y, x); // indefinido acima da interface atual

    }
    return { tipo, a, b, s, v };
  }

  cortar(tipo: Corte["tipo"], a: [number, number], b: [number, number]): void {
    this.corte = this.amostrarCorte(tipo, a, b);
    this.o.aoCortar?.(this.corte);
    this.desenhar();
  }

  get corteAtual(): Corte | null {
    return this.corte;
  }

  private imagem(): HTMLCanvasElement {
    const q = this.quadro!, g = this.grandeza!;
    const chave = `${this.o.mapa}|${g.nome}|${g.min}|${g.max}`;
    if (chave === this.imgChave) return this.img;
    const nx = q.x.length, ny = q.y.length;
    this.img.width = ny;
    this.img.height = nx;
    const ctx = this.img.getContext("2d")!;
    const dados = ctx.createImageData(ny, nx);
    const L = lut(this.o.mapa);
    const lo = g.log ? Math.log10(g.min) : g.min, hi = g.log ? Math.log10(g.max) : g.max;
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++) {
        const raw = q.v[i * ny + j];
        const val = g.log ? Math.log10(Math.max(raw, 1e-300)) : raw;
        const o = (i * ny + j) * 4;
        if (!Number.isFinite(val) || (g.log && raw < g.min)) {
          dados.data[o + 3] = 0;
          continue;
        }
        const t = Math.min(255, Math.max(0, Math.round(((val - lo) / (hi - lo)) * 255)));
        dados.data[o] = L[3 * t];
        dados.data[o + 1] = L[3 * t + 1];
        dados.data[o + 2] = L[3 * t + 2];
        dados.data[o + 3] = 255;
      }
    ctx.putImageData(dados, 0, 0);
    this.imgChave = chave;
    return this.img;
  }

  desenharEm(p: Pincel, interativo: boolean): void {
    const el = this.raiz;
    const C = (n: string) => cssVar(n, el);
    const fonte = C("--f-dado") || "monospace";
    const W = p.largura, H = p.altura;
    p.retangulo(0, 0, W, H, C("--tela"));
    if (!this.quadro || !this.grandeza) {
      p.texto("sem dados", W / 2, H / 2, { cor: C("--texto-3"), alinhar: "center", tamanho: 13 });
      return;
    }
    const q = this.quadro, g = this.grandeza;
    const barraW = 74;
    const m = { e: 52, d: barraW + 10, t: 12, b: 34 };
    let v = { ...this.vista };
    const aw = W - m.e - m.d, ah = H - m.t - m.b;
    if (this.o.escalaReal) {
      // mesma escala nos dois eixos: expande o lado que sobra
      const sy = aw / (v.y1 - v.y0), sx = ah / (v.x1 - v.x0);
      const s = Math.min(sy, sx);
      const cy = (v.y0 + v.y1) / 2, cx = (v.x0 + v.x1) / 2;
      v = { y0: cy - aw / s / 2, y1: cy + aw / s / 2, x0: cx - ah / s / 2, x1: cx + ah / s / 2 };
    }
    if (interativo) this.vistaEfetiva = v;
    this.area = { x: m.e, y: m.t, w: aw, h: ah };
    const PY = (y: number) => m.e + ((y - v.y0) / (v.y1 - v.y0)) * aw;
    const PX = (x: number) => m.t + ((x - v.x0) / (v.x1 - v.x0)) * ah;
    p.recortar(m.e, m.t, aw, ah);
    // fundo do Si cristalino (abaixo da superfície)
    p.retangulo(PY(v.y0), PX(0), PY(v.y1) - PY(v.y0), PX(v.x1) - PX(0), C("--superficie-3"));
    // campo: a imagem da grade vai na posição de cada célula; o Si consumido sai pelo topo por coluna
    const img = this.imagem();
    const nx = q.x.length, ny = q.y.length;
    const dy = q.y[1] - q.y[0], dx = q.x[1] - q.x[0];
    const y0 = q.y[0] - dy / 2, x0 = q.x[0] - dx / 2;
    if (p.imagem) p.imagem(img, PY(y0), PX(x0), PY(y0 + ny * dy) - PY(y0), PX(x0 + nx * dx) - PX(x0), true);
    // amorfo hachurado
    if (q.amorfo && this.o.materiais) {
      const cor = C("--texto");
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < ny; j++)
          if (q.amorfo[i * ny + j]) {
            const yy = PY(q.y[j] - dy / 2), xx = PX(q.x[i] - dx / 2);
            if ((i + j) % 2 === 0) p.retangulo(yy, xx, PY(q.y[j] + dy / 2) - yy, PX(q.x[i] + dx / 2) - xx, cor, 0.16);
          }
    }
    // isolinhas por década
    if (this.o.isolinhas) {
      const corL = C("--texto");
      const vv = g.log ? Float64Array.from(q.v as ArrayLike<number>, (a) => Math.log10(Math.max(a, 1e-300))) : (q.v as ArrayLike<number>);
      const caixas: [number, number, number, number][] = [];
      const livre = (x: number, y: number, w: number, hh: number) => caixas.every(([a, b, c, d]) => x + w < a || x > a + c || y + hh < b || y > b + d);
      for (const nv of g.niveis) {
        const lvl = g.log ? Math.log10(nv) : nv;
        const segs = isolinhas(vv, nx, ny, lvl);
        const xs: number[] = [], ys: number[] = [];
        for (const s of segs) {
          xs.push(PY(q.y[0] + s.a[1] * dy), PY(q.y[0] + s.b[1] * dy), NaN);
          ys.push(PX(q.x[0] + s.a[0] * dx), PX(q.x[0] + s.b[0] * dx), NaN);
        }
        p.linha(xs, ys, { cor: corL, largura: 1, alfa: 0.75 });
        // rótulo no segmento mais à direita que não cai sobre outro rótulo; sem lugar, fica sem rótulo
        const rot = g.log ? `10${sobrescrito(Math.round(Math.log10(nv)))}` : num(nv);
        const tw = p.medir(rot, 10, fonte) + 4;
        const cand: number[] = [];
        for (let k = 0; k < xs.length; k += 3) if (xs[k] < m.e + aw - tw - 6 && xs[k] > m.e + 4 && ys[k] > m.t + 12 && ys[k] < m.t + ah - 4) cand.push(k);
        cand.sort((a, b) => xs[b] - xs[a]);
        for (const k of cand) {
          const bx = xs[k] + 1;
          const by = ys[k] - 12;
          if (!livre(bx, by, tw, 12)) continue;
          p.retangulo(bx, by, tw, 12, C("--tela"), 0.55);
          p.texto(rot, bx + 2, ys[k] - 3, { cor: corL, tamanho: 10, fonte });
          caixas.push([bx, by, tw, 12]);
          break;
        }
      }
    }
    // malha da simulação
    if (this.o.malha) {
      const corM = C("--texto");
      const passo = Math.max(1, Math.round(4 / Math.max(0.5, (PY(q.y[1]) - PY(q.y[0])))));
      const ys: number[] = [], xs: number[] = [];
      for (let j = 0; j < ny; j += passo) {
        ys.push(PY(q.y[j]), PY(q.y[j]), NaN);
        xs.push(PX(q.x[0]), PX(q.x[nx - 1]), NaN);
      }
      const passoI = Math.max(1, Math.round(4 / Math.max(0.5, PX(q.x[1]) - PX(q.x[0]))));
      for (let i = 0; i < nx; i += passoI) {
        ys.push(PY(q.y[0]), PY(q.y[ny - 1]), NaN);
        xs.push(PX(q.x[i]), PX(q.x[i]), NaN);
      }
      p.linha(ys, xs, { cor: corM, largura: 0.5, alfa: 0.18 });
    }
    // materiais acima do Si: Si consumido, óxido, máscara
    if (this.o.materiais) {
      const corOx = C("--oxido");
      if (q.xox) {
        const topo: number[] = [], fundo: number[] = [], yy: number[] = [];
        for (let j = 0; j < ny; j++) {
          yy.push(PY(q.y[j]));
          fundo.push(PX(q.si?.[j] ?? 0));
          topo.push(PX((q.si?.[j] ?? 0) - (q.xox[j] ?? 0)));
        }
        // a região entre a superfície original e a atual era Si e virou óxido junto com o que cresceu para cima
        p.poligono([...yy, ...yy.slice().reverse()], [...topo, ...fundo.slice().reverse()], corOx, 0.55);
        p.linha(yy, topo, { cor: corOx, largura: 1.2 });
        p.linha(yy, fundo, { cor: C("--texto-2"), largura: 1 });
      } else p.linha([PY(v.y0), PY(v.y1)], [PX(0), PX(0)], { cor: C("--texto-2"), largura: 1 });
      const mk = q.mascara_nm ?? 0;
      if (mk > 0) {
        p.retangulo(PY(v.y0), PX(-mk), PY(0) - PY(v.y0), PX(0) - PX(-mk), corOx, 0.45, corOx);
        // o texto cabe na parte visível da máscara: encurta se for preciso e nunca sai pela esquerda
        const ma = Math.max(PY(v.y0), m.e);
        const mb = Math.min(Math.max(PY(0), m.e), m.e + aw);
        let tm = `máscara de SiO₂, ${br(mk, 0)} nm`;
        if (p.medir(tm, 11) > mb - ma - 8) tm = `SiO₂ ${br(mk, 0)} nm`;
        const lt = p.medir(tm, 11);
        if (lt <= mb - ma - 4) p.texto(tm, Math.max(ma + lt / 2 + 3, (ma + mb) / 2), PX(-mk / 2) + 4, { cor: C("--texto"), tamanho: 11, alinhar: "center" });
        if (q.sombra_nm && q.sombra_nm > 0) {
          p.linha([PY(0), PY(q.sombra_nm)], [PX(-mk), PX(0)], { cor: C("--p-inativo"), largura: 1, tracejado: [3, 3] });
          p.texto(`sombra ${br(q.sombra_nm, 1)} nm`, PY(q.sombra_nm) + 4, PX(-6), { cor: C("--p-inativo"), tamanho: 10, fonte });
        }
      }
    }
    // corte e régua
    if (this.corte) {
      const c = this.corte;
      p.linha([PY(c.a[0]), PY(c.b[0])], [PX(c.a[1]), PX(c.b[1])], { cor: C("--acento"), largura: 2 });
      p.circulo(PY(c.a[0]), PX(c.a[1]), 3.5, C("--acento"));
      p.circulo(PY(c.b[0]), PX(c.b[1]), 3.5, C("--acento"));
    }
    if (this.regua) {
      const r = this.regua;
      const L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]);
      p.linha([PY(r.a[0]), PY(r.b[0])], [PX(r.a[1]), PX(r.b[1])], { cor: C("--aviso"), largura: 1.5, tracejado: [5, 3] });
      p.texto(`${br(L, 1)} nm`, (PY(r.a[0]) + PY(r.b[0])) / 2 + 6, (PX(r.a[1]) + PX(r.b[1])) / 2 - 6, { cor: C("--aviso"), tamanho: 12, fonte, peso: 600 });
    }
    p.restaurar();
    // eixos
    const corT = C("--texto-3");
    const ty = ticksLineares(v.y0, v.y1, Math.max(3, Math.floor(aw / 90)));
    const tx = ticksLineares(v.x0, v.x1, Math.max(3, Math.floor(ah / 60)));
    for (const t of ty) {
      const px = PY(t);
      if (px < m.e || px > m.e + aw) continue;
      p.linha([px, px], [m.t + ah, m.t + ah + 4], { cor: corT, largura: 1 });
      p.texto(br(t, 0), px, m.t + ah + 15, { cor: corT, tamanho: 11, alinhar: "center", fonte });
    }
    for (const t of tx) {
      const py = PX(t);
      if (py < m.t || py > m.t + ah) continue;
      p.linha([m.e - 4, m.e], [py, py], { cor: corT, largura: 1 });
      p.texto(br(t, 0), m.e - 6, py + 4, { cor: corT, tamanho: 11, alinhar: "right", fonte });
    }
    p.texto("lateral y (nm), janela da porta para a direita", m.e + aw / 2, H - 6, { cor: C("--texto-2"), tamanho: 11, alinhar: "center" });
    p.texto("profundidade (nm)", 12, m.t + ah / 2, { cor: C("--texto-2"), tamanho: 11, alinhar: "center", rotacao: -Math.PI / 2 });
    p.retangulo(m.e, m.t, aw, ah, "none", 1, C("--borda-forte"));
    // barra de cores
    const bx = W - barraW + 6, by = m.t + 18, bh = ah - 30, bw = 14;
    const L = lut(this.o.mapa);
    const nb = 64;
    for (let k = 0; k < nb; k++) {
      const t = 1 - k / nb;
      const i = Math.round(t * 255);
      p.retangulo(bx, by + (k * bh) / nb, bw, bh / nb + 0.6, `rgb(${L[3 * i]},${L[3 * i + 1]},${L[3 * i + 2]})`);
    }
    p.retangulo(bx, by, bw, bh, "none", 1, C("--borda-forte"));
    p.texto(g.unidade, bx, m.t + 8, { cor: C("--texto-2"), tamanho: 11, fonte });
    const lo = g.log ? Math.log10(g.min) : g.min, hi = g.log ? Math.log10(g.max) : g.max;
    const tb = g.log ? Array.from({ length: Math.floor(hi) - Math.ceil(lo) + 1 }, (_, k) => Math.ceil(lo) + k) : ticksLineares(lo, hi, 6);
    for (const t of tb) {
      const yy = by + bh * (1 - (t - lo) / (hi - lo));
      p.linha([bx + bw, bx + bw + 4], [yy, yy], { cor: corT, largura: 1 });
      p.texto(g.log ? `10${sobrescrito(t)}` : num(t), bx + bw + 6, yy + 4, { cor: corT, tamanho: 11, fonte });
    }
  }

  private vistaEfetiva = { y0: 0, y1: 1, x0: 0, x1: 1 };

  desenhar(): void {
    const w = Math.max(240, Math.round(this.raiz.clientWidth || 500));
    // na escala real a altura segue a proporção da vista, para o campo ocupar a largura
    const v = this.vista;
    const prop = this.o.escalaReal ? (v.x1 - v.x0) / (v.y1 - v.y0) : 0.55;
    const hh = Math.round(Math.min(640, Math.max(280, (w - 136) * prop + 46)));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(hh * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(hh * dpr);
      this.canvas.style.height = `${hh}px`;
    }
    this.W = w;
    this.H = hh;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.desenharEm(new PincelCanvas(ctx, w, hh, cssVar("--f-dado", this.raiz) || "monospace"), true);
  }

  png(escala = 3): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = Math.round(this.W * escala);
    c.height = Math.round(this.H * escala);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
    this.desenharEm(new PincelCanvas(ctx, this.W, this.H, cssVar("--f-dado", this.raiz) || "monospace"), false);
    return c;
  }

  svg(): string {
    const p = new PincelSVG(this.W, this.H, cssVar("--f-dado", this.raiz) || "monospace");
    this.desenharEm(p, false);
    return p.resultado();
  }

  csv(): string {
    const q = this.quadro, g = this.grandeza;
    if (!q || !g) return "";
    const ny = q.y.length;
    const linhas = [`# ${g.nome} (${g.unidade}); linhas profundidade em nm, colunas lateral em nm`, ["x\\y", ...Array.from(q.y)].join(",")];
    for (let i = 0; i < q.x.length; i++) {
      const l = [String(q.x[i])];
      for (let j = 0; j < ny; j++) l.push(String(q.v[i * ny + j]));
      linhas.push(l.join(","));
    }
    return linhas.join("\n");
  }

  private paraNm(px: number, py: number): [number, number] {
    const v = this.vistaEfetiva, a = this.area;
    return [v.y0 + ((px - a.x) / a.w) * (v.y1 - v.y0), v.x0 + ((py - a.y) / a.h) * (v.x1 - v.x0)];
  }

  private instalar(): void {
    const c = this.canvas;
    const local = (e: PointerEvent | WheelEvent | MouseEvent): [number, number] => {
      const r = c.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    c.addEventListener("pointerdown", (e) => {
      const [px, py] = local(e);
      const nm = this.paraNm(px, py);
      this.arraste = { tipo: this.ferramenta, ini: nm, vistaIni: { ...this.vista }, px0: [px, py] };
      c.setPointerCapture(e.pointerId);
      if (this.ferramenta === "corte_v" || this.ferramenta === "sonda") this.cortar("v", [nm[0], Math.max(0, this.quadro?.x[0] ?? 0)], [nm[0], this.quadro?.x[(this.quadro?.x.length ?? 1) - 1] ?? 300]);
      else if (this.ferramenta === "corte_h") this.cortar("h", [this.quadro?.y[0] ?? -300, nm[1]], [this.quadro?.y[(this.quadro?.y.length ?? 1) - 1] ?? 400, nm[1]]);
    });
    c.addEventListener("pointermove", (e) => {
      const [px, py] = local(e);
      const nm = this.paraNm(px, py);
      const a = this.arraste;
      if (a) {
        if (a.tipo === "mover") {
          const v0 = a.vistaIni;
          const dyNm = ((px - a.px0[0]) / this.area.w) * (this.vistaEfetiva.y1 - this.vistaEfetiva.y0);
          const dxNm = ((py - a.px0[1]) / this.area.h) * (this.vistaEfetiva.x1 - this.vistaEfetiva.x0);
          this.vista = { y0: v0.y0 - dyNm, y1: v0.y1 - dyNm, x0: v0.x0 - dxNm, x1: v0.x1 - dxNm };
          this.desenhar();
        } else if (a.tipo === "corte_livre") this.cortar("livre", a.ini, nm);
        else if (a.tipo === "regua") {
          this.regua = { a: a.ini, b: nm };
          this.desenhar();
        } else if (a.tipo === "corte_v" || a.tipo === "sonda") this.cortar("v", [nm[0], Math.max(0, this.quadro?.x[0] ?? 0)], [nm[0], this.quadro?.x[(this.quadro?.x.length ?? 1) - 1] ?? 300]);
        else if (a.tipo === "corte_h") this.cortar("h", [this.quadro?.y[0] ?? -300, nm[1]], [this.quadro?.y[(this.quadro?.y.length ?? 1) - 1] ?? 400, nm[1]]);
      }
      this.mostrarSonda(px, py, nm);
    });
    c.addEventListener("pointerup", () => (this.arraste = null));
    c.addEventListener("pointerleave", () => (this.sonda.hidden = true));
    c.addEventListener("wheel", (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      this.zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, this.paraNm(...local(e)));
    }, { passive: false });
    c.addEventListener("dblclick", () => this.ajustar());
  }

  private mostrarSonda(px: number, py: number, nm: [number, number]): void {
    const a = this.area;
    if (!this.grandeza || px < a.x || px > a.x + a.w || py < a.y || py > a.y + a.h) {
      this.sonda.hidden = true;
      return;
    }
    const [y, x] = nm;
    const sup = this.superficieEm(y);
    let material = "Si";
    if (x < sup.si - sup.xox) material = (this.quadro?.mascara_nm ?? 0) > 0 && y < 0 && x > -(this.quadro?.mascara_nm ?? 0) ? "máscara de SiO₂" : "ambiente";
    else if (x < sup.si) material = "SiO₂";
    const val = material === "Si" ? this.valorEm(y, x) : NaN;
    const g = this.grandeza;
    this.sonda.innerHTML = `<b>y</b> ${br(y, 1)} nm  <b>x</b> ${br(x, 1)} nm<br><b>${material}</b>${material === "Si" ? `<br>${g.nome} ${g.log ? sci(val, 2) : num(val, 4)} ${g.unidade}` : ""}${sup.xox > 0 ? `<br>óxido acima ${br(sup.xox, 1)} nm` : ""}`;
    this.sonda.hidden = false;
    const w = this.sonda.offsetWidth;
    this.sonda.style.left = `${px + 14 + w > this.W ? px - w - 14 : px + 14}px`;
    this.sonda.style.top = `${Math.max(4, py - 34)}px`;
  }
}
