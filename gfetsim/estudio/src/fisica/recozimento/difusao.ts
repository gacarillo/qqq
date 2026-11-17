/**
 * Difusão de P pelo modelo de Fair e Tsai (R6), por diferenças finitas implícitas com
 * iteração de Picard, porte de gfetsim/recozimento/difusao.py.
 *
 *   dC/dt = d/dx [ h(n) D_FT(n) d C_mov/dx ],  C_mov = min(C, C_sat(T))  (N24)
 *   D_FT = D0 + D- (n/ni) + D= (n/ni)^2,       h = 1 + C_a / sqrt(C_a^2 + 4 ni^2) [C]
 *
 * Sem a cauda acelerada de Fair e Tsai e sem TED, como no Python.
 */
import type { Parametros } from "@/parametros/parametros";
import { kB_eV } from "@/nucleo/constantes";
import { tridiagonal, type Vetor } from "@/nucleo/numerico";
import * as si from "./silicio";

export interface CoeficientesFT {
  D0: number;
  Dm: number;
  Dmm: number;
}

export function coeficientesFT(p: Parametros, T_C: number): CoeficientesFT {
  const kT = kB_eV * (T_C + 273.15);
  const b = "recozimento.difusao_P.fair_tsai.";
  return {
    D0: p.valor(b + "D0_neutro") * Math.exp(-p.valor(b + "Ea_neutro") / kT),
    Dm: p.valor(b + "D0_menos") * Math.exp(-p.valor(b + "Ea_menos") / kT),
    Dmm: p.valor(b + "D0_duplo") * Math.exp(-p.valor(b + "Ea_duplo") / kT),
  };
}

export function difusividadeFT(c: CoeficientesFT, nSobreNi: number): number {
  return c.D0 + c.Dm * nSobreNi + c.Dmm * nSobreNi * nSobreNi;
}

/** Condição de fluxo na superfície: J = a C0 - b (cm^-2 s^-1, positivo saindo do Si). */
export type FluxoSuperficie = (C0: number) => [number, number];

/** Constantes de temperatura reaproveitadas entre passos. */
export interface ContextoT {
  T_C: number;
  ni: number;
  Cs: number;
  ne: number;
  ft: CoeficientesFT;
}

export function contexto(p: Parametros, T_C: number): ContextoT {
  return { T_C, ni: si.ni(p, T_C), Cs: si.C_sat(p, T_C), ne: si.n_e(p, T_C), ft: coeficientesFT(p, T_C) };
}

/** Área de trabalho para evitar alocação em laços 2D. */
export class AreaDifusao {
  readonly Cn: Vetor;
  readonly novo: Vetor;
  readonly D: Vetor;
  readonly s: Vetor;
  readonly diag: Vetor;
  readonly sup: Vetor;
  readonly inf: Vetor;
  readonly rhs: Vetor;
  constructor(readonly n: number) {
    this.Cn = new Float64Array(n);
    this.novo = new Float64Array(n);
    this.D = new Float64Array(n);
    this.s = new Float64Array(n);
    this.diag = new Float64Array(n);
    this.sup = new Float64Array(n - 1);
    this.inf = new Float64Array(n - 1);
    this.rhs = new Float64Array(n);
  }
}

/**
 * Um passo implícito com Picard. dx em nm. C é lido e o resultado é escrito em saida
 * (pode ser o próprio C).
 */
export function passoTemporal(ctx: ContextoT, dx_nm: number, C: ArrayLike<number>, dt_s: number, saida: Vetor, fluxo?: FluxoSuperficie, area?: AreaDifusao): Vetor {
  const N = C.length;
  const w = area && area.n === N ? area : new AreaDifusao(N);
  const dx = dx_nm * 1e-7;
  const { ni: ni_, Cs, ne, ft } = ctx;
  const { Cn, novo, D, s, diag, sup, inf, rhs } = w;
  for (let i = 0; i < N; i++) Cn[i] = C[i];
  const r = dt_s / (dx * dx);
  for (let it = 0; it < 30; it++) {
    for (let i = 0; i < N; i++) {
      const c = Cn[i];
      const Cmov = c < Cs ? c : Cs;
      const Ca = c < ne ? c : ne;
      const n = 0.5 * Ca + Math.sqrt(0.25 * Ca * Ca + ni_ * ni_);
      const hh = 1 + Ca / Math.sqrt(Ca * Ca + 4 * ni_ * ni_);
      const u = n / ni_;
      D[i] = hh * (ft.D0 + ft.Dm * u + ft.Dmm * u * u);
      s[i] = c > 0 ? Cmov / Math.max(c, 1e-30) : 1;
    }
    for (let i = 0; i < N; i++) {
      diag[i] = 1;
      rhs[i] = C[i];
    }
    for (let i = 0; i < N - 1; i++) {
      const Df = 0.5 * (D[i + 1] + D[i]);
      diag[i] += r * Df * s[i];
      diag[i + 1] += r * Df * s[i + 1];
      sup[i] = -r * Df * s[i + 1];
      inf[i] = -r * Df * s[i];
    }
    if (fluxo) {
      const [a, b] = fluxo(Cn[0]);
      diag[0] += (dt_s / dx) * a;
      rhs[0] += (dt_s / dx) * b;
    }
    tridiagonal(inf, diag, sup, rhs, novo);
    let erro = 0;
    for (let i = 0; i < N; i++) {
      if (novo[i] < 0) novo[i] = 0;
      const e = Math.abs(novo[i] - Cn[i]) / (Cn[i] + 1e15);
      if (e > erro) erro = e;
      Cn[i] = novo[i];
    }
    if (erro < 1e-6) break;
  }
  for (let i = 0; i < N; i++) saida[i] = Cn[i];
  return saida;
}

/** Passos crescentes geometricamente (razão 1,03), como difusao.difundir. */
export function passosGeometricos(t_s: number, n: number, razao = 1.03): Vetor {
  const dts = new Float64Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    dts[i] = razao ** i;
    s += dts[i];
  }
  for (let i = 0; i < n; i++) dts[i] *= t_s / s;
  return dts;
}

export function difundir(p: Parametros, x_nm: ArrayLike<number>, C: ArrayLike<number>, T_C: number, t_s: number, nPassos?: number, fluxo?: FluxoSuperficie, aoPasso?: (k: number, C: Vetor) => void): Vetor {
  const out = Float64Array.from(C as ArrayLike<number>);
  if (t_s <= 0) return out;
  const nInt = Math.trunc(nPassos ?? Math.min(400, Math.max(50, t_s / 2))); // int(np.clip(t/2, 50, 400))
  const dts = passosGeometricos(t_s, nInt);
  const ctx = contexto(p, T_C);
  const area = new AreaDifusao(out.length);
  const dx = x_nm[1] - x_nm[0];
  for (let k = 0; k < nInt; k++) {
    passoTemporal(ctx, dx, out, dts[k], out, fluxo, area);
    aoPasso?.(k, out);
  }
  return out;
}
