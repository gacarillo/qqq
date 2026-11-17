/**
 * Álgebra densa mínima para o emulador. Matrizes quadradas simétricas guardadas por
 * linha num Float64Array de n × n. Só o que o processo gaussiano usa: Cholesky,
 * substituições, inversa a partir do fator e log do determinante.
 */

/** Fator de Cholesky L (triangular inferior, por linha) de A = L Lᵀ, ou null se A não for definida positiva. */
export function cholesky(A: ArrayLike<number>, n: number): Float64Array | null {
  const L = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    const lj = j * n;
    let s = A[lj + j];
    for (let k = 0; k < j; k++) s -= L[lj + k] * L[lj + k];
    if (!(s > 0) || !Number.isFinite(s)) return null;
    const d = Math.sqrt(s);
    L[lj + j] = d;
    for (let i = j + 1; i < n; i++) {
      const li = i * n;
      let t = A[li + j];
      for (let k = 0; k < j; k++) t -= L[li + k] * L[lj + k];
      L[li + j] = t / d;
    }
  }
  return L;
}

/**
 * Cholesky com reforço da diagonal: tenta com o jitter dado e multiplica por 10 até
 * conseguir. Devolve o fator e o jitter que funcionou.
 */
export function choleskyRobusto(A: ArrayLike<number>, n: number, jitter0 = 1e-10, tentativas = 8): { L: Float64Array; jitter: number } {
  const L0 = cholesky(A, n);
  if (L0) return { L: L0, jitter: 0 };
  const B = Float64Array.from(A);
  let jitter = jitter0;
  for (let t = 0; t < tentativas; t++) {
    for (let i = 0; i < n; i++) B[i * n + i] = A[i * n + i] + jitter;
    const L = cholesky(B, n);
    if (L) return { L, jitter };
    jitter *= 10;
  }
  throw new Error("matriz de covariância não é definida positiva nem com reforço na diagonal");
}

/** Resolve L y = b com L triangular inferior. */
export function substituicaoInferior(L: ArrayLike<number>, n: number, b: ArrayLike<number>, y = new Float64Array(n)): Float64Array {
  for (let i = 0; i < n; i++) {
    const li = i * n;
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[li + k] * y[k];
    y[i] = s / L[li + i];
  }
  return y;
}

/** Resolve Lᵀ x = y com L triangular inferior. */
export function substituicaoSuperiorT(L: ArrayLike<number>, n: number, y: ArrayLike<number>, x = new Float64Array(n)): Float64Array {
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k];
    x[i] = s / L[i * n + i];
  }
  return x;
}

/** Resolve A x = b a partir do fator de Cholesky de A. */
export function resolverCholesky(L: ArrayLike<number>, n: number, b: ArrayLike<number>): Float64Array {
  return substituicaoSuperiorT(L, n, substituicaoInferior(L, n, b));
}

/** log det A = 2 Σ log Lᵢᵢ. */
export function logDetCholesky(L: ArrayLike<number>, n: number): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.log(L[i * n + i]);
  return 2 * s;
}

/** Inversa de A a partir de L, em O(n³): primeiro L⁻¹, depois A⁻¹ = L⁻ᵀ L⁻¹. */
export function inversaCholesky(L: ArrayLike<number>, n: number): Float64Array {
  const M = new Float64Array(n * n); // L⁻¹, triangular inferior
  for (let i = 0; i < n; i++) {
    M[i * n + i] = 1 / L[i * n + i];
    for (let j = 0; j < i; j++) {
      let s = 0;
      for (let k = j; k < i; k++) s += L[i * n + k] * M[k * n + j];
      M[i * n + j] = -s / L[i * n + i];
    }
  }
  const A = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = 0;
      for (let k = i; k < n; k++) s += M[k * n + i] * M[k * n + j];
      A[i * n + j] = s;
      A[j * n + i] = s;
    }
  }
  return A;
}

/** Produto escalar. */
export function escalar(a: ArrayLike<number>, b: ArrayLike<number>, n = a.length): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/** Média e desvio padrão amostral (n − 1). */
export function mediaDesvio(v: ArrayLike<number>): [number, number] {
  const n = v.length;
  if (n === 0) return [NaN, NaN];
  let m = 0;
  for (let i = 0; i < n; i++) m += v[i];
  m /= n;
  let s = 0;
  for (let i = 0; i < n; i++) s += (v[i] - m) ** 2;
  return [m, n > 1 ? Math.sqrt(s / (n - 1)) : 0];
}

/** Média e variância ponderadas, com pesos não normalizados. */
export function mediaVarianciaPonderada(v: ArrayLike<number>, w: ArrayLike<number>): [number, number] {
  let sw = 0;
  let m = 0;
  for (let i = 0; i < v.length; i++) {
    sw += w[i];
    m += w[i] * v[i];
  }
  if (!(sw > 0)) return [NaN, NaN];
  m /= sw;
  let s = 0;
  for (let i = 0; i < v.length; i++) s += w[i] * (v[i] - m) ** 2;
  return [m, s / sw];
}

/** Tamanho efetivo de amostra de pesos de importância, (Σw)² / Σw². */
export function tamanhoEfetivo(w: ArrayLike<number>): number {
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < w.length; i++) {
    s += w[i];
    s2 += w[i] * w[i];
  }
  return s2 > 0 ? (s * s) / s2 : 0;
}

/** Normaliza log-pesos sem estourar: exp(l − max). */
export function pesosDeLog(l: ArrayLike<number>): Float64Array {
  let mx = -Infinity;
  for (let i = 0; i < l.length; i++) if (l[i] > mx) mx = l[i];
  const w = new Float64Array(l.length);
  if (!Number.isFinite(mx)) return w;
  for (let i = 0; i < l.length; i++) w[i] = Math.exp(l[i] - mx);
  return w;
}

/** Função de distribuição da normal padrão (Abramowitz e Stegun 7.1.26 via erf, erro < 1,5e-7). */
export function Phi(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Quantil da normal padrão (Acklam, erro relativo < 1,2e-9 após um passo de Newton). */
export function PhiInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pb = 0.02425;
  let x: number;
  if (p < pb) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pb) {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const e = Phi(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}
