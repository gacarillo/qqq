/**
 * Rotinas numéricas básicas, com a semântica das funções do NumPy e do SciPy que o
 * gfetsim usa em Python. Cada rotina indica a função de referência.
 */

export type Vetor = Float64Array;
export type VetorLeitura = ArrayLike<number>;

export function vetor(n: number, valor = 0): Vetor {
  const v = new Float64Array(n);
  if (valor !== 0) v.fill(valor);
  return v;
}

export function de(lista: VetorLeitura): Vetor {
  return Float64Array.from(lista as ArrayLike<number>);
}

/** np.linspace(a, b, n) */
export function linspace(a: number, b: number, n: number): Vetor {
  const v = new Float64Array(n);
  if (n === 1) {
    v[0] = a;
    return v;
  }
  const d = (b - a) / (n - 1);
  for (let i = 0; i < n; i++) v[i] = a + i * d;
  v[n - 1] = b;
  return v;
}

/** np.arange(a, b, passo), com tolerância para o último ponto como o NumPy. */
export function arange(a: number, b: number, passo: number): Vetor {
  const n = Math.max(0, Math.ceil((b - a) / passo - 1e-12));
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) v[i] = a + i * passo;
  return v;
}

/** np.interp(x, xp, fp, left, right) com xp crescente. */
export function interp(x: number, xp: VetorLeitura, fp: VetorLeitura, esquerda?: number, direita?: number): number {
  const n = xp.length;
  if (n === 0) return NaN;
  if (x <= xp[0]) return x < xp[0] && esquerda !== undefined ? esquerda : fp[0];
  if (x >= xp[n - 1]) return x > xp[n - 1] && direita !== undefined ? direita : fp[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (xp[m] > x) hi = m;
    else lo = m;
  }
  const t = (x - xp[lo]) / (xp[hi] - xp[lo]);
  return fp[lo] + t * (fp[hi] - fp[lo]);
}

export function interpVetor(x: VetorLeitura, xp: VetorLeitura, fp: VetorLeitura, esquerda?: number, direita?: number): Vetor {
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = interp(x[i], xp, fp, esquerda, direita);
  return out;
}

/** Índice do intervalo [xp[i], xp[i+1]] que contém x (limitado às bordas). */
export function intervalo(x: number, xp: VetorLeitura): number {
  const n = xp.length;
  if (x <= xp[0]) return 0;
  if (x >= xp[n - 1]) return n - 2;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (xp[m] > x) hi = m;
    else lo = m;
  }
  return lo;
}

/** np.trapezoid(y, x) */
export function trapz(y: VetorLeitura, x: VetorLeitura): number {
  let s = 0;
  for (let i = 1; i < y.length; i++) s += 0.5 * (y[i] + y[i - 1]) * (x[i] - x[i - 1]);
  return s;
}

/** np.trapezoid(y, dx=dx) */
export function trapzUniforme(y: VetorLeitura, dx: number): number {
  let s = 0;
  for (let i = 1; i < y.length; i++) s += 0.5 * (y[i] + y[i - 1]);
  return s * dx;
}

/** Integral acumulada pelo trapézio, começando em zero. */
export function cumtrapz(y: VetorLeitura, x: VetorLeitura): Vetor {
  const out = new Float64Array(y.length);
  for (let i = 1; i < y.length; i++) out[i] = out[i - 1] + 0.5 * (y[i] + y[i - 1]) * (x[i] - x[i - 1]);
  return out;
}

/** np.gradient(y, x) com diferenças de segunda ordem no interior e de primeira nas bordas. */
export function gradiente(y: VetorLeitura, x: VetorLeitura): Vetor {
  const n = y.length;
  const g = new Float64Array(n);
  if (n < 2) return g;
  g[0] = (y[1] - y[0]) / (x[1] - x[0]);
  g[n - 1] = (y[n - 1] - y[n - 2]) / (x[n - 1] - x[n - 2]);
  for (let i = 1; i < n - 1; i++) {
    const h1 = x[i] - x[i - 1];
    const h2 = x[i + 1] - x[i];
    g[i] = (h1 * h1 * y[i + 1] - h2 * h2 * y[i - 1] + (h2 * h2 - h1 * h1) * y[i]) / (h1 * h2 * (h1 + h2));
  }
  return g;
}

