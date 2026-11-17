/**
 * Amostrador por conjunto invariante a transformações afins (Goodman e Weare, Commun.
 * Appl. Math. Comput. Sci. 5, 65, 2010), o "stretch move" do emcee (Foreman-Mackey et al.,
 * PASP 125, 306, 2013). Não precisa de ajuste de passo, o que importa aqui porque os
 * parâmetros têm escalas muito diferentes mesmo no cubo unitário.
 *
 * Diagnósticos: fração de aceitação, tempo de autocorrelação integrado com a janela
 * automática de Sokal (c = 5) sobre a média dos caminhantes, tamanho efetivo e o R̂
 * dividido de Gelman e Rubin sobre metades de cada caminhante.
 */
import { Aleatorio } from "@/nucleo/aleatorio";

export interface OpcoesMCMC {
  caminhantes?: number;
  passos?: number;
  descarte?: number;
  semente?: number;
  /** parâmetro de esticamento, 2 no artigo original */
  a?: number;
  maxAmostras?: number;
  progresso?: (fracao: number) => void;
}

export interface ResultadoMCMC {
  d: number;
  S: number;
  /** amostras depois do descarte, S × d por linha */
  amostras: Float64Array;
  logp: Float64Array;
  aceitacao: number;
  tau: number[];
  ess: number;
  rhat: number[];
  /** média do log da posteriori por passo, para o gráfico de traço */
  tracoLogp: Float64Array;
  /** posição do caminhante 0 por passo, passos × d */
  tracoCaminhante: Float64Array;
  passos: number;
  descarte: number;
  caminhantes: number;
  melhor: Float64Array;
  logpMelhor: number;
}

export function amostrarConjunto(logp: (x: Float64Array) => number, inicial: (rng: Aleatorio) => Float64Array, d: number, o: OpcoesMCMC = {}): ResultadoMCMC {
  const W = Math.max(o.caminhantes ?? Math.max(4 * d, 32), 2 * d + 2);
  const T = o.passos ?? 1500;
  const B = Math.min(o.descarte ?? Math.floor(T / 3), T - 10);
  const a = o.a ?? 2;
  const rng = new Aleatorio(o.semente ?? 2024);
  const X: Float64Array[] = [];
  const L = new Float64Array(W);
  for (let w = 0; w < W; w++) {
    let x = inicial(rng);
    let l = logp(x);
    for (let t = 0; t < 200 && !Number.isFinite(l); t++) {
      x = inicial(rng);
      l = logp(x);
    }
    if (!Number.isFinite(l)) throw new Error("não achei ponto inicial com posteriori finita; confira as medidas e a faixa do emulador");
    X.push(x);
    L[w] = l;
  }
  const nPos = T - B;
  const cadeias = new Float64Array(W * nPos * d); // [w][t][k]
  const logps = new Float64Array(W * nPos);
  const tracoLogp = new Float64Array(T);
  const tracoCaminhante = new Float64Array(T * d);
  let aceitos = 0;
  let melhor = Float64Array.from(X[0]);
  let logpMelhor = L[0];
  const Y = new Float64Array(d);
  for (let t = 0; t < T; t++) {
    for (let k = 0; k < W; k++) {
      let j = rng.inteiro(W - 1);
      if (j >= k) j++;
      const u = rng.real();
      const z = ((a - 1) * u + 1) ** 2 / a;
      const xk = X[k];
      const xj = X[j];
      for (let i = 0; i < d; i++) Y[i] = xj[i] + z * (xk[i] - xj[i]);
      const lY = logp(Y);
      const q = (d - 1) * Math.log(z) + lY - L[k];
      if (Number.isFinite(lY) && Math.log(rng.real()) < q) {
        xk.set(Y);
        L[k] = lY;
        if (t >= B) aceitos++;
        if (lY > logpMelhor) {
          logpMelhor = lY;
          melhor = Float64Array.from(Y);
        }
      }
    }
    let sl = 0;
    for (let k = 0; k < W; k++) sl += L[k];
    tracoLogp[t] = sl / W;
    tracoCaminhante.set(X[0], t * d);
    if (t >= B) {
      const tt = t - B;
      for (let k = 0; k < W; k++) {
        cadeias.set(X[k], (k * nPos + tt) * d);
        logps[k * nPos + tt] = L[k];
      }
    }
    if (o.progresso && t % 50 === 0) o.progresso(t / T);
  }
  // diagnósticos
  const tau: number[] = [];
  const rhat: number[] = [];
  for (let i = 0; i < d; i++) {
    const m = new Float64Array(nPos);
    for (let t = 0; t < nPos; t++) {
      let s = 0;
      for (let k = 0; k < W; k++) s += cadeias[(k * nPos + t) * d + i];
      m[t] = s / W;
    }
    tau.push(tempoAutocorrelacao(m));
    rhat.push(rhatDividido(cadeias, W, nPos, d, i));
  }
  const tauMax = Math.max(1, ...tau.filter(Number.isFinite));
  const ess = (W * nPos) / tauMax;
  // amostras finais, desbastadas até o máximo pedido
  const total = W * nPos;
  const maxA = o.maxAmostras ?? 4000;
  const passo = Math.max(1, Math.floor(total / maxA));
  const S = Math.floor(total / passo);
  const amostras = new Float64Array(S * d);
  const lp = new Float64Array(S);
  for (let s = 0; s < S; s++) {
    const idx = s * passo;
    // percorre por tempo primeiro, para não pegar só os primeiros caminhantes
    const t = idx % nPos;
    const k = Math.floor(idx / nPos);
    amostras.set(cadeias.subarray((k * nPos + t) * d, (k * nPos + t + 1) * d), s * d);
    lp[s] = logps[k * nPos + t];
  }
  return {
    d, S, amostras, logp: lp, aceitacao: aceitos / (W * nPos), tau, ess, rhat, tracoLogp, tracoCaminhante,
    passos: T, descarte: B, caminhantes: W, melhor, logpMelhor,
  };
}

