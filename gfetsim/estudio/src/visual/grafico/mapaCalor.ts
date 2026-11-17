/**
 * Mapa de calor com eixos, barra de cores, isolinhas rotuladas e marcadores. Serve ao
 * mapa de rendimento da receita e à densidade conjunta de dois parâmetros na
 * calibração. A grade é pintada numa imagem do tamanho dela e ampliada com
 * interpolação; as isolinhas saem por marching squares nos mesmos nós, então caem
 * exatamente sobre as cores.
 */
import { cssVar } from "@/ui/dom";
import { br, num, sobrescrito } from "@/ui/formato";
import { lut, type NomeMapa } from "@/visual/cores/mapas";
import { isolinhas } from "@/visual/corte2d/isolinhas";
import { ticksLineares } from "./grafico";
import type { Pincel } from "./pincel";
import { Tela } from "./tela";

export interface EixoCalor {
  rotulo: string;
  min: number;
  max: number;
  log?: boolean;
  formato?: (v: number) => string;
}

export interface ContornoCalor {
  nivel: number;
  cor?: string;
  rotulo?: string;
  tracejado?: number[];
}

export interface PontoCalor {
  x: number;
  y: number;
  cor: string;
  rotulo?: string;
  forma?: "circulo" | "estrela" | "losango";
}

export interface DadosCalor {
  nx: number;
  ny: number;
  /** valores por linha em y: v[iy * nx + ix], com iy = 0 embaixo */
  v: ArrayLike<number>;
  x: EixoCalor;
  y: EixoCalor;
  mapa: NomeMapa;
  faixa: [number, number];
  rotuloBarra: string;
  formatoBarra?: (v: number) => string;
  contornos?: ContornoCalor[];
  pontos?: PontoCalor[];
  /** valores fora de [0, 1] após normalizar recebem esta cor; padrão é saturar */
  semValor?: string;
}

const M = { esq: 64, dir: 80, topo: 14, base: 46 };

function ticksLog(a: number, b: number): number[] {
  const out: number[] = [];
  const e0 = Math.floor(Math.log10(a));
  const e1 = Math.ceil(Math.log10(b));
  const passo = e1 - e0 > 6 ? 2 : 1;
  for (let e = e0; e <= e1; e += passo) for (const m of e1 - e0 <= 1 ? [1, 2, 5] : [1]) {
    const v = m * 10 ** e;
    if (v >= a * 0.999 && v <= b * 1.001) out.push(v);
  }
  return out;
}

function formatoPadrao(e: EixoCalor): (v: number) => string {
  if (e.formato) return e.formato;
  if (e.log) return (v) => {
    const ex = Math.floor(Math.log10(v) + 1e-9);
    const m = v / 10 ** ex;
    return Math.abs(m - 1) < 1e-6 ? `10${sobrescrito(ex)}` : `${br(m, 0)}×10${sobrescrito(ex)}`;
  };
  return (v) => num(v, 4);
}

export class MapaCalor {
  private readonly tela: Tela;
  private dados: DadosCalor | null = null;
  private imagem: HTMLCanvasElement | null = null;

  constructor(container: HTMLElement, o: { razao?: number; alturaMin?: number; alturaMax?: number; rotulo: string }) {
    this.tela = new Tela(container, { razao: o.razao ?? 0.72, alturaMin: o.alturaMin ?? 260, alturaMax: o.alturaMax ?? 520, rotulo: o.rotulo }, (p) => this.desenhar(p));
  }

  get raiz(): HTMLElement {
    return this.tela.raiz;
  }

  definir(d: DadosCalor): void {
    this.dados = d;
    this.imagem = this.pintar(d);
    this.tela.desenhar();
  }

  png(escala = 3): HTMLCanvasElement {
    return this.tela.png(escala);
  }

  svg(): string {
    return this.tela.svg();
  }

