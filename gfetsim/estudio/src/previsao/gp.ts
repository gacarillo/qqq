/**
 * Processo gaussiano para emular a cadeia (Rasmussen e Williams, Gaussian Processes for
 * Machine Learning, MIT Press 2006, capítulos 2 e 5).
 *
 * Núcleo exponencial quadrático com um comprimento por dimensão (ARD), média constante
 * pela padronização de y e ruído branco pequeno, que absorve as descontinuidades da
 * cadeia (a SPE completa ou não, os passos de 0,5 nm da oxidação). Os hiperparâmetros
 * saem do máximo da verossimilhança marginal com uma priori fraca nos logaritmos, por
 * Adam com o gradiente analítico (eq. 5.9 do livro) e alguns reinícios.
 *
 * As entradas já chegam no cubo unitário; quem escala é o emulador.
 */
import { choleskyRobusto, resolverCholesky, inversaCholesky, logDetCholesky, substituicaoInferior } from "./algebra";
import { Aleatorio } from "@/nucleo/aleatorio";

export interface SerialGP {
  d: number;
  X: number[];
  y: number[];
  logEll: number[];
  logSf: number;
  logSn: number;
  ym: number;
  ysd: number;
  lml: number;
}

export interface OpcoesAjuste {
  iteracoes?: number;
  reinicios?: number;
  semente?: number;
  /** ruído mínimo em desvios de y padronizado */
  ruidoMin?: number;
  taxa?: number;
}

const LOG_ELL_MIN = Math.log(0.03);
const LOG_ELL_MAX = Math.log(30);
const PRIORI_ELL = { m: Math.log(0.5), s: 1.5 };
const PRIORI_SF = { m: 0, s: 1.5 };
const PRIORI_SN = { m: Math.log(0.01), s: 2.5 };

/**
 * Log da verossimilhança marginal mais a priori dos hiperparâmetros e o gradiente em
 * th = [log ℓ₁ … log ℓ_d, log σ_f, log σ_n]. X tem n × d por linha e y já padronizado.
 */
export function lmlGradiente(X: Float64Array, n: number, d: number, y: Float64Array, th: Float64Array, grad: Float64Array | null): number {
  const inv2 = new Float64Array(d);
  for (let k = 0; k < d; k++) inv2[k] = Math.exp(-2 * th[k]);
  const sf2 = Math.exp(2 * th[d]);
  const sn2 = Math.exp(2 * th[d + 1]);
  const Kse = new Float64Array(n * n);
  const K = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let r2 = 0;
      for (let k = 0; k < d; k++) {
        const t = X[i * d + k] - X[j * d + k];
        r2 += t * t * inv2[k];
      }
      const v = sf2 * Math.exp(-0.5 * r2);
      Kse[i * n + j] = v;
      Kse[j * n + i] = v;
      K[i * n + j] = v;
      K[j * n + i] = v;
    }
    K[i * n + i] += sn2;
  }
  const { L } = choleskyRobusto(K, n, 1e-10 * sf2);
  const alfa = resolverCholesky(L, n, y);
  let yAlfa = 0;
  for (let i = 0; i < n; i++) yAlfa += y[i] * alfa[i];
  let lml = -0.5 * yAlfa - 0.5 * logDetCholesky(L, n) - 0.5 * n * Math.log(2 * Math.PI);
  // priori fraca nos logaritmos
  for (let k = 0; k < d; k++) lml -= 0.5 * ((th[k] - PRIORI_ELL.m) / PRIORI_ELL.s) ** 2;
  lml -= 0.5 * ((th[d] - PRIORI_SF.m) / PRIORI_SF.s) ** 2;
  lml -= 0.5 * ((th[d + 1] - PRIORI_SN.m) / PRIORI_SN.s) ** 2;
  if (!grad) return lml;
  const Kinv = inversaCholesky(L, n);
  grad.fill(0);
  let gSf = 0;
  let gSn = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      const w = (alfa[i] * alfa[j] - Kinv[i * n + j]) * (i === j ? 1 : 2);
      const kse = Kse[i * n + j];
      gSf += w * 2 * kse;
      if (i === j) gSn += w * 2 * sn2;
      else {
        const wk = w * kse;
        for (let k = 0; k < d; k++) {
          const t = X[i * d + k] - X[j * d + k];
          grad[k] += wk * t * t * inv2[k];
        }
      }
    }
  }
  for (let k = 0; k < d; k++) grad[k] = 0.5 * grad[k] - (th[k] - PRIORI_ELL.m) / PRIORI_ELL.s ** 2;
  grad[d] = 0.5 * gSf - (th[d] - PRIORI_SF.m) / PRIORI_SF.s ** 2;
  grad[d + 1] = 0.5 * gSn - (th[d + 1] - PRIORI_SN.m) / PRIORI_SN.s ** 2;
  return lml;
}

