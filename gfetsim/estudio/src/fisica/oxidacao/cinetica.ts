/**
 * Cinética de oxidação seca de Si(100), porte de gfetsim/oxidacao/cinetica.py.
 * Deal e Grove (R25, via S1), regime fino de Massoud (R26 a R28, via S1) e aceleração por
 * dopagem de Ho e Plummer (R29, via S2). Unidades internas nm e min.
 */
import type { Parametros } from "@/parametros/parametros";
import { ParametroAusente } from "@/parametros/parametros";
import { kB_eV } from "@/nucleo/constantes";
import { dopri5, type VetorLeitura } from "@/nucleo/numerico";
import { coeficientesFT, difusividadeFT } from "../recozimento/difusao";
import * as si from "../recozimento/silicio";

const kT = (T_C: number) => kB_eV * (T_C + 273.15);

/** B (nm²/min) e B/A (nm/min) para Si(100) seco, tabela 2.2 de S1. */
export function dealGrove100(p: Parametros, T_C: number): { B: number; BA: number } {
  const b = "oxidacao.deal_grove.";
  const k = kT(T_C);
  const B = ((p.valor(b + "B_seco.C") * Math.exp(-p.valor(b + "B_seco.Ea") / k)) * 1e6) / 60;
  const BA111 = ((p.valor(b + "B_sobre_A_seco_111.C") * Math.exp(-p.valor(b + "B_sobre_A_seco_111.Ea") / k)) * 1e3) / 60;
  return { B, BA: BA111 / p.valor(b + "razao_111_100") };
}

export interface ConstantesMassoud {
  B: number;
  BA: number;
  K1: number;
  K2: number;
  tau1: number;
  tau2: number;
}

/** Constantes de Massoud para Si(100), T < 1000 °C (tabelas 2.3 e 2.4 de S1). */
export function massoud100(p: Parametros, T_C: number): ConstantesMassoud {
  const b = "oxidacao.massoud_regime_fino.Si100_T_menor_1000C.";
  const k = kT(T_C);
  const v = (c: string) => p.valor(b + c);
  const sinal = p.texto("oxidacao.massoud_regime_fino.sinal_tau") === "+" ? 1 : -1;
  return {
    B: v("C_B") * Math.exp(-v("E_B") / k),
    BA: v("C_BA") * Math.exp(-v("E_BA") / k),
    K1: v("K1_0") * Math.exp(-v("E_K1") / k),
    K2: v("K2_0") * Math.exp(-v("E_K2") / k),
    tau1: v("tau1_0") * Math.exp((sinal * v("E_tau1")) / k),
    tau2: v("tau2_0") * Math.exp((sinal * v("E_tau2")) / k),
  };
}

/** F = (B/A)/(B/A)i = 1 + gamma (CV/CVi - 1) (S2). Razões de vacâncias provisórias [I]. */
export function fatorHoPlummer(p: Parametros, T_C: number, nSuperficie: number): number {
  const chave = "oxidacao.oxidacao_acelerada_dopagem.ho_plummer.razoes_vacancias_intrinsecas";
  const no = p.metadados(chave);
  if (!p.aceitarProvisorios && (no.valor === null || no.valor === undefined)) throw new ParametroAusente(chave, "o provisório usa as razões D-/D0 e D=/D0 de Fair e Tsai");
  p.usos.set(chave, { chave, valor: "razões D-/D0 e D=/D0 de Fair e Tsai", etiqueta: "I", origem: "provisorio" });
  const hp = "oxidacao.oxidacao_acelerada_dopagem.ho_plummer.";
  const gamma = p.valor(hp + "gamma0") * Math.exp(-p.valor(hp + "gammaE") / kT(T_C));
  const ni_ = si.ni(p, T_C);
  const ft = coeficientesFT(p, T_C);
  const D0 = difusividadeFT(ft, 0);
  const r1 = (difusividadeFT(ft, 1) - D0) / D0;
  const d2 = (difusividadeFT(ft, 2) - D0) / D0;
  const rmm = (d2 - 2 * r1) / 2;
  const rm = r1 - rmm;
  const u = nSuperficie / ni_;
  const cv = (1 + rm * u + rmm * u * u) / (1 + rm + rmm);
  return 1 + gamma * (cv - 1);
}

export type ModeloCinetica = "massoud" | "deal_grove";

/** Avaliador de dx/dt (nm/min) com as constantes da temperatura já calculadas. */
export function criarTaxa(p: Parametros, T_C: number, modelo: ModeloCinetica = "massoud"): (x_nm: number, t_min: number, F: number) => number {
  if (modelo === "deal_grove") {
    const { B, BA } = dealGrove100(p, T_C);
    return (x, _t, F) => B / (2 * x + B / (F * BA));
  }
  const m = massoud100(p, T_C);
  return (x, t, F) => {
    const A = m.B / (F * m.BA);
    const num = m.B + m.K1 * Math.exp(-t / m.tau1) + m.K2 * Math.exp(-t / m.tau2);
    return num / (2 * x + A);
  };
}

/** dx/dt em nm/min. F multiplica só B/A (R23: B não muda com a dopagem). */
export function taxa(p: Parametros, T_C: number, x_nm: number, t_min: number, modelo: ModeloCinetica = "massoud", F = 1): number {
  return criarTaxa(p, T_C, modelo)(x_nm, t_min, F);
}

/** Espessura nos tempos pedidos com F constante (solve_ivp no Python, Dormand e Prince aqui). */
export function espessura(p: Parametros, T_C: number, t_min: VetorLeitura, x0 = 0, modelo: ModeloCinetica = "massoud", F = 1): Float64Array {
  const f = criarTaxa(p, T_C, modelo);
  const tMax = Math.max(...Array.from(t_min));
  const r = dopri5((t, y) => [f(y[0], t, F)], 0, [x0], tMax, { tAvaliar: t_min, rtol: 1e-8, atol: 1e-6, hInicial: 1e-9 });
  return Float64Array.from(r.y, (v) => v[0]);
}

export function tempoPara(p: Parametros, T_C: number, alvo_nm: number, x0 = 0, modelo: ModeloCinetica = "massoud", F = 1, tMax = 6000): number {
  const f = criarTaxa(p, T_C, modelo);
  const r = dopri5((t, y) => [f(y[0], t, F)], 0, [x0], tMax, { rtol: 1e-8, atol: 1e-6, evento: (_t, y) => y[0] - alvo_nm, hInicial: 1e-9 });
  return r.tEvento ?? Infinity;
}
