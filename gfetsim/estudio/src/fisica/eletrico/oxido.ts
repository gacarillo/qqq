/** Limites do óxido de porta: ruptura (B1, B2) e Fowler-Nordheim (R45, R46). Porte de eletrico/oxido.py. */
import type { Parametros } from "@/parametros/parametros";
import { h, m0, q } from "@/nucleo/constantes";

/** Campo no óxido (V/m) a partir da carga do grafeno. */
export function campoOxido(n_m2: number, eps_ox: number): number {
  return Math.abs(q * n_m2) / eps_ox;
}

export interface FaixaRuptura {
  adams_MVcm: [number, number];
  oshea_MVcm: [number, number]; // valor, sigma
}

export function faixaRuptura(p: Parametros): FaixaRuptura {
  const a = p.metadados("eletrico.oxido.ruptura.adams").faixa!;
  const o = p.metadados("eletrico.oxido.ruptura.oshea");
  return { adams_MVcm: [a.min, a.max], oshea_MVcm: [o.valor as number, (o.incerteza as { sigma: number }).sigma] };
}

export interface ParametrosFN {
  mrel: number;
  barreira_eV: number;
  reducao: number;
}

export type RamoFN = "williams" | "fukuda";

/**
 * Par barreira e massa de cada ramo. williams usa a barreira de L9 menos o gap de L7 com a
 * massa de R45; fukuda usa o par de L11. Cada par vem de uma fonte e eles não se misturam.
 */
export function barreiraEMassa(p: Parametros, ramo: RamoFN = "williams"): [number, number] {
  const r = "eletrico.oxido.fowler_nordheim.";
  if (ramo === "williams") return [p.valor(r + "barreira_Si_SiO2"), p.valor(r + "massa_efetiva_rel")];
  if (ramo === "fukuda") return [p.valor(r + "ramo_fukuda.barreira_Si_SiO2"), p.valor(r + "ramo_fukuda.massa_efetiva_rel")];
  throw new Error(`ramo de Fowler-Nordheim desconhecido: ${String(ramo)}`);
}

export function parametrosFN(p: Parametros, barreira_eV?: number, fatorReducao?: number, ramo: RamoFN = "williams"): ParametrosFN {
  const [phiRamo, mrel] = barreiraEMassa(p, ramo);
  const phi = barreira_eV ?? phiRamo;
  let red = fatorReducao;
  if (red === undefined) {
    const f = p.metadados("eletrico.oxido.fowler_nordheim.corrente_medida_abaixo_teoria").faixa!;
    red = Math.sqrt(f.min * f.max);
  }
  return { mrel, barreira_eV: phi, reducao: red };
}

/** J = A E² exp(-B/E) (A/m²), prefator teórico dividido pelo fator medido (R45). */
export function correnteFN(f: ParametrosFN, E_V_m: number): number {
  const A = (q ** 3 / (8 * Math.PI * h * f.barreira_eV * q)) * (1 / f.mrel);
  const B = (8 * Math.PI * Math.sqrt(2 * f.mrel * m0) * (f.barreira_eV * q) ** 1.5) / (3 * q * h);
  const E = Math.max(Math.abs(E_V_m), 1);
  return (A * E * E * Math.exp(-B / E)) / f.reducao;
}

/** Distância de tunelamento (nm): onde a barreira triangular cai ao nível do emissor. */
export function distanciaTunelamento(barreira_eV: number, E_V_m: number): number {
  return E_V_m > 0 ? (barreira_eV / E_V_m) * 1e9 : Infinity;
}
