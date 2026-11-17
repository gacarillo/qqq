/**
 * Eletrostática e transporte do grafeno sobre a porta local, porte de eletrico/grafeno.py.
 *
 *   V_G - V_D = q n / C_ox + mu_g(n)/q - [phi_s(q n - Q_f) - phi_s(-Q_f)]
 *
 * n é a densidade de elétrons (negativa para lacunas). mu_g vem de n(mu) com DOS linear,
 * Fermi-Dirac e alargamento gaussiano equivalente a n* [C] (R40, R39); phi_s do Poisson.
 * Transporte de Kim (R34) e de Jiménez (R42).
 */
import type { Parametros } from "@/parametros/parametros";
import { eps0, hbar, kB, q } from "@/nucleo/constantes";
import { brent, linspace, SplineCubica, trapz, type Vetor, type VetorLeitura } from "@/nucleo/numerico";
import type { SiPorta } from "./poisson";

export function potencialQuimico(n_m2: number, vF: number): number {
  return Math.sign(n_m2) * hbar * vF * Math.sqrt(Math.PI * Math.abs(n_m2));
}

export function sigmaDeNEstrela(nEstrela_m2: number, vF: number): number {
  return hbar * vF * Math.sqrt(Math.PI * nEstrela_m2);
}

/** n(mu) em m^-2 com DOS 2|E|/(pi (hbar vF)^2), Fermi-Dirac a T e alargamento sigma (J). */
export function tabelaNMu(vF: number, sigma_J: number, T = 300, muMax_eV = 1.5, n = 1201): { mu: Vetor; n: Vetor } {
  const kT = kB * T;
  const NE = 6401;
  const E = linspace(-muMax_eV * 1.6 * q, muMax_eV * 1.6 * q, NE);
  let dos = Float64Array.from(E, (e) => (2 * Math.abs(e)) / (Math.PI * (hbar * vF) ** 2));
  if (sigma_J > 0) {
    const dE = E[1] - E[0];
    const m = Math.trunc((5 * sigma_J) / dE);
    const k = new Float64Array(2 * m + 1);
    let s = 0;
    for (let i = -m; i <= m; i++) {
      k[i + m] = Math.exp(-0.5 * ((i * dE) / sigma_J) ** 2);
      s += k[i + m];
    }
    for (let i = 0; i < k.length; i++) k[i] /= s;
    const conv = new Float64Array(NE);
    for (let i = 0; i < NE; i++) {
      let acc = 0;
      for (let j = 0; j < k.length; j++) {
        const idx = i + m - j;
        if (idx >= 0 && idx < NE) acc += dos[idx] * k[j];
      }
      conv[i] = acc;
    }
    dos = conv;
  }
  const mus = linspace(-muMax_eV * q, muMax_eV * q, n);
  const ns = new Float64Array(n);
  const integ = new Float64Array(NE);
  for (let a = 0; a < n; a++) {
    const mu = mus[a];
    for (let i = 0; i < NE; i++) {
      const arg = Math.min(700, Math.max(-700, (E[i] - mu) / kT));
      const f = 1 / (1 + Math.exp(arg));
      integ[i] = dos[i] * (E[i] > 0 ? f : f - 1);
    }
    ns[a] = trapz(integ, E);
  }
  return { mu: mus, n: ns };
}

const cacheTabela = new Map<string, { spline: SplineCubica; mu: Vetor; n: Vetor }>();

function tabelaCache(vF: number, nEstrela: number, T: number) {
  const chave = `${vF.toFixed(3)}|${Math.round(nEstrela / 1e10) * 1e10}|${T}`;
  let t = cacheTabela.get(chave);
  if (!t) {
    const r = tabelaNMu(vF, sigmaDeNEstrela(Math.round(nEstrela / 1e10) * 1e10, vF), T);
    t = { spline: new SplineCubica(r.n, r.mu), mu: r.mu, n: r.n };
    cacheTabela.set(chave, t);
  }
  return t;
}

export interface OpcoesPilha {
  C_ox: number; // F/m²
  vF: number;
  nEstrela: number; // m^-2
  Q_f?: number; // C/m²
  V_D?: number;
  tabelaQ?: VetorLeitura;
  tabelaPhi?: VetorLeitura;
  D_it?: number; // m^-2 V^-1 [I]
  T?: number;
}

export class Pilha {
  readonly C_ox: number;
  readonly vF: number;
  readonly nEstrela: number;
  readonly Q_f: number;
  V_D: number;
  readonly D_it: number;
  readonly T: number;
  private readonly muDeN: SplineCubica;
  private readonly phiSpline: SplineCubica | null;
  private readonly phiRef: number;

  constructor(o: OpcoesPilha) {
    this.C_ox = o.C_ox;
    this.vF = o.vF;
    this.nEstrela = o.nEstrela;
    this.Q_f = o.Q_f ?? 0;
    this.V_D = o.V_D ?? 0;
    this.D_it = o.D_it ?? 0;
    this.T = o.T ?? 300;
    this.muDeN = tabelaCache(this.vF, this.nEstrela, this.T).spline;
    this.phiSpline = o.tabelaQ && o.tabelaPhi ? new SplineCubica(o.tabelaQ, o.tabelaPhi) : null;
    this.phiRef = this.phiSpline ? this.phiSpline.avaliar(-this.Q_f) : 0;
  }

