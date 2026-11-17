/** Utilidades de gráfico da vista Previsão: histogramas comparados e densidade conjunta. */
import type { Serie } from "@/visual/grafico/grafico";

export interface Histograma {
  bordas: number[];
  contagem: number[];
}

/** Histograma em n classes entre a e b, normalizado para densidade (área 1). */
export function histograma(v: ArrayLike<number>, a: number, b: number, n: number, log = false): Histograma {
  const f = (x: number) => (log ? Math.log(x) : x);
  const fa = f(a);
  const fb = f(b);
  const c = new Array<number>(n).fill(0);
  let tot = 0;
  for (let i = 0; i < v.length; i++) {
    const x = f(v[i]);
    if (!Number.isFinite(x)) continue;
    const k = Math.floor(((x - fa) / (fb - fa)) * n);
    if (k < 0 || k >= n) continue;
    c[k]++;
    tot++;
  }
  const larg = (fb - fa) / n;
  const bordas = Array.from({ length: n + 1 }, (_, i) => (log ? Math.exp(fa + i * larg) : fa + i * larg));
  return { bordas, contagem: c.map((x) => (tot ? x / (tot * larg) : 0)) };
}

/** Série em degrau de um histograma, fechada no zero nas pontas. */
export function serieDegrau(h: Histograma, nome: string, cor: string, o: Partial<Serie> = {}): Serie {
  const xs: number[] = [h.bordas[0]];
  const ys: number[] = [0];
  for (let i = 0; i < h.contagem.length; i++) {
    xs.push(h.bordas[i], h.bordas[i + 1]);
    ys.push(h.contagem[i], h.contagem[i]);
  }
  xs.push(h.bordas[h.bordas.length - 1]);
  ys.push(0);
  return { nome, x: xs, y: ys, cor, ...o };
}

/**
 * Densidade conjunta de duas colunas numa grade n × n por histograma suavizado com um
 * núcleo gaussiano de uma célula, no cubo unitário.
 */
export function densidade2D(a: ArrayLike<number>, b: ArrayLike<number>, n: number): Float64Array {
  const g = new Float64Array(n * n);
  for (let i = 0; i < a.length; i++) {
    const ix = Math.floor(a[i] * n);
    const iy = Math.floor(b[i] * n);
    if (ix < 0 || iy < 0 || ix >= n || iy >= n) continue;
    g[iy * n + ix]++;
  }
  const k = [0.25, 0.5, 0.25];
  const t = new Float64Array(n * n);
  for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++) {
    let s = 0;
    for (let d = -1; d <= 1; d++) {
      const j = ix + d;
      if (j >= 0 && j < n) s += k[d + 1] * g[iy * n + j];
    }
    t[iy * n + ix] = s;
  }
  const out = new Float64Array(n * n);
  let mx = 0;
  for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++) {
    let s = 0;
    for (let d = -1; d <= 1; d++) {
      const j = iy + d;
      if (j >= 0 && j < n) s += k[d + 1] * t[j * n + ix];
    }
    out[iy * n + ix] = s;
    if (s > mx) mx = s;
  }
  if (mx > 0) for (let i = 0; i < out.length; i++) out[i] /= mx;
  return out;
}

/**
 * Nível de densidade que contém a fração q da massa (para contornos de 68 e 95 %),
 * sobre uma grade normalizada.
 */
export function nivelDeMassa(g: Float64Array, q: number): number {
  const v = Array.from(g).sort((x, y) => y - x);
  const tot = v.reduce((s, x) => s + x, 0);
  let acc = 0;
  for (const x of v) {
    acc += x;
    if (acc >= q * tot) return x;
  }
  return 0;
}