export function maximo(v: VetorLeitura): number {
  let m = -Infinity;
  for (let i = 0; i < v.length; i++) if (v[i] > m) m = v[i];
  return m;
}

export function minimo(v: VetorLeitura): number {
  let m = Infinity;
  for (let i = 0; i < v.length; i++) if (v[i] < m) m = v[i];
  return m;
}

export function argmax(v: VetorLeitura): number {
  let k = 0;
  for (let i = 1; i < v.length; i++) if (v[i] > v[k]) k = i;
  return k;
}

export function soma(v: VetorLeitura): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i];
  return s;
}

export function media(v: VetorLeitura): number {
  return soma(v) / v.length;
}

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function mapear(v: VetorLeitura, f: (x: number, i: number) => number): Vetor {
  const out = new Float64Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = f(v[i], i);
  return out;
}

export function copia(v: VetorLeitura): Vetor {
  return Float64Array.from(v as ArrayLike<number>);
}

/**
 * Sistema tridiagonal pelo algoritmo de Thomas. inf[i] multiplica x[i] na linha i+1,
 * sup[i] multiplica x[i+1] na linha i, como solve_banded((1, 1), ...) do SciPy.
 * Não modifica as entradas.
 */
export function tridiagonal(inf: VetorLeitura, diag: VetorLeitura, sup: VetorLeitura, rhs: VetorLeitura, saida?: Vetor): Vetor {
  const n = diag.length;
  const c = new Float64Array(n);
  const x = saida ?? new Float64Array(n);
  let b = diag[0];
  if (b === 0) throw new Error("tridiagonal: pivô nulo na linha 0");
  c[0] = n > 1 ? sup[0] / b : 0;
  x[0] = rhs[0] / b;
  for (let i = 1; i < n; i++) {
    b = diag[i] - inf[i - 1] * c[i - 1];
    if (b === 0) throw new Error(`tridiagonal: pivô nulo na linha ${i}`);
    c[i] = i < n - 1 ? sup[i] / b : 0;
    x[i] = (rhs[i] - inf[i - 1] * x[i - 1]) / b;
  }
  for (let i = n - 2; i >= 0; i--) x[i] -= c[i] * x[i + 1];
  return x;
}

