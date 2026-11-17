/**
 * Distribuição de Pearson IV pelos quatro momentos, parametrização de Heinrich (CERN,
 * "A guide to the Pearson type IV distribution", 2004), com recuo para o tipo I
 * (Elderton e Johnson, cap. 4) quando a curtose fica abaixo da linha do tipo III.
 * Porte direto de gfetsim/implantacao/pearson.py.
 */
import { trapz, type Vetor, type VetorLeitura } from "@/nucleo/numerico";

export interface Momentos {
  media: number;
  desvio: number;
  assimetria: number;
  curtose: number; // beta2, não o excesso
}

export function momentosDeAmostra(x: VetorLeitura): Momentos {
  let m = 0;
  for (let i = 0; i < x.length; i++) m += x[i];
  m /= x.length;
  let s2 = 0, s3 = 0, s4 = 0;
  for (let i = 0; i < x.length; i++) {
    const d = x[i] - m;
    s2 += d * d;
    s3 += d * d * d;
    s4 += d * d * d * d;
  }
  s2 /= x.length;
  s3 /= x.length;
  s4 /= x.length;
  const s = Math.sqrt(s2);
  return { media: m, desvio: s, assimetria: s3 / s ** 3, curtose: s4 / s ** 4 };
}

export function kappa(g1: number, b2: number): number {
  const den = 4 * (4 * b2 - 3 * g1 ** 2) * (2 * b2 - 3 * g1 ** 2 - 6);
  return (g1 ** 2 * (b2 + 3) ** 2) / den;
}

export function parametrosIV(mo: Momentos): { m: number; nu: number; a: number; lam: number } {
  const g1 = mo.assimetria;
  const b2 = mo.curtose;
  const k = kappa(g1, b2);
  if (!(k > 0 && k < 1) || 2 * b2 - 3 * g1 ** 2 - 6 <= 0) throw new RangeError(`momentos fora da região Pearson IV (kappa = ${k.toFixed(3)})`);
  const r = (6 * (b2 - g1 ** 2 - 1)) / (2 * b2 - 3 * g1 ** 2 - 6);
  const m = 1 + r / 2;
  const raiz = 16 * (r - 1) - g1 ** 2 * (r - 2) ** 2;
  if (raiz <= 0) throw new RangeError("momentos fora da região Pearson IV");
  const nu = (-r * (r - 2) * g1) / Math.sqrt(raiz);
  const a = (mo.desvio * Math.sqrt(raiz)) / 4;
  const lam = mo.media - ((r - 2) * g1 * mo.desvio) / 4;
  return { m, nu, a, lam };
}

export function densidadeIV(x: VetorLeitura, mo: Momentos): Vetor {
  const { m, nu, a, lam } = parametrosIV(mo);
  const logf = new Float64Array(x.length);
  let lmax = -Infinity;
  for (let i = 0; i < x.length; i++) {
    const u = (x[i] - lam) / a;
    logf[i] = -m * Math.log1p(u * u) - nu * Math.atan(u);
    if (logf[i] > lmax) lmax = logf[i];
  }
  const f = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) f[i] = Math.exp(logf[i] - lmax);
  const area = trapz(f, x);
  for (let i = 0; i < x.length; i++) f[i] /= area;
  return f;
}

export function densidadeI(x: VetorLeitura, mo: Momentos): Vetor {
  const b1 = mo.assimetria ** 2;
  const b2 = mo.curtose;
  const den = 6 + 3 * b1 - 2 * b2;
  if (den <= 0) throw new RangeError("momentos fora da região Pearson I");
  const r = (6 * (b2 - b1 - 1)) / den;
  const raiz = Math.sqrt((r + 2) ** 2 * b1 + 16 * (r + 1));
  const s = (Math.sign(mo.assimetria) * (r + 2) * Math.sqrt(b1)) / raiz;
  const alfa = (r / 2) * (1 - s);
  const beta = (r / 2) * (1 + s);
  const escala = (mo.desvio * raiz) / 2;
  const loc = mo.media - (escala * alfa) / (alfa + beta);
  const f = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const u = (x[i] - loc) / escala;
    if (u > 0 && u < 1) f[i] = Math.exp((alfa - 1) * Math.log(u) + (beta - 1) * Math.log1p(-u));
  }
  const area = trapz(f, x);
  for (let i = 0; i < x.length; i++) f[i] /= area;
  return f;
}

/** Tenta o tipo IV e cai para o tipo I quando os momentos exigem. */
export function densidadePearson(x: VetorLeitura, mo: Momentos): { f: Vetor; tipo: "IV" | "I" } {
  try {
    return { f: densidadeIV(x, mo), tipo: "IV" };
  } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    return { f: densidadeI(x, mo), tipo: "I" };
  }
}
