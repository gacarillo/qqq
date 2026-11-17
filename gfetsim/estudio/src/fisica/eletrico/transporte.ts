/**
 * Modelo rápido do transistor em operação, a partir da eletrostática já resolvida
 * (n em função de V_G - V_D do Poisson com Fermi-Dirac).
 *
 * Corrente de Jiménez (R42) com resistência de contato resolvida por ponto fixo:
 *   I/W = q mu int rho dV / (L + mu |int dV / v_sat|),  v_sat = Omega / sqrt(pi rho)
 *   V_DS,canal = V_DS - 2 I R_c
 * rho = |n| + rho0, com rho0 das poças (R34) [C]. Daí saem transferência, saída, g_m,
 * g_ds, f_T intrínseca = g_m / (2 pi C L) e ganho intrínseco g_m / g_ds.
 */
import { hbar, q } from "@/nucleo/constantes";
import { interp, inverso, type Vetor, type VetorLeitura } from "./util";

export interface ParametrosCanal {
  mu_m2Vs: number;
  rho0_m2: number;
  RcW_ohm_m: number; // por largura
  hbarOmega_eV: number;
  L_m: number;
  vsat: boolean;
}

export class Canal {
  /** V relativo (V_G - V_D) e n (m^-2), e capacitância total (F/m²) */
  constructor(readonly V: Vetor, readonly n: Vetor, readonly C: Vetor) {}

  nDe(Vrel: number): number {
    return interp(Vrel, this.V, this.n);
  }

  CDe(Vrel: number): number {
    return interp(Vrel, this.V, this.C);
  }

  /** V_G - V_D que dá a densidade n (m^-2). */
  VrelDe(n_m2: number): number {
    return inverso(this.V, this.n, n_m2);
  }

  /** I/W (A/m) e V_DS no canal para V_G e V_D (tensão de Dirac efetiva). */
  corrente(VG: number, VD: number, VDS: number, c: ParametrosCanal): { I: number; Vint: number } {
    const Om = (c.hbarOmega_eV * q) / hbar;
    let Vi = VDS;
    let I = 0;
    const N = 24;
    for (let it = 0; it < 16; it++) {
      let s1 = 0;
      let s2 = 0;
      for (let k = 0; k <= N; k++) {
        const Vc = (Vi * k) / N;
        const w = k === 0 || k === N ? 0.5 : 1;
        const rho = Math.abs(this.nDe(VG - VD - Vc)) + c.rho0_m2;
        s1 += w * rho;
        if (c.vsat) s2 += (w * Math.sqrt(Math.PI * rho)) / Om;
      }
      s1 *= Vi / N;
      s2 *= Vi / N;
      const In = (q * c.mu_m2Vs * s1) / (c.L_m + c.mu_m2Vs * Math.abs(s2));
      I = it === 0 ? In : 0.5 * I + 0.5 * In;
      Vi = Math.max(1e-5, VDS - 2 * I * c.RcW_ohm_m);
    }
    return { I, Vint: Vi };
  }

  transferencia(VGs: VetorLeitura, VD: number, VDS: number, c: ParametrosCanal): Vetor {
    return Float64Array.from(VGs as ArrayLike<number>, (vg) => this.corrente(vg, VD, VDS, c).I);
  }

  saida(VGmenosVD: number, VD: number, VDSs: VetorLeitura, c: ParametrosCanal): Vetor {
    return Float64Array.from(VDSs as ArrayLike<number>, (vds) => this.corrente(VD + VGmenosVD, VD, vds, c).I);
  }

  /** g_m, g_ds (S/m), f_T intrínseca (Hz) e ganho, por diferenças centradas. */
  pequenosSinais(VG: number, VD: number, VDS: number, c: ParametrosCanal): { gm: number; gds: number; fT: number; ganho: number; C: number } {
    const dV = 0.01;
    const gm = (this.corrente(VG + dV, VD, VDS, c).I - this.corrente(VG - dV, VD, VDS, c).I) / (2 * dV);
    const d2 = Math.max(1e-4, 0.02 * VDS);
    const gds = (this.corrente(VG, VD, VDS + d2, c).I - this.corrente(VG, VD, Math.max(1e-5, VDS - d2), c).I) / (VDS + d2 - Math.max(1e-5, VDS - d2));
    const C = this.CDe(VG - VD);
    return { gm, gds, fT: Math.abs(gm) / (2 * Math.PI * C * c.L_m), ganho: Math.abs(gm) / Math.max(Math.abs(gds), 1e-12), C };
  }
}

/** Partição de elétrons e lacunas pelas poças de carga [C], com n_e - n_h = n e n_e n_h = n*² / 4. */
export function eletronsELacunas(n_m2: number, nEstrela_m2: number): { ne: number; nh: number } {
  const raiz = Math.sqrt(n_m2 * n_m2 + nEstrela_m2 * nEstrela_m2);
  return { ne: (n_m2 + raiz) / 2, nh: (-n_m2 + raiz) / 2 };
}

/** Velocidade média de deriva (m/s) a partir da corrente e da densidade. */
export function velocidadeDeriva(I_A_m: number, n_m2: number, rho0_m2: number): number {
  return I_A_m / (q * (Math.abs(n_m2) + rho0_m2));
}
