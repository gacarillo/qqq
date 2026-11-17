/**
 * Módulo 2, recozimento: SPE a 550 °C, depois RTA ou forno (porte de recozimento/modulo.py).
 *
 * Ramos de desativação
 *   equilibrio   ao fim de cada etapa a 700 °C ou mais o ativo cai para min(C, n_e(T)) (N24, R12)
 *   metaestavel  o ativo da SPE é mantido nas etapas rápidas (RTA); só o forno leva ao equilíbrio (lado de R18)
 */
import type { Parametros } from "@/parametros/parametros";
import { kB_eV } from "@/nucleo/constantes";
import { arange, interpVetor, trapz, type Vetor } from "@/nucleo/numerico";
import * as difusao from "./difusao";
import * as si from "./silicio";
import type { ResultadoImplante } from "../implante/implante";

export interface Etapa {
  nome: string;
  T_C: number;
  t_s: number;
  ambiente?: string;
  rapida?: boolean;
}

export interface EstadoDopante {
  x_nm: Vetor;
  C: Vetor;
  ativo: Vetor;
  amorfo_nm: [number, number] | null;
  historico: string[];
}

export interface QuadroRecozimento {
  etapa: string;
  t_s: number;
  T_C: number;
  frenteAmorfa_nm: number | null;
  C: Vetor;
  ativo: Vetor;
}

export type RamoDesativacao = "equilibrio" | "metaestavel";
export type VarianteRecozimento = "A_rta" | "B_forno";

export function copiarEstado(e: EstadoDopante): EstadoDopante {
  return { x_nm: e.x_nm, C: Float64Array.from(e.C), ativo: Float64Array.from(e.ativo), amorfo_nm: e.amorfo_nm ? [...e.amorfo_nm] : null, historico: [...e.historico] };
}

export function doseDe(x_nm: ArrayLike<number>, C: ArrayLike<number>): number {
  return trapz(C, Float64Array.from(x_nm as ArrayLike<number>, (v) => v * 1e-7));
}

export function fracaoAtiva(e: EstadoDopante): number {
  return doseDe(e.x_nm, e.ativo) / doseDe(e.x_nm, e.C);
}

/** Estende o perfil implantado até a profundidade de simulação; nada está ativo. */
export function estadoInicial(perfil: Pick<ResultadoImplante, "x_nm" | "C_cm3" | "amorfo_nm">, profundidade_nm = 600): EstadoDopante {
  const dx = perfil.x_nm[1] - perfil.x_nm[0];
  const x = arange(perfil.x_nm[0], profundidade_nm, dx);
  const C = interpVetor(x, perfil.x_nm, perfil.C_cm3, undefined, 0);
  return { x_nm: x, C, ativo: new Float64Array(C.length), amorfo_nm: perfil.amorfo_nm ? [...perfil.amorfo_nm] : null, historico: ["implantado"] };
}

/** Velocidade de recrescimento em cm/s (prefator [I], Ea de N9). */
export function velocidadeSPE(p: Parametros, T_C: number): number {
  const v0 = p.valor("recozimento.spe_550C.prefator_velocidade");
  const Ea = p.valor("recozimento.spe_550C.Ea_velocidade_spe");
  const f = p.valor("recozimento.spe_550C.fator_aceleracao_P");
  return f * v0 * Math.exp(-Ea / (kB_eV * (T_C + 273.15)));
}

export interface OpcoesAplicar {
  ramo?: RamoDesativacao;
  fluxo?: difusao.FluxoSuperficie;
  /** número de quadros guardados ao longo da etapa (0 não guarda) */
  quadros?: number;
}