  csv(): string {
    const d = this.dados;
    if (!d) return "";
    const linhas = [`${d.y.rotulo} \\ ${d.x.rotulo}`];
    const xs = Array.from({ length: d.nx }, (_, i) => this.valorEixo(d.x, i, d.nx));
    linhas[0] += ";" + xs.map((x) => String(x)).join(";");
    for (let iy = 0; iy < d.ny; iy++) {
      const y = this.valorEixo(d.y, iy, d.ny);
      const lin = [String(y)];
      for (let ix = 0; ix < d.nx; ix++) lin.push(String(d.v[iy * d.nx + ix]));
      linhas.push(lin.join(";"));
    }
    return linhas.join("\n") + "\n";
  }

  destruir(): void {
    this.tela.destruir();
  }

  private valorEixo(e: EixoCalor, i: number, n: number): number {
    const f = n > 1 ? i / (n - 1) : 0.5;
    return e.log ? Math.exp(Math.log(e.min) + f * (Math.log(e.max) - Math.log(e.min))) : e.min + f * (e.max - e.min);
  }

  private pintar(d: DadosCalor): HTMLCanvasElement | null {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = d.nx;
    c.height = d.ny;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const img = ctx.createImageData(d.nx, d.ny);
    const tab = lut(d.mapa);
    const [a, b] = d.faixa;
    for (let iy = 0; iy < d.ny; iy++) for (let ix = 0; ix < d.nx; ix++) {
      const v = d.v[iy * d.nx + ix];
      const o = ((d.ny - 1 - iy) * d.nx + ix) * 4;
      if (!Number.isFinite(v)) {
        img.data[o + 3] = 0;
        continue;
      }
      const t = Math.min(1, Math.max(0, (v - a) / (b - a || 1)));
      const k = Math.round(t * 255) * 3;
      img.data[o] = tab[k];
      img.data[o + 1] = tab[k + 1];
      img.data[o + 2] = tab[k + 2];
      img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  private desenhar(p: Pincel): void {
    const raiz = this.tela.raiz;
    const corTexto = cssVar("--texto-2", raiz) || "#999";
    const corFraca = cssVar("--texto-3", raiz) || "#777";
    const corBorda = cssVar("--borda-forte", raiz) || "#555";
    const fundo = cssVar("--tela", raiz) || "#000";
    p.retangulo(0, 0, p.largura, p.altura, cssVar("--superficie", raiz) || "#fff");
    const d = this.dados;
    const x0 = M.esq;
    const y0 = M.topo;
    const w = Math.max(40, p.largura - M.esq - M.dir);
    const h = Math.max(40, p.altura - M.topo - M.base);
    p.retangulo(x0, y0, w, h, fundo, 1, corBorda);
    if (!d) {
      p.texto("sem dados", x0 + w / 2, y0 + h / 2, { cor: corFraca, alinhar: "center", base: "middle", tamanho: 12 });
      return;
    }
    // posição em px de um valor no eixo: os nós da grade ficam nos centros das células
    const fr = (e: EixoCalor, v: number) => (e.log ? (Math.log(v) - Math.log(e.min)) / (Math.log(e.max) - Math.log(e.min)) : (v - e.min) / (e.max - e.min));
    const px = (v: number) => x0 + ((fr(d.x, v) * (d.nx - 1) + 0.5) / d.nx) * w;
    const py = (v: number) => y0 + h - ((fr(d.y, v) * (d.ny - 1) + 0.5) / d.ny) * h;
    if (this.imagem && p.imagem) p.imagem(this.imagem, x0, y0, w, h, true);
    else {
      // sem imagem (exportação sem canvas): células como retângulos
      const tab = lut(d.mapa);
      for (let iy = 0; iy < d.ny; iy++) for (let ix = 0; ix < d.nx; ix++) {
        const v = d.v[iy * d.nx + ix];
        if (!Number.isFinite(v)) continue;
        const t = Math.min(1, Math.max(0, (v - d.faixa[0]) / (d.faixa[1] - d.faixa[0] || 1)));
        const k = Math.round(t * 255) * 3;
        p.retangulo(x0 + (ix / d.nx) * w, y0 + h - ((iy + 1) / d.ny) * h, w / d.nx + 0.5, h / d.ny + 0.5, `rgb(${tab[k]},${tab[k + 1]},${tab[k + 2]})`);
      }
    }
    p.recortar(x0, y0, w, h);
    const caixas: [number, number, number, number][] = [];
    const livre = (bx: number, by: number, bw: number, bh: number) => caixas.every(([a, b, c, e]) => bx + bw < a || bx > a + c || by + bh < b || by > b + e);
    for (const c of d.contornos ?? []) {
      const seg = isolinhas(d.v, d.ny, d.nx, c.nivel);
      if (!seg.length) continue;
      const cor = c.cor ?? "#ffffff";
      let melhor: [number, number] | null = null;
      let melhorNota = -Infinity;
      for (const s of seg) {
        const ax = x0 + ((s.a[1] + 0.5) / d.nx) * w;
        const ay = y0 + h - ((s.a[0] + 0.5) / d.ny) * h;
        const bx = x0 + ((s.b[1] + 0.5) / d.nx) * w;
        const by = y0 + h - ((s.b[0] + 0.5) / d.ny) * h;
        p.linha([ax, bx], [ay, by], { cor, largura: 1.6, tracejado: c.tracejado });
        // rótulo onde a linha está mais longe das bordas
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        const nota = Math.min(mx - x0, x0 + w - mx, my - y0, y0 + h - my);
        if (nota > melhorNota) {
          melhorNota = nota;
          melhor = [mx, my];
        }
      }
      if (c.rotulo && melhor) {
        const tw = p.medir(c.rotulo, 10.5) + 8;
        const [mx, my] = melhor;
        if (livre(mx - tw / 2, my - 8, tw, 16)) {
          p.retangulo(mx - tw / 2, my - 8, tw, 16, fundo, 0.78);
          p.texto(c.rotulo, mx, my, { cor, tamanho: 10.5, alinhar: "center", base: "middle", peso: 600 });
          caixas.push([mx - tw / 2, my - 8, tw, 16]);
        }
      }
    }
    for (const pt of d.pontos ?? []) {
      const X = px(pt.x);
      const Y = py(pt.y);
      if (!Number.isFinite(X) || !Number.isFinite(Y)) continue;
      if (pt.forma === "estrela") {
        const xs: number[] = [];
        const ys: number[] = [];
        for (let k = 0; k < 10; k++) {
          const r = k % 2 === 0 ? 9 : 4;
          const a = -Math.PI / 2 + (k * Math.PI) / 5;
          xs.push(X + r * Math.cos(a));
          ys.push(Y + r * Math.sin(a));
        }
        p.poligono(xs, ys, pt.cor);
        p.linha([...xs, xs[0]], [...ys, ys[0]], { cor: "#0b0f14", largura: 1.2 });
      } else if (pt.forma === "losango") {
        const xs = [X, X + 7, X, X - 7];
        const ys = [Y - 7, Y, Y + 7, Y];
        p.poligono(xs, ys, pt.cor);
        p.linha([...xs, X], [...ys, Y - 7], { cor: "#0b0f14", largura: 1.2 });
      } else p.circulo(X, Y, 5.5, pt.cor, "#0b0f14");
      if (pt.rotulo) {
        const tw = p.medir(pt.rotulo, 11) + 8;
        let lx = X + 10;
        if (lx + tw > x0 + w) lx = X - 10 - tw;
        let ly = Y - 18;
        if (ly < y0 + 2) ly = Y + 6;
        if (!livre(lx, ly, tw, 16)) ly = ly < Y ? Y + 6 : Y - 22;
        p.retangulo(lx, ly, tw, 16, fundo, 0.82);
        p.texto(pt.rotulo, lx + 4, ly + 8, { cor: pt.cor, tamanho: 11, base: "middle", peso: 600 });
        caixas.push([lx, ly, tw, 16]);
      }
    }
    p.restaurar();
    // eixos
    // em faixa log estreita as décadas não dão marcas suficientes: volta às marcas lineares
    const marcas = (e: EixoCalor, n: number) => {
      const t = e.log ? ticksLog(e.min, e.max) : [];
      return t.length >= 3 ? { t, f: formatoPadrao(e) } : { t: ticksLineares(e.min, e.max, n), f: e.formato ?? ((v: number) => num(v, 3)) };
    };
    const { t: tx, f: fx } = marcas(d.x, Math.max(3, Math.floor(w / 90)));
    const { t: ty, f: fy } = marcas(d.y, Math.max(3, Math.floor(h / 60)));
    for (const v of tx) {
      if (v < Math.min(d.x.min, d.x.max) - 1e-12 || v > Math.max(d.x.min, d.x.max) + 1e-12) continue;
      const X = px(v);
      p.linha([X, X], [y0 + h, y0 + h + 5], { cor: corBorda });
      p.texto(fx(v), X, y0 + h + 8, { cor: corTexto, tamanho: 11, alinhar: "center", base: "top" });
    }
    for (const v of ty) {
      if (v < Math.min(d.y.min, d.y.max) - 1e-12 || v > Math.max(d.y.min, d.y.max) + 1e-12) continue;
      const Y = py(v);
      p.linha([x0 - 5, x0], [Y, Y], { cor: corBorda });
      p.texto(fy(v), x0 - 8, Y, { cor: corTexto, tamanho: 11, alinhar: "right", base: "middle" });
    }
    p.texto(d.x.rotulo, x0 + w / 2, p.altura - 6, { cor: corTexto, tamanho: 11.5, alinhar: "center", base: "bottom" });
    p.texto(d.y.rotulo, 14, y0 + h / 2, { cor: corTexto, tamanho: 11.5, alinhar: "center", base: "middle", rotacao: -Math.PI / 2 });
    // barra de cores
    const bx = x0 + w + 16;
    const bw = 12;
    const passos = 64;
    const tab = lut(d.mapa);
    for (let k = 0; k < passos; k++) {
      const t = k / (passos - 1);
      const i = Math.round(t * 255) * 3;
      p.retangulo(bx, y0 + h - ((k + 1) / passos) * h, bw, h / passos + 0.6, `rgb(${tab[i]},${tab[i + 1]},${tab[i + 2]})`);
    }
    p.retangulo(bx, y0, bw, h, "transparent", 1, corBorda);
    const fb = d.formatoBarra ?? ((v: number) => num(v, 3));
    for (const v of ticksLineares(d.faixa[0], d.faixa[1], 4)) {
      const t = (v - d.faixa[0]) / (d.faixa[1] - d.faixa[0] || 1);
      if (t < -1e-9 || t > 1 + 1e-9) continue;
      const Y = y0 + h - t * h;
      p.linha([bx + bw, bx + bw + 4], [Y, Y], { cor: corBorda });
      p.texto(fb(v), bx + bw + 6, Y, { cor: corTexto, tamanho: 10.5, base: "middle" });
    }
    for (const c of d.contornos ?? []) {
      const t = (c.nivel - d.faixa[0]) / (d.faixa[1] - d.faixa[0] || 1);
      if (t < 0 || t > 1) continue;
      const Y = y0 + h - t * h;
      p.linha([bx - 3, bx + bw + 3], [Y, Y], { cor: c.cor ?? "#fff", largura: 1.6, tracejado: c.tracejado });
    }
    p.texto(d.rotuloBarra, p.largura - 6, y0 + h / 2, { cor: corTexto, tamanho: 11, alinhar: "center", base: "bottom", rotacao: -Math.PI / 2 });
  }
}
