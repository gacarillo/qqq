/**
 * Poisson 1D no Si da porta com Fermi-Dirac para elétrons, porte de eletrico/poisson.py.
 *
 * x = 0 na interface Si/SiO2, crescendo para dentro do Si. psi em V com o nível de Fermi
 * em zero; n = Nc F_1/2(psi/Vt), lacunas por Boltzmann. Q_si (C/m²) é positiva em
 * depleção e negativa em acumulação; phi_s(Q) = psi(0; Q) - psi(0; 0).
 * Ionização completa (R35) e sem estreitamento de banda.
 */
import type { Parametros } from "@/parametros/parametros";
import { eps0, kB, q, T_AMBIENTE_K } from "@/nucleo/constantes";
import { dF12, F12 } from "@/nucleo/fermi";
import { interp, linspace, tridiagonal, type Vetor, type VetorLeitura } from "@/nucleo/numerico";

export class SiPorta {
  readonly Vt = (kB * T_AMBIENTE_K) / q;
  readonly eps: number;
  readonly Nc: number;
  readonly ni: number;
  readonly x: Vetor; // m
  readonly Nd: Vetor; // m^-3
  readonly psiEq: Vetor;
  readonly psi0: Vetor;
  private readonly h: Vetor;
  private readonly vol: Vetor;

  constructor(p: Parametros, x_nm: VetorLeitura, Nd_cm3: VetorLeitura, fundo_cm3 = 0, profundidade_nm = 300, nPontos = 801) {
    this.eps = p.valor("eletrico.materiais.eps_r_Si") * eps0;
    this.Nc = p.valor("eletrico.silicio_300K.Nc") * 1e6;
    this.ni = p.valor("recozimento.silicio.ni_300K") * 1e6;
    const u = linspace(0, 1, nPontos);
    this.x = Float64Array.from(u, (v) => profundidade_nm * 1e-9 * v ** 2.5);
    const ultimo = Nd_cm3[Nd_cm3.length - 1];
    this.Nd = Float64Array.from(this.x, (xx) => Math.max(interp(xx * 1e9, x_nm, Nd_cm3, undefined, ultimo) + fundo_cm3, 1e10) * 1e6);
    const N = nPontos;
    this.h = new Float64Array(N - 1);
    for (let i = 0; i < N - 1; i++) this.h[i] = this.x[i + 1] - this.x[i];
    this.vol = new Float64Array(N);
    for (let i = 0; i < N - 1; i++) {
      this.vol[i] += 0.5 * this.h[i];
      this.vol[i + 1] += 0.5 * this.h[i];
    }
    this.psiEq = this.equilibrioLocal();
    this.psi0 = this.resolver(0, this.psiEq);
  }

  n(psi: number): number {
    return this.Nc * F12(psi / this.Vt);
  }

  p(psi: number): number {
    return ((this.ni * this.ni) / this.Nc) * Math.exp(Math.min(700, Math.max(-700, -psi / this.Vt)));
  }

  private equilibrioLocal(): Vetor {
    const out = new Float64Array(this.Nd.length);
    for (let i = 0; i < this.Nd.length; i++) {
      let lo = -40;
      let hi = 120;
      for (let k = 0; k < 80; k++) {
        const m = 0.5 * (lo + hi);
        if (this.Nc * F12(m) > this.Nd[i]) hi = m;
        else lo = m;
      }
      out[i] = 0.5 * (lo + hi) * this.Vt;
    }
    return out;
  }

  /** psi(x) para carga Q_si (C/m²); Neumann em x = 0 e Dirichlet no fundo. */
  resolver(Q_si: number, chute?: VetorLeitura, iterMax = 200): Vetor {
    const N = this.x.length;
    const { h, vol, eps } = this;
    const psi = Float64Array.from((chute ?? this.psi0 ?? this.psiEq) as ArrayLike<number>);
    const F = new Float64Array(N);
    const diag = new Float64Array(N);
    const sup = new Float64Array(N - 1);
    const inf = new Float64Array(N - 1);
    const rho = new Float64Array(N);
    const drho = new Float64Array(N);
    const fl = new Float64Array(N - 1);
    const d = new Float64Array(N);
    for (let it = 0; it < iterMax; it++) {
      for (let i = 0; i < N; i++) {
        const pp = this.p(psi[i]);
        rho[i] = q * (this.Nd[i] - this.n(psi[i]) + pp);
        drho[i] = -q * ((this.Nc * dF12(psi[i] / this.Vt)) / this.Vt + pp / this.Vt);
      }
      for (let i = 0; i < N - 1; i++) fl[i] = (eps * (psi[i + 1] - psi[i])) / h[i];
      for (let i = 1; i < N - 1; i++) F[i] = -(fl[i] - fl[i - 1] + rho[i] * vol[i]);
      F[0] = -(fl[0] - Q_si + rho[0] * vol[0]);
      F[N - 1] = 0;
      for (let i = 1; i < N - 1; i++) {
        diag[i] = -eps / h[i] - eps / h[i - 1] + drho[i] * vol[i];
        sup[i] = eps / h[i];
        inf[i - 1] = eps / h[i - 1];
      }
      diag[0] = -eps / h[0] + drho[0] * vol[0];
      sup[0] = eps / h[0];
      diag[N - 1] = 1;
      inf[N - 2] = 0;
      tridiagonal(inf, diag, sup, F, d);
      let m = 0;
      for (let i = 0; i < N; i++) {
        const di = d[i] > 0.2 ? 0.2 : d[i] < -0.2 ? -0.2 : d[i];
        psi[i] += di;
        if (Math.abs(di) > m) m = Math.abs(di);
      }
      if (m < 1e-10) return psi;
    }
    throw new Error(`Poisson não convergiu para Q = ${Q_si.toExponential(3)} C/m²`);
  }

  curvatura(Q_si: number): number {
    return this.resolver(Q_si)[0] - this.psi0[0];
  }

  /** phi_s(Q) numa grade de Q, continuando o chute de Newton a partir de Q = 0. */
  tabela(Q_max: number, n = 81): { Q: Vetor; phi: Vetor; psis: Vetor[] } {
    const Qs = linspace(-Q_max, Q_max, n);
    const phis = new Float64Array(n);
    const psis: Vetor[] = new Array(n);
    const meio = Math.floor(n / 2);
    let psi: Vetor = this.psi0;
    for (let i = meio; i < n; i++) {
      psi = this.resolver(Qs[i], psi);
      phis[i] = psi[0] - this.psi0[0];
      psis[i] = psi;
    }
    psi = this.psi0;
    for (let i = meio; i >= 0; i--) {
      psi = this.resolver(Qs[i], psi);
      phis[i] = psi[0] - this.psi0[0];
      psis[i] = psi;
    }
    return { Q: Qs, phi: phis, psis };
  }

  /** Concentração de elétrons (m^-3) ao longo de x para um potencial. */
  eletronsAoLongo(psi: VetorLeitura): Vetor {
    return Float64Array.from(psi as ArrayLike<number>, (v) => this.n(v));
  }
}

/** Aproximação de depleção, C = eps/W com W = sqrt(2 eps psi / q N) (F/m²). */
export function capacitanciaDeplecao(p: Parametros, N_cm3: number, psi_V: number): number {
  const eps = p.valor("eletrico.materiais.eps_r_Si") * eps0;
  const W = Math.sqrt((2 * eps * psi_V) / (q * N_cm3 * 1e6));
  return eps / W;
}