export function aplicar(p: Parametros, estado: EstadoDopante, etapa: Etapa, o: OpcoesAplicar = {}): { estado: EstadoDopante; quadros: QuadroRecozimento[] } {
  const ramo = o.ramo ?? "equilibrio";
  const e = copiarEstado(estado);
  const quadros: QuadroRecozimento[] = [];
  const nq = o.quadros ?? 0;
  // 1. recrescimento epitaxial da camada amorfa
  if (e.amorfo_nm) {
    const espessura = (e.amorfo_nm[1] - Math.min(e.amorfo_nm[0], 0)) * 1e-7;
    const v = velocidadeSPE(p, etapa.T_C);
    const tSpe = espessura / v;
    if (nq > 0) {
      const fim = e.amorfo_nm[1];
      for (let k = 0; k <= nq; k++) {
        const t = (k / nq) * Math.min(1.05 * tSpe, etapa.t_s);
        const frente = fim - v * 1e7 * t;
        const ativo = new Float64Array(e.C.length);
        for (let i = 0; i < e.C.length; i++) if (e.x_nm[i] <= fim && e.x_nm[i] > frente) ativo[i] = e.C[i];
        quadros.push({ etapa: etapa.nome, t_s: t, T_C: etapa.T_C, frenteAmorfa_nm: frente > Math.min(e.amorfo_nm[0], 0) ? frente : null, C: Float64Array.from(e.C), ativo });
      }
    }
    if (tSpe <= etapa.t_s) {
      for (let i = 0; i < e.x_nm.length; i++) if (e.x_nm[i] <= e.amorfo_nm[1]) e.ativo[i] = e.C[i]; // incorporação substitucional [I], R14
      e.historico.push(`${etapa.nome}, SPE completa em ${tSpe.toFixed(0)} s`);
      e.amorfo_nm = null;
    } else {
      e.historico.push(`${etapa.nome}, SPE incompleta (${etapa.t_s.toFixed(0)} s de ${tSpe.toFixed(0)} s)`);
    }
  }
  // 2. difusão
  if (etapa.T_C >= 700) {
    const fr = new Float64Array(e.C.length);
    for (let i = 0; i < e.C.length; i++) fr[i] = e.ativo[i] / Math.max(e.C[i], 1e-30);
    const nPassos = Math.trunc(Math.min(400, Math.max(50, etapa.t_s / 2)));
    const dts = difusao.passosGeometricos(etapa.t_s, nPassos);
    const marcas = new Set<number>();
    if (nq > 0) {
      let acum = 0;
      const alvos = Array.from({ length: nq }, (_, k) => etapa.t_s * ((k + 1) / nq) ** 2);
      let j = 0;
      for (let k = 0; k < nPassos; k++) {
        acum += dts[k];
        while (j < alvos.length && acum >= alvos[j] - 1e-9) {
          marcas.add(k);
          j++;
        }
      }
    }
    let tAcum = 0;
    const ne = si.n_e(p, etapa.T_C);
    e.C = difusao.difundir(p, e.x_nm, e.C, etapa.T_C, etapa.t_s, nPassos, o.fluxo, (k, C) => {
      tAcum += dts[k];
      if (marcas.has(k)) {
        const a = new Float64Array(C.length);
        for (let i = 0; i < C.length; i++) {
          let v = Math.min(1, Math.max(0, fr[i])) * C[i];
          v = Math.max(v, Math.min(C[i], ne));
          if (ramo === "equilibrio" || !etapa.rapida) v = Math.min(v, ne);
          a[i] = v;
        }
        quadros.push({ etapa: etapa.nome, t_s: tAcum, T_C: etapa.T_C, frenteAmorfa_nm: null, C: Float64Array.from(C), ativo: a });
      }
    });
    for (let i = 0; i < e.C.length; i++) e.ativo[i] = Math.min(1, Math.max(0, fr[i])) * e.C[i];
  }
  // 3. ativação fora da região recrescida e desativação
  if (etapa.T_C >= p.valor("recozimento.desativacao.inicio_P")) {
    const ne = si.n_e(p, etapa.T_C);
    if (etapa.T_C >= 700) for (let i = 0; i < e.C.length; i++) e.ativo[i] = Math.max(e.ativo[i], Math.min(e.C[i], ne)); // dano da cauda recozido [I]
    if (ramo === "equilibrio" || (ramo === "metaestavel" && !etapa.rapida)) {
      if (etapa.t_s >= 1 && etapa.T_C >= 700) for (let i = 0; i < e.C.length; i++) e.ativo[i] = Math.min(e.ativo[i], ne);
      else if (etapa.T_C < 700 && ramo === "equilibrio") e.historico.push(`${etapa.nome}, cinética de desativação abaixo de 700 °C desconhecida (R12b); ativo mantido`);
    }
  }
  e.historico.push(`${etapa.nome}, ${etapa.T_C.toFixed(0)} °C por ${etapa.t_s.toFixed(0)} s, fração ativa ${fracaoAtiva(e).toFixed(3)}`);
  return { estado: e, quadros };
}

export function receitaEtapas(p: Parametros, variante: VarianteRecozimento, T_forno_C?: number, sobrescrever: Partial<{ T_spe: number; t_spe_min: number; T_rta: number; t_rta_s: number; t_forno_min: number }> = {}): Etapa[] {
  const r = "receita.recozimento.";
  const etapas: Etapa[] = [{ nome: "SPE", T_C: sobrescrever.T_spe ?? p.valor(r + "spe.temperatura"), t_s: (sobrescrever.t_spe_min ?? p.valor(r + "spe.tempo")) * 60 }];
  if (variante === "A_rta") {
    etapas.push({ nome: "RTA", T_C: sobrescrever.T_rta ?? p.valor(r + "variante_A_rta.temperatura"), t_s: sobrescrever.t_rta_s ?? p.valor(r + "variante_A_rta.tempo"), rapida: true });
  } else {
    if (T_forno_C === undefined) throw new Error("a variante B exige a temperatura do forno (varredura de 850 a 900 °C)");
    etapas.push({ nome: "forno", T_C: T_forno_C, t_s: (sobrescrever.t_forno_min ?? p.valor(r + "variante_B_forno.tempo")) * 60 });
  }
  return etapas;
}

export interface ResultadoRecozimento {
  estado: EstadoDopante;
  quadros: QuadroRecozimento[];
  etapas: Etapa[];
  Rs_ohm_sq: number;
  n_e: number;
  C_sat: number;
  t_spe_s: number | null;
  v_spe_nm_s: number;
}

export function simularRecozimento(p: Parametros, perfil: Pick<ResultadoImplante, "x_nm" | "C_cm3" | "amorfo_nm">, etapas: Etapa[], ramo: RamoDesativacao = "equilibrio", nQuadros = 0): ResultadoRecozimento {
  let e = estadoInicial(perfil);
  const quadros: QuadroRecozimento[] = [];
  const am = e.amorfo_nm;
  const vSpe = velocidadeSPE(p, etapas[0].T_C);
  for (const et of etapas) {
    const r = aplicar(p, e, et, { ramo, quadros: nQuadros });
    e = r.estado;
    quadros.push(...r.quadros);
  }
  const quente = etapas[etapas.length - 1];
  return {
    estado: e,
    quadros,
    etapas,
    Rs_ohm_sq: si.resistenciaFolha(p, e.x_nm, e.ativo),
    n_e: si.n_e(p, quente.T_C),
    C_sat: si.C_sat(p, quente.T_C),
    t_spe_s: am ? ((am[1] - Math.min(am[0], 0)) * 1e-7) / vSpe : null,
    v_spe_nm_s: vSpe * 1e7,
  };
}