export class ProcessoGaussiano {
  readonly n: number;
  readonly d: number;
  private readonly X: Float64Array;
  private readonly y: Float64Array;
  private readonly inv2: Float64Array;
  private readonly sf2: number;
  private readonly sn2: number;
  private readonly L: Float64Array;
  private readonly alfa: Float64Array;
  private readonly kinvDiag: Float64Array;
  readonly lml: number;

  private constructor(
    X: Float64Array,
    y: Float64Array,
    readonly d0: number,
    private readonly th: Float64Array,
    readonly ym: number,
    readonly ysd: number,
  ) {
    this.d = d0;
    this.n = y.length;
    this.X = X;
    this.y = y;
    const d = this.d;
    const n = this.n;
    this.inv2 = new Float64Array(d);
    for (let k = 0; k < d; k++) this.inv2[k] = Math.exp(-2 * th[k]);
    this.sf2 = Math.exp(2 * th[d]);
    this.sn2 = Math.exp(2 * th[d + 1]);
    const K = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        const v = this.kernel(X, i * d, X, j * d);
        K[i * n + j] = v;
        K[j * n + i] = v;
      }
      K[i * n + i] += this.sn2;
    }
    this.L = choleskyRobusto(K, n, 1e-10 * this.sf2).L;
    this.alfa = resolverCholesky(this.L, n, y);
    const Kinv = inversaCholesky(this.L, n);
    this.kinvDiag = new Float64Array(n);
    for (let i = 0; i < n; i++) this.kinvDiag[i] = Kinv[i * n + i];
    this.lml = lmlGradiente(X, n, d, y, th, null);
  }

  private kernel(A: ArrayLike<number>, a0: number, B: ArrayLike<number>, b0: number): number {
    let r2 = 0;
    for (let k = 0; k < this.d; k++) {
      const t = A[a0 + k] - B[b0 + k];
      r2 += t * t * this.inv2[k];
    }
    return this.sf2 * Math.exp(-0.5 * r2);
  }

  /** Ajusta os hiperparâmetros aos pontos (X no cubo unitário) e devolve o processo. */
  static ajustar(Xl: ArrayLike<ArrayLike<number>>, yl: ArrayLike<number>, o: OpcoesAjuste = {}): ProcessoGaussiano {
    const n = yl.length;
    if (n < 3) throw new Error("o emulador precisa de pelo menos três pontos");
    const d = Xl[0].length;
    const X = new Float64Array(n * d);
    for (let i = 0; i < n; i++) for (let k = 0; k < d; k++) X[i * d + k] = Xl[i][k];
    let ym = 0;
    for (let i = 0; i < n; i++) ym += yl[i];
    ym /= n;
    let v = 0;
    for (let i = 0; i < n; i++) v += (yl[i] - ym) ** 2;
    const ysd = Math.sqrt(v / Math.max(1, n - 1)) || 1;
    const y = Float64Array.from(yl, (t) => (t - ym) / ysd);
    const it = o.iteracoes ?? 90;
    const rein = o.reinicios ?? 2;
    const lr = o.taxa ?? 0.08;
    const snMin = Math.log(o.ruidoMin ?? 1e-3);
    const rng = new Aleatorio(o.semente ?? 11);
    let melhor: Float64Array | null = null;
    let melhorL = -Infinity;
    for (let r = 0; r < rein; r++) {
      const th = new Float64Array(d + 2);
      for (let k = 0; k < d; k++) th[k] = r === 0 ? Math.log(0.6) : r === 1 ? Math.log(0.25) : rng.uniforme(Math.log(0.1), Math.log(2));
      th[d] = 0;
      th[d + 1] = Math.log(0.03);
      const m = new Float64Array(d + 2);
      const s = new Float64Array(d + 2);
      const g = new Float64Array(d + 2);
      let lAnt = -Infinity;
      for (let t = 1; t <= it; t++) {
        let l: number;
        try {
          l = lmlGradiente(X, n, d, y, th, g);
        } catch {
          break;
        }
        if (l > melhorL) {
          melhorL = l;
          melhor = Float64Array.from(th);
        }
        if (Math.abs(l - lAnt) < 1e-6 * Math.max(1, Math.abs(l)) && t > 20) break;
        lAnt = l;
        for (let k = 0; k < d + 2; k++) {
          m[k] = 0.9 * m[k] + 0.1 * g[k];
          s[k] = 0.999 * s[k] + 0.001 * g[k] * g[k];
          const mh = m[k] / (1 - 0.9 ** t);
          const sh = s[k] / (1 - 0.999 ** t);
          th[k] += (lr * mh) / (Math.sqrt(sh) + 1e-8);
        }
        for (let k = 0; k < d; k++) th[k] = Math.min(LOG_ELL_MAX, Math.max(LOG_ELL_MIN, th[k]));
        th[d] = Math.min(3, Math.max(-3, th[d]));
        th[d + 1] = Math.min(0, Math.max(snMin, th[d + 1]));
      }
    }
    if (!melhor) throw new Error("o ajuste do emulador não convergiu");
    return new ProcessoGaussiano(X, y, d, melhor, ym, ysd);
  }

  static de(s: SerialGP): ProcessoGaussiano {
    const th = Float64Array.from([...s.logEll, s.logSf, s.logSn]);
    return new ProcessoGaussiano(Float64Array.from(s.X), Float64Array.from(s.y), s.d, th, s.ym, s.ysd);
  }

  serial(): SerialGP {
    return {
      d: this.d, X: Array.from(this.X), y: Array.from(this.y), logEll: Array.from(this.th.subarray(0, this.d)),
      logSf: this.th[this.d], logSn: this.th[this.d + 1], ym: this.ym, ysd: this.ysd, lml: this.lml,
    };
  }

  /** Comprimentos de correlação no cubo unitário; pequeno quer dizer entrada importante. */
  get comprimentos(): Float64Array {
    return Float64Array.from(this.th.subarray(0, this.d), Math.exp);
  }

  /** Desvio do ruído ajustado, nas unidades de y. */
  get ruido(): number {
    return Math.sqrt(this.sn2) * this.ysd;
  }

  /** Média preditiva, nas unidades de y. Custo O(n d). */
  media(x: ArrayLike<number>): number {
    let s = 0;
    for (let i = 0; i < this.n; i++) s += this.alfa[i] * this.kernel(this.X, i * this.d, x, 0);
    return this.ym + this.ysd * s;
  }

  /** Média e variância da função latente, nas unidades de y. Custo O(n²). */
  prever(x: ArrayLike<number>): { media: number; variancia: number } {
    const ks = new Float64Array(this.n);
    let s = 0;
    for (let i = 0; i < this.n; i++) {
      ks[i] = this.kernel(this.X, i * this.d, x, 0);
      s += this.alfa[i] * ks[i];
    }
    const v = substituicaoInferior(this.L, this.n, ks);
    let vv = 0;
    for (let i = 0; i < this.n; i++) vv += v[i] * v[i];
    return { media: this.ym + this.ysd * s, variancia: Math.max(0, this.sf2 - vv) * this.ysd * this.ysd };
  }

  /** Gradiente da média em x por diferença central, nas unidades de y por unidade do cubo. */
  gradienteMedia(x: ArrayLike<number>, h = 1e-4): Float64Array {
    const g = new Float64Array(this.d);
    const xp = Float64Array.from(x);
    for (let k = 0; k < this.d; k++) {
      const x0 = xp[k];
      xp[k] = x0 + h;
      const a = this.media(xp);
      xp[k] = x0 - h;
      const b = this.media(xp);
      xp[k] = x0;
      g[k] = (a - b) / (2 * h);
    }
    return g;
  }

  /**
   * Validação cruzada deixando um de fora, em forma fechada (eq. 5.12 do livro): média e
   * desvio da previsão de cada ponto sem ele, nas unidades de y. Inclui o ruído.
   */
  loo(): { media: Float64Array; desvio: Float64Array } {
    const m = new Float64Array(this.n);
    const s = new Float64Array(this.n);
    for (let i = 0; i < this.n; i++) {
      m[i] = this.ym + this.ysd * (this.y[i] - this.alfa[i] / this.kinvDiag[i]);
      s[i] = this.ysd * Math.sqrt(1 / this.kinvDiag[i]);
    }
    return { media: m, desvio: s };
  }

  /** Valores de treino nas unidades de y. */
  get treino(): Float64Array {
    return Float64Array.from(this.y, (t) => this.ym + this.ysd * t);
  }

  /** Ponto de treino i, no cubo unitário. */
  ponto(i: number): Float64Array {
    return this.X.slice(i * this.d, (i + 1) * this.d);
  }
}

/** Resumo da validação cruzada: Q², erro quadrático médio e fração dentro de 2σ. */
export function resumoLOO(gp: ProcessoGaussiano): { Q2: number; rmse: number; dentro2s: number; desvioY: number } {
  const { media: m, desvio: s } = gp.loo();
  const y = gp.treino;
  let ym = 0;
  for (const v of y) ym += v;
  ym /= y.length;
  let sse = 0;
  let sst = 0;
  let dentro = 0;
  for (let i = 0; i < y.length; i++) {
    sse += (y[i] - m[i]) ** 2;
    sst += (y[i] - ym) ** 2;
    if (Math.abs(y[i] - m[i]) <= 2 * s[i]) dentro++;
  }
  return { Q2: sst > 0 ? 1 - sse / sst : 1, rmse: Math.sqrt(sse / y.length), dentro2s: dentro / y.length, desvioY: Math.sqrt(sst / Math.max(1, y.length - 1)) };
}
