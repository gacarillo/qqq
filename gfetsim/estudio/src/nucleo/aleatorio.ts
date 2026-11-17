/**
 * Gerador pseudoaleatório reproduzível (xoshiro128**) e distribuições usadas no Monte
 * Carlo e na visualização. A mesma semente dá a mesma sequência em qualquer navegador.
 */
export class Aleatorio {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;
  private normalGuardada: number | null = null;

  constructor(semente = 1) {
    // splitmix32 para espalhar a semente pelos quatro estados
    let z = semente >>> 0;
    const proximo = () => {
      z = (z + 0x9e3779b9) >>> 0;
      let t = z;
      t = Math.imul(t ^ (t >>> 16), 0x85ebca6b) >>> 0;
      t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35) >>> 0;
      return (t ^ (t >>> 16)) >>> 0;
    };
    this.s0 = proximo();
    this.s1 = proximo();
    this.s2 = proximo();
    this.s3 = proximo();
  }

  /** Inteiro de 32 bits sem sinal. */
  u32(): number {
    const r = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    return r;
  }

  /** Uniforme em [0, 1). */
  real(): number {
    return this.u32() / 4294967296;
  }

  uniforme(a: number, b: number): number {
    return a + (b - a) * this.real();
  }

  inteiro(n: number): number {
    return Math.floor(this.real() * n);
  }

  /** Normal pelo método polar de Marsaglia. */
  normal(media = 0, desvio = 1): number {
    if (this.normalGuardada !== null) {
      const v = this.normalGuardada;
      this.normalGuardada = null;
      return media + desvio * v;
    }
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = 2 * this.real() - 1;
      v = 2 * this.real() - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const m = Math.sqrt((-2 * Math.log(s)) / s);
    this.normalGuardada = v * m;
    return media + desvio * u * m;
  }

  logUniforme(a: number, b: number): number {
    return Math.exp(this.uniforme(Math.log(a), Math.log(b)));
  }

  embaralhar<T>(lista: T[]): T[] {
    for (let i = lista.length - 1; i > 0; i--) {
      const j = this.inteiro(i + 1);
      [lista[i], lista[j]] = [lista[j], lista[i]];
    }
    return lista;
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/**
 * Hipercubo latino em d dimensões, n amostras em [0, 1)^d. Cobre o espaço melhor que
 * amostras independentes com o mesmo n, útil quando cada amostra custa uma cadeia inteira.
 */
export function hipercuboLatino(n: number, d: number, rng: Aleatorio): Float64Array[] {
  const saida = Array.from({ length: n }, () => new Float64Array(d));
  for (let k = 0; k < d; k++) {
    const perm = rng.embaralhar(Array.from({ length: n }, (_, i) => i));
    for (let i = 0; i < n; i++) saida[i][k] = (perm[i] + rng.real()) / n;
  }
  return saida;
}

/** Quantil empírico com interpolação linear (np.percentile, método linear). */
export function quantil(valores: ArrayLike<number>, p: number): number {
  const v = Array.from(valores).filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length === 0) return NaN;
  const pos = (v.length - 1) * p;
  const i = Math.floor(pos);
  const t = pos - i;
  return i + 1 < v.length ? v[i] * (1 - t) + v[i + 1] * t : v[i];
}
