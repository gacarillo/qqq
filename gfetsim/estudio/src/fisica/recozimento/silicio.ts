/** Propriedades do Si no recozimento e na resistência de folha (porte de recozimento/silicio.py). */
import type { Parametros } from "@/parametros/parametros";
import { kB_eV, q } from "@/nucleo/constantes";
import { trapz, type VetorLeitura } from "@/nucleo/numerico";

/** ni(T) = A T^1,5 exp(-Eg/2kT), provisório [I]. */
export function ni(p: Parametros, T_C: number): number {
  const T = T_C + 273.15;
  const A = p.valor("recozimento.silicio.ni_T.A");
  const Eg = p.valor("recozimento.silicio.ni_T.Eg_eff");
  return A * T ** 1.5 * Math.exp(-Eg / (2 * kB_eV * T));
}

/** Neutralidade de carga com doadores totalmente ionizados. */
export function eletrons(Nd: number, ni_: number): number {
  return 0.5 * Nd + Math.sqrt(0.25 * Nd * Nd + ni_ * ni_);
}

/** Concentração ativa em equilíbrio com o precipitado SiP (N24). */
export function n_e(p: Parametros, T_C: number): number {
  return p.valor("recozimento.solubilidade_P.A_ne") * Math.exp(-p.valor("recozimento.solubilidade_P.Ea_ne") / (kB_eV * (T_C + 273.15)));
}

/** P total em equilíbrio com o SiP (N24). */
export function C_sat(p: Parametros, T_C: number): number {
  return p.valor("recozimento.solubilidade_P.A_sat") * Math.exp(-p.valor("recozimento.solubilidade_P.Ea_sat") / (kB_eV * (T_C + 273.15)));
}

export interface ParametrosMasetti {
  mu_min1: number;
  mu_min2: number;
  mu1: number;
  mu_max: number;
  Cr: number;
  Cs: number;
  alpha: number;
  beta: number;
  Pc: number;
}

export function lerMasetti(p: Parametros): ParametrosMasetti {
  const b = "recozimento.mobilidade_si.masetti_eletrons_P.";
  const k = ["mu_min1", "mu_min2", "mu1", "mu_max", "Cr", "Cs", "alpha", "beta", "Pc"] as const;
  return Object.fromEntries(k.map((c) => [c, p.valor(b + c)])) as unknown as ParametrosMasetti;
}

/** Mobilidade de elétrons em Si:P a 300 K (Masetti, R22; parâmetros [I]). */
export function mobilidadeMasetti(v: ParametrosMasetti, N: number): number {
  N = Math.max(N, 1);
  const pc = v.Pc > 0 ? Math.exp(-v.Pc / N) : 1;
  return v.mu_min1 * pc + (v.mu_max - v.mu_min2) / (1 + (N / v.Cr) ** v.alpha) - v.mu1 / (1 + (v.Cs / N) ** v.beta);
}

export type RamoMobilidade = "masetti" | "limite_inferior_qin";

export function mobilidade(p: Parametros, N: number, ramo: RamoMobilidade = "masetti", ms?: ParametrosMasetti): number {
  let mu = mobilidadeMasetti(ms ?? lerMasetti(p), N);
  if (ramo === "limite_inferior_qin") {
    const lim = p.valor("recozimento.mobilidade_si.qin_limite_inferior.mu_acima_1e21");
    const acima = p.valor("recozimento.mobilidade_si.qin_limite_inferior.abaixo_dos_modelos_acima_de");
    if (N > acima) {
      const f = Math.min(1, Math.max(0, Math.log10(Math.max(N, 1) / acima)));
      mu = (1 - f) * mu + f * Math.min(mu, lim);
    }
  }
  return mu;
}

/** Rs em ohm/quadrado da camada n+ (ionização completa, R35). */
export function resistenciaFolha(p: Parametros, x_nm: VetorLeitura, ativo: VetorLeitura, ramo: RamoMobilidade = "masetti", fundo = 0): number {
  const ms = lerMasetti(p);
  const sigma = new Float64Array(x_nm.length);
  const xc = new Float64Array(x_nm.length);
  for (let i = 0; i < x_nm.length; i++) {
    sigma[i] = q * mobilidade(p, ativo[i] + fundo, ramo, ms) * ativo[i];
    xc[i] = x_nm[i] * 1e-7;
  }
  return 1 / trapz(sigma, xc);
}