/** scipy.optimize.brentq, com a mesma lógica de Brent (1973). */
export function brent(f: (x: number) => number, a: number, b: number, xtol = 2e-12, rtol = 8.9e-16, iterMax = 200): number {
  let fa = f(a);
  let fb = f(b);
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) throw new Error(`brent: sem troca de sinal em [${a}, ${b}]`);
  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;
  for (let it = 0; it < iterMax; it++) {
    if (fb * fc > 0) {
      c = a;
      fc = fa;
      d = b - a;
      e = d;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }
    const tol = 2 * rtol * Math.abs(b) + 0.5 * xtol;
    const m = 0.5 * (c - b);
    if (Math.abs(m) <= tol || fb === 0) return b;
    if (Math.abs(e) >= tol && Math.abs(fa) > Math.abs(fb)) {
      let p: number;
      let qq: number;
      const s = fb / fa;
      if (a === c) {
        p = 2 * m * s;
        qq = 1 - s;
      } else {
        const r = fb / fc;
        const t = fa / fc;
        p = s * (2 * m * t * (t - r) - (b - a) * (r - 1));
        qq = (t - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) qq = -qq;
      else p = -p;
      if (2 * p < Math.min(3 * m * qq - Math.abs(tol * qq), Math.abs(e * qq))) {
        e = d;
        d = p / qq;
      } else {
        d = m;
        e = m;
      }
    } else {
      d = m;
      e = m;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > tol ? d : m > 0 ? tol : -tol;
    fb = f(b);
  }
  throw new Error("brent: não convergiu");
}

/** Bissecção vetorial simples, útil quando f é monótona e barata. */
export function bisseccao(f: (x: number) => number, a: number, b: number, iter = 80): number {
  let fa = f(a);
  for (let i = 0; i < iter; i++) {
    const m = 0.5 * (a + b);
    const fm = f(m);
    if ((fm > 0) === (fa > 0)) {
      a = m;
      fa = fm;
    } else b = m;
  }
  return 0.5 * (a + b);
}

/**
 * Spline cúbica com condição not-a-knot, como scipy.interpolate.interp1d(kind="cubic"),
 * com extrapolação pelo polinômio do intervalo da borda (fill_value="extrapolate").
 */
export class SplineCubica {
  private readonly x: Vetor;
  private readonly y: Vetor;
  private readonly b: Vetor;
  private readonly c: Vetor;
  private readonly d: Vetor;

  constructor(xs: VetorLeitura, ys: VetorLeitura) {
    const n = xs.length;
    if (n < 4) throw new Error("SplineCubica: são necessários ao menos 4 pontos");
    this.x = copia(xs);
    this.y = copia(ys);
    const h = new Float64Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
      h[i] = xs[i + 1] - xs[i];
      if (!(h[i] > 0)) throw new Error("SplineCubica: x deve ser estritamente crescente");
    }
    const M = SplineCubica.segundasDerivadas(xs, ys, h, n);
    this.b = new Float64Array(n - 1);
    this.c = new Float64Array(n - 1);
    this.d = new Float64Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
      this.b[i] = (ys[i + 1] - ys[i]) / h[i] - (h[i] * (2 * M[i] + M[i + 1])) / 6;
      this.c[i] = M[i] / 2;
      this.d[i] = (M[i + 1] - M[i]) / (6 * h[i]);
    }
  }

  /**
   * Segundas derivadas com not-a-knot nas duas pontas. As condições
   * M0 = ((h0+h1) M1 - h0 M2)/h1 e M_{n-1} = ((a+b) M_{n-2} - b M_{n-3})/a, com a = h_{n-3}
   * e b = h_{n-2}, entram nas linhas 1 e n-2; o sistema reduzido em M1..M_{n-2} fica
   * tridiagonal e diagonalmente dominante, inclusive em grade uniforme.
   */
  private static segundasDerivadas(xs: VetorLeitura, ys: VetorLeitura, h: Vetor, n: number): Vetor {
    const m = n - 2;
    const inf = new Float64Array(Math.max(m - 1, 0));
    const diag = new Float64Array(m);
    const sup = new Float64Array(Math.max(m - 1, 0));
    const rhs = new Float64Array(m);
    for (let k = 0; k < m; k++) {
      const i = k + 1;
      rhs[k] = 6 * ((ys[i + 1] - ys[i]) / h[i] - (ys[i] - ys[i - 1]) / h[i - 1]);
      diag[k] = 2 * (h[i - 1] + h[i]);
      if (k > 0) inf[k - 1] = h[i - 1];
      if (k < m - 1) sup[k] = h[i];
    }
    const h0 = h[0], h1 = h[1];
    diag[0] = ((h0 + h1) * (h0 + 2 * h1)) / h1;
    if (m > 1) sup[0] = (h1 * h1 - h0 * h0) / h1;
    const a = h[n - 3], b = h[n - 2];
    if (m > 1) {
      diag[m - 1] = ((a + b) * (2 * a + b)) / a;
      inf[m - 2] = (a * a - b * b) / a;
    } else {
      diag[0] += ((a + b) * (2 * a + b)) / a - 2 * (h0 + h1);
    }
    const Mi = tridiagonal(inf, diag, sup, rhs);
    const M = new Float64Array(n);
    M.set(Mi, 1);
    M[0] = ((h0 + h1) * M[1] - h0 * M[2]) / h1;
    M[n - 1] = ((a + b) * M[n - 2] - b * M[n - 3]) / a;
    void xs;
    return M;
  }

  avaliar(xv: number): number {
    const i = intervalo(xv, this.x);
    const t = xv - this.x[i];
    return this.y[i] + t * (this.b[i] + t * (this.c[i] + t * this.d[i]));
  }

  derivada(xv: number): number {
    const i = intervalo(xv, this.x);
    const t = xv - this.x[i];
    return this.b[i] + t * (2 * this.c[i] + 3 * t * this.d[i]);
  }
}

