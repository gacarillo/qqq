/**
 * Módulo 4, elétrico: C-V da porta, transferência, limites do óxido e as curvas que a
 * visualização usa (bandas, potencial químico, curvatura). Porte de eletrico/modulo.py
 * mais o que animacao/exportar_dados.py calculava.
 */
import type { Parametros } from "@/parametros/parametros";
import { q } from "@/nucleo/constantes";
import { brent, linspace, type Vetor, type VetorLeitura } from "@/nucleo/numerico";
import * as si from "../recozimento/silicio";
import { Pilha, pilhaDeParams, resistenciaKim } from "./grafeno";
import { campoOxido, faixaRuptura } from "./oxido";
import { SiPorta } from "./poisson";

/** N_D do substrato a partir da resistividade, invertendo Masetti para P [I]. */
export function dopagemDeResistividade(p: Parametros, rho_ohm_cm: number): number {
  const ms = si.lerMasetti(p);
  const g = (logN: number) => 1 / (q * si.mobilidadeMasetti(ms, 10 ** logN) * 10 ** logN) - rho_ohm_cm;
  return 10 ** brent(g, 12, 21.5);
}

/** V_D tal que n(V_G = 0) = n_dop (elétrons positivos), em cm^-2. */
export function tensaoDirac(pilha: Pilha, nDop_cm2: number): number {
  const v0 = pilha.V_D;
  pilha.V_D = 0;
  const vd = -pilha.tensao(nDop_cm2 * 1e4);
  pilha.V_D = v0;
  return vd;
}

export interface OpcoesEletrico {
  rhoSubstrato_ohm_cm?: number | null;
  nDop_cm2?: number;
  Q_f_cm2?: number;
  nEstrela_cm2?: number;
  muGrafeno_cm2Vs?: number;
  eps_r_ox?: number;
  V?: VetorLeitura;
  /** amplitude da varredura em torno de V_D quando V não é dado (V) */
  amplitude_V?: number;
  nPontos?: number;
  Q_max?: number;
  D_it_cm2_eV?: number;
}

export interface ResultadoEletrico {
  V: Vetor;
  n_cm2: Vetor;
  C_F_cm2: Vetor;
  C_metal_F_cm2: Vetor;
  C_ox_F_cm2: number;
  E_ox_MVcm: Vetor;
  V_ruptura: [number, number];
  R_quadrado_ohm: Vetor;
  espessura_nm: number;
  V_D: number;
  /** curvatura das bandas no Si (V) e potencial químico do grafeno (eV) em cada V */
  phi_V: Vetor;
  mu_eV: Vetor;
  perdaSi: Vetor;
  /** perfis de potencial no Si para o diagrama de bandas */
  bandas: { V: Vetor; x_nm: Vetor; psi: Vetor[]; n_m3: Vetor[] };
  eta_superficie: number;
  fundo_cm3: number;
  notas: string[];
}