/** Tempo de autocorrelação integrado com a janela automática de Sokal (c = 5). */
export function tempoAutocorrelacao(x: ArrayLike<number>, c = 5): number {
  const n = x.length;
  if (n < 8) return NaN;
  let m = 0;
  for (let i = 0; i < n; i++) m += x[i];
  m /= n;
  let v0 = 0;
  for (let i = 0; i < n; i++) v0 += (x[i] - m) ** 2;
  if (!(v0 > 0)) return 1;
  let tau = 1;
  const maxLag = Math.floor(n / 2);
  for (let lag = 1; lag < maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += (x[i] - m) * (x[i + lag] - m);
    tau += 2 * (s / v0);
    if (lag >= c * tau) return tau;
  }
  return tau;
}

/** R̂ de Gelman e Rubin com cada caminhante dividido em duas metades. */
export function rhatDividido(cad: Float64Array, W: number, n: number, d: number, i: number): number {
  const h = Math.floor(n / 2);
  if (h < 4) return NaN;
  const medias: number[] = [];
  const vars: number[] = [];
  for (let k = 0; k < W; k++) {
    for (let metade = 0; metade < 2; metade++) {
      let s = 0;
      for (let t = 0; t < h; t++) s += cad[(k * n + metade * h + t) * d + i];
      const mm = s / h;
      let v = 0;
      for (let t = 0; t < h; t++) v += (cad[(k * n + metade * h + t) * d + i] - mm) ** 2;
      medias.push(mm);
      vars.push(v / (h - 1));
    }
  }
  const m = medias.length;
  const mg = medias.reduce((a, b) => a + b, 0) / m;
  const Bv = (h / (m - 1)) * medias.reduce((a, b) => a + (b - mg) ** 2, 0);
  const Wv = vars.reduce((a, b) => a + b, 0) / m;
  if (!(Wv > 0)) return 1;
  const vmais = ((h - 1) / h) * Wv + Bv / h;
  return Math.sqrt(vmais / Wv);
}