/** np.convolve(a, k, mode="same") para núcleo de tamanho ímpar. */
export function convolverMesmo(a: VetorLeitura, k: VetorLeitura): Vetor {
  const n = a.length;
  const m = k.length;
  const out = new Float64Array(n);
  const meio = (m - 1) >> 1;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < m; j++) {
      const idx = i + meio - j;
      if (idx >= 0 && idx < n) s += a[idx] * k[j];
    }
    out[i] = s;
  }
  return out;
}

/**
 * Transformada de distância euclidiana exata (Felzenszwalb e Huttenlocher), como
 * scipy.ndimage.distance_transform_edt: para cada célula verdadeira, a distância à
 * célula falsa mais próxima, com espaçamentos (dx, dy). mascara[i*ny + j].
 */
export function transformadaDistancia(mascara: ArrayLike<boolean | number>, nx: number, ny: number, dx: number, dy: number): Vetor {
  const INF = 1e30;
  const g = new Float64Array(nx * ny);
  for (let k = 0; k < nx * ny; k++) g[k] = mascara[k] ? INF : 0;
  const passo1d = (f: Vetor, n: number, s: number): Vetor => {
    const d = new Float64Array(n);
    const v = new Int32Array(n);
    const z = new Float64Array(n + 1);
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let qq = 1; qq < n; qq++) {
      let sv = ((f[qq] + (qq * s) ** 2) - (f[v[k]] + (v[k] * s) ** 2)) / (2 * s * s * (qq - v[k]));
      while (sv <= z[k]) {
        k--;
        sv = ((f[qq] + (qq * s) ** 2) - (f[v[k]] + (v[k] * s) ** 2)) / (2 * s * s * (qq - v[k]));
      }
      k++;
      v[k] = qq;
      z[k] = sv;
      z[k + 1] = INF;
    }
    k = 0;
    for (let qq = 0; qq < n; qq++) {
      while (z[k + 1] < qq) k++;
      d[qq] = ((qq - v[k]) * s) ** 2 + f[v[k]];
    }
    return d;
  };
  // ao longo de j (eixo y)
  const linha = new Float64Array(ny);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) linha[j] = g[i * ny + j];
    const d = passo1d(linha, ny, dy);
    for (let j = 0; j < ny; j++) g[i * ny + j] = d[j];
  }
  const coluna = new Float64Array(nx);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) coluna[i] = g[i * ny + j];
    const d = passo1d(coluna, nx, dx);
    for (let i = 0; i < nx; i++) g[i * ny + j] = d[i];
  }
  for (let k = 0; k < nx * ny; k++) g[k] = Math.sqrt(g[k]);
  return g;
}

/** Função erro com erro relativo menor que 1,2e-7 (Numerical Recipes, erfc de Chebyshev). */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

export function erf(x: number): number {
  return 1 - erfc(x);
}

/**
 * Integração adaptativa de Dormand e Prince 5(4) para y' = f(t, y) escalar ou vetorial,
 * com tolerâncias como solve_ivp. Devolve os valores nos tempos pedidos (crescentes)
 * e, se houver evento, o primeiro tempo em que evento(t, y) cruza zero subindo.
 */
export interface ResultadoEDO {
  t: number[];
  y: number[][];
  tEvento: number | null;
}

const DP = {
  c: [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1],
  a: [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9], [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729], [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656]],
  b: [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
  e: [71 / 57600, 0, -71 / 16695, 71 / 1920, -17253 / 339200, 22 / 525, -1 / 40],
};