export function simularEletrico(p: Parametros, x_nm: VetorLeitura, ativo_cm3: VetorLeitura, espessura_nm: number, o: OpcoesEletrico = {}): { resultado: ResultadoEletrico; pilha: Pilha; metal: Pilha; si: SiPorta } {
  const notas: string[] = [];
  let fundo = 0;
  if (o.rhoSubstrato_ohm_cm !== undefined && o.rhoSubstrato_ohm_cm !== null) {
    fundo = dopagemDeResistividade(p, o.rhoSubstrato_ohm_cm);
    notas.push(`substrato de ${o.rhoSubstrato_ohm_cm} Ω·cm dá ${fundo.toExponential(2)} cm⁻³ (Masetti para P, [I])`);
  }
  const sp = new SiPorta(p, x_nm, ativo_cm3, fundo);
  const { pilha } = pilhaDeParams(p, espessura_nm, sp, { Q_f_cm2: o.Q_f_cm2, nEstrela_cm2: o.nEstrela_cm2, eps_r_ox: o.eps_r_ox, Q_max: o.Q_max, D_it_cm2_eV: o.D_it_cm2_eV });
  const nDop = o.nDop_cm2 ?? 0;
  pilha.V_D = tensaoDirac(pilha, nDop);
  const metal = new Pilha({ C_ox: pilha.C_ox, vF: pilha.vF, nEstrela: pilha.nEstrela });
  metal.V_D = tensaoDirac(metal, nDop);
  const epsOx = pilha.C_ox * espessura_nm * 1e-9;
  const amp = o.amplitude_V ?? 8;
  const V = o.V ? Float64Array.from(o.V as ArrayLike<number>) : linspace(pilha.V_D - amp, pilha.V_D + amp, o.nPontos ?? 81);
  const n = pilha.densidades(V);
  const C = Float64Array.from(V, (v) => pilha.capacitancia(v));
  const Cm = Float64Array.from(V, (v) => metal.capacitancia(v - pilha.V_D + metal.V_D));
  const E = Float64Array.from(n, (nn) => campoOxido(nn, epsOx) / 1e8);
  const rup = faixaRuptura(p);
  const Vr: [number, number] = [(rup.adams_MVcm[0] * 1e8 * epsOx) / pilha.C_ox, (rup.adams_MVcm[1] * 1e8 * epsOx) / pilha.C_ox];
  const mu = o.muGrafeno_cm2Vs ?? p.valor("eletrico.grafeno.kim_ajuste.mu");
  if (o.muGrafeno_cm2Vs === undefined) notas.push("mobilidade do grafeno de R34 (esfoliado); o CVD do usuário deve ficar abaixo (R33)");
  const n0 = (o.nEstrela_cm2 ?? p.valor("eletrico.grafeno.n_residual.ju_lee")) * 1e4;
  const Rsq = Float64Array.from(n, (nn) => resistenciaKim(nn, mu * 1e-4, n0, 1));
  const phi = Float64Array.from(n, (nn) => pilha.phiS(q * nn - pilha.Q_f) - pilha.phiS(-pilha.Q_f));
  const muE = Float64Array.from(n, (nn) => pilha.mu(nn) / q);
  const perda = Float64Array.from(C, (c, i) => 1 - c / Cm[i]);
  // bandas para 13 tensões, como no exportador
  const Vb = linspace(pilha.V_D - 12, pilha.V_D + 12, 13);
  const sel: number[] = [];
  const xs = Float64Array.from(sp.x, (v) => v * 1e9);
  for (const alvo of [...linspace(0, 10, 41), ...linspace(10.5, 60, 40)]) {
    let k = 0;
    while (k < xs.length - 1 && xs[k] < alvo) k++;
    if (!sel.includes(k)) sel.push(k);
  }
  const psis: Vetor[] = [];
  const nss: Vetor[] = [];
  for (const v of Vb) {
    const nn = pilha.densidade(v);
    const psi = sp.resolver(q * nn, sp.psi0);
    psis.push(Float64Array.from(sel, (k) => psi[k] - sp.psi0[k]));
    nss.push(Float64Array.from(sel, (k) => sp.n(psi[k])));
  }
  return {
    resultado: {
      V, n_cm2: Float64Array.from(n, (v) => v / 1e4), C_F_cm2: Float64Array.from(C, (v) => v * 1e-4), C_metal_F_cm2: Float64Array.from(Cm, (v) => v * 1e-4),
      C_ox_F_cm2: pilha.C_ox * 1e-4, E_ox_MVcm: E, V_ruptura: Vr, R_quadrado_ohm: Rsq, espessura_nm, V_D: pilha.V_D,
      phi_V: phi, mu_eV: muE, perdaSi: perda,
      bandas: { V: Vb, x_nm: Float64Array.from(sel, (k) => xs[k]), psi: psis, n_m3: nss },
      eta_superficie: sp.psi0[0] / sp.Vt, fundo_cm3: fundo, notas,
    },
    pilha, metal, si: sp,
  };
}
