/**
 * Constantes físicas pelo CODATA 2022, os mesmos valores do scipy.constants 1.18 que o
 * gfetsim usa em Python. Etiqueta [P]. O params.yaml diz CODATA 2018; q, k_B e h são
 * exatos nas duas edições, e eps0 e m0 mudam menos de 1e-9 relativo (ver pendencias.md).
 */
export const q = 1.602176634e-19; // C
export const kB = 1.380649e-23; // J/K
export const kB_eV = kB / q; // eV/K
export const eps0 = 8.8541878188e-12; // F/m
export const h = 6.62607015e-34; // J s
export const hbar = h / (2 * Math.PI); // J s
export const m0 = 9.1093837139e-31; // kg

export const NM_PARA_CM = 1e-7;
export const CM_PARA_NM = 1e7;
export const T_AMBIENTE_K = 300;

/** kT em eV para temperatura em graus Celsius. */
export function kT_eV(T_C: number): number {
  return kB_eV * (T_C + 273.15);
}