/** Um passo de Dormand e Prince 5(4): devolve y no fim, a estimativa de erro e f no fim. */
function passoDP(f: (t: number, y: number[]) => number[], t: number, y: number[], k1: number[], hh: number): { y: number[]; erro: number[]; k7: number[] } {
  const n = y.length;
  const k: number[][] = [k1];
  for (let s = 1; s < 6; s++) {
    const yi = y.slice();
    for (let j = 0; j < s; j++) for (let i = 0; i < n; i++) yi[i] += hh * DP.a[s][j] * k[j][i];
    k.push(f(t + DP.c[s] * hh, yi));
  }
  const yN = y.slice();
  for (let s = 0; s < 6; s++) for (let i = 0; i < n; i++) yN[i] += hh * DP.b[s] * k[s][i];
  const k7 = f(t + hh, yN);
  k.push(k7);
  const erro = new Array<number>(n).fill(0);
  for (let s = 0; s < 7; s++) for (let i = 0; i < n; i++) erro[i] += hh * DP.e[s] * k[s][i];
  return { y: yN, erro, k7 };
}

/**
 * Integração adaptativa de Dormand e Prince 5(4) para y' = f(t, y), com tolerâncias como
 * solve_ivp. Os passos são encurtados para cair exatamente nos tempos pedidos; o evento
 * (primeiro cruzamento de evento(t, y) por zero, subindo) é localizado por Brent com um
 * passo único a partir do último ponto aceito.
 */
export function dopri5(
  f: (t: number, y: number[]) => number[],
  t0: number,
  y0: number[],
  tFim: number,
  opcoes: { rtol?: number; atol?: number; tAvaliar?: VetorLeitura; evento?: (t: number, y: number[]) => number; hInicial?: number; passosMax?: number } = {},
): ResultadoEDO {
  const rtol = opcoes.rtol ?? 1e-8;
  const atol = opcoes.atol ?? 1e-6;
  const tAval = opcoes.tAvaliar ? Array.from(opcoes.tAvaliar) : [];
  const saidaT: number[] = [];
  const saidaY: number[][] = [];
  let iAval = 0;
  while (iAval < tAval.length && tAval[iAval] <= t0) {
    saidaT.push(tAval[iAval]);
    saidaY.push(y0.slice());
    iAval++;
  }
  let t = t0;
  let y = y0.slice();
  let k1 = f(t, y);
  let hh = opcoes.hInicial ?? Math.max(Math.abs(tFim - t0) * 1e-6, 1e-12);
  let gAnt = opcoes.evento ? opcoes.evento(t, y) : 0;
  let passos = 0;
  const passosMax = opcoes.passosMax ?? 1_000_000;
  while (t < tFim && passos++ < passosMax) {
    let alvo = tFim;
    if (iAval < tAval.length && tAval[iAval] < alvo) alvo = tAval[iAval];
    let ajustado = false;
    let hUso = hh;
    if (t + hUso >= alvo) {
      hUso = alvo - t;
      ajustado = true;
    }
    const r = passoDP(f, t, y, k1, hUso);
    let erro = 0;
    for (let i = 0; i < y.length; i++) erro = Math.max(erro, Math.abs(r.erro[i]) / (atol + rtol * Math.max(Math.abs(y[i]), Math.abs(r.y[i]))));
    if (erro <= 1) {
      const tNovo = ajustado ? alvo : t + hUso;
      if (opcoes.evento) {
        const g = opcoes.evento(tNovo, r.y);
        if (gAnt < 0 && g >= 0) {
          const tA = t, yA = y, kA = k1;
          const tEvento = brent((ts) => (ts === tA ? gAnt : opcoes.evento!(ts, passoDP(f, tA, yA, kA, ts - tA).y)), tA, tNovo, 1e-13);
          return { t: saidaT, y: saidaY, tEvento };
        }
        gAnt = g;
      }
      t = tNovo;
      y = r.y;
      k1 = r.k7;
      while (iAval < tAval.length && tAval[iAval] <= t + 1e-15 * Math.max(1, Math.abs(t))) {
        saidaT.push(tAval[iAval]);
        saidaY.push(y.slice());
        iAval++;
      }
      if (ajustado) {
        hh = Math.max(hh, hUso);
        continue;
      }
    }
    const fator = erro === 0 ? 5 : Math.min(5, Math.max(0.2, 0.9 * erro ** -0.2));
    hh = hUso * fator;
  }
  return { t: saidaT, y: saidaY, tEvento: null };
}