  /** Potencial químico (J). */
  mu(n_m2: number): number {
    const lim = 1e18;
    return Math.abs(n_m2) < lim ? this.muDeN.avaliar(n_m2) : potencialQuimico(n_m2, this.vF);
  }

  phiS(Q_si: number): number {
    return this.phiSpline ? this.phiSpline.avaliar(Q_si) : 0;
  }

  /** V_G para uma densidade n (m^-2). */
  tensao(n_m2: number): number {
    const mu = this.mu(n_m2) / q;
    const Qsi = q * n_m2 - this.Q_f;
    let phi = this.phiS(Qsi) - this.phiS(-this.Q_f);
    if (this.D_it > 0) for (let k = 0; k < 30; k++) phi = this.phiS(Qsi + q * this.D_it * phi) - this.phiS(-this.Q_f);
    return this.V_D + (q * n_m2) / this.C_ox + mu - phi;
  }

  densidade(V_G: number): number {
    const lim = 5e17;
    return brent((n) => this.tensao(n) - V_G, -lim, lim, 1e6);
  }

  densidades(V: VetorLeitura): Vetor {
    return Float64Array.from(V as ArrayLike<number>, (v) => this.densidade(v));
  }

  /** C total por área (F/m²) por diferença finita de q n(V). */
  capacitancia(V_G: number): number {
    const dV = 1e-3;
    return (q * (this.densidade(V_G + dV) - this.densidade(V_G - dV))) / (2 * dV);
  }

  get phiReferencia(): number {
    return this.phiRef;
  }
}

/** Cq = q² dn/dmu com n_ef = sqrt(n² + n*²) [C]. */
export function capacitanciaQuantica(n_m2: number, vF: number, nEstrela: number): number {
  const nef = Math.sqrt(n_m2 * n_m2 + nEstrela * nEstrela);
  return (2 * q * q * Math.sqrt(nef)) / (hbar * vF * Math.sqrt(Math.PI));
}

/** Resistência pelo modelo de Kim (R34): total para W dado ou por quadrado se W é nulo. */
export function resistenciaKim(n_m2: number, mu_m2: number, n0_m2: number, LsobreW: number, RcW_ohm_m = 0, W_m?: number): number {
  const canal = LsobreW / (q * mu_m2 * Math.sqrt(n0_m2 * n0_m2 + n_m2 * n_m2));
  return canal + (W_m ? (2 * RcW_ohm_m) / W_m : 0);
}

/** Corrente de Jiménez (R42), sem resistência de contato (V_DS interno). */
export function correnteJimenez(pilha: Pilha, V_GS: number, V_DS: number, mu_m2: number, L_m: number, W_m: number, hbarOmega_eV: number, rho0_m2: number, nPontos = 201): number {
  const Omega = (hbarOmega_eV * q) / hbar;
  const V = linspace(0, V_DS, nPontos);
  const rho = new Float64Array(nPontos);
  const invv = new Float64Array(nPontos);
  for (let i = 0; i < nPontos; i++) {
    rho[i] = Math.abs(pilha.densidade(V_GS - V[i])) + rho0_m2;
    invv[i] = Math.sqrt(Math.PI * rho[i]) / Omega;
  }
  const num = q * W_m * mu_m2 * trapz(rho, V);
  const den = L_m + mu_m2 * Math.abs(trapz(invv, V));
  return num / den;
}

export function pilhaDeParams(p: Parametros, espessura_nm: number, siPorta: SiPorta | null, o: { V_D?: number; Q_f_cm2?: number; nEstrela_cm2?: number; eps_r_ox?: number; Q_max?: number; nTabela?: number; D_it_cm2_eV?: number } = {}): { pilha: Pilha; tabela: ReturnType<SiPorta["tabela"]> | null } {
  const epsOx = (o.eps_r_ox ?? p.valor("eletrico.materiais.eps_r_SiO2")) * eps0;
  const C_ox = epsOx / (espessura_nm * 1e-9);
  const vF = p.valor("eletrico.grafeno.vF");
  const ne = o.nEstrela_cm2 ?? p.valor("eletrico.grafeno.n_residual.ju_lee");
  const tab = siPorta ? siPorta.tabela(o.Q_max ?? 0.04, o.nTabela ?? 61) : null;
  const pilha = new Pilha({
    C_ox, vF, nEstrela: ne * 1e4, Q_f: (o.Q_f_cm2 ?? 0) * q * 1e4, V_D: o.V_D ?? 0,
    tabelaQ: tab?.Q, tabelaPhi: tab?.phi, D_it: (o.D_it_cm2_eV ?? 0) * 1e4,
  });
  return { pilha, tabela: tab };
}
