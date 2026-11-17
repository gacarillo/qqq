/**
 * Módulo 3, oxidação de porta acoplada ao perfil de P (porte de oxidacao/modulo.py).
 *
 * A cada passo: fator F pelo P ativo na interface (ramo), espessura por Runge e Kutta de
 * 2ª ordem, consumo de 0,44 nm de Si por nm de óxido [B] com o P da fatia consumida
 * tratado pelo ramo de interface, difusão de Fair e Tsai e desativação de equilíbrio.
 *
 * Ramos de aceleração: ho_plummer (S2, razões [I]), sem_aceleracao (N10), nomura (F = 2,1, R23).
 * Ramos de interface: acumulo_classico (m >= 1000, R17), lado_oxido (R32, N12), silicio_inativo (R20, N22).
 */
import type { Parametros } from "@/parametros/parametros";
import { interpVetor, trapz, type Vetor } from "@/nucleo/numerico";
import * as difusao from "../recozimento/difusao";
import * as si from "../recozimento/silicio";
import { copiarEstado, type EstadoDopante } from "../recozimento/recozimento";
import * as cin from "./cinetica";

export type RamoAceleracao = "ho_plummer" | "sem_aceleracao" | "nomura";
export type RamoInterface = "acumulo_classico" | "lado_oxido" | "silicio_inativo";

export interface QuadroOxidacao {
  t_min: number;
  x_ox: number;
  si: number;
  F: number;
  C: Vetor;
  ativo: Vetor;
}

export interface ResultadoOxidacao {
  T_C: number;
  t_min: number;
  espessura_nm: number;
  siConsumido_nm: number;
  estado: EstadoDopante;
  doseNoOxido: number;
  historiaT: Vetor;
  historiaX: Vetor;
  historiaF: Vetor;
  ramoAceleracao: RamoAceleracao;
  ramoInterface: RamoInterface;
  quadros: QuadroOxidacao[];
}

export interface OpcoesOxidar {
  x0_nm?: number;
  ramoAceleracao?: RamoAceleracao;
  ramoInterface?: RamoInterface;
  modelo?: cin.ModeloCinetica;
  nPassos?: number;
  espessuraRetrograda_nm?: number;
  larguraCamadaOxido_nm?: number;
  instantes_min?: number[];
  /** fator de calibração na taxa de crescimento inteira, 1 no modelo nominal (previsao.fator_taxa_oxidacao) */
  fatorTaxa?: number;
}

/** Perfil visto de uma interface que avançou d nm para dentro do Si. */
function deslocar(x: Vetor, y: Vetor, d: number): Vetor {
  const xd = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) xd[i] = x[i] + d;
  return interpVetor(xd, x, y, undefined, 0);
}

export function oxidar(p: Parametros, estado: EstadoDopante, T_C: number, t_min: number, o: OpcoesOxidar = {}): ResultadoOxidacao {
  const ramoA = o.ramoAceleracao ?? "ho_plummer";
  const ramoI = o.ramoInterface ?? "acumulo_classico";
  const modelo = o.modelo ?? "massoud";
  const nPassos = o.nPassos ?? 120;
  const e = copiarEstado(estado);
  const x = e.x_nm;
  const dx = x[1] - x[0];
  const consumo = p.valor("receita.oxidacao_porta.consumo_si_por_oxido");
  const Fnom = p.valor("oxidacao.oxidacao_acelerada_dopagem.nomura_fator_max_implantado");
  const capOx = ramoI === "lado_oxido" ? p.valor("oxidacao.segregacao_P.camada_no_oxido") * (o.larguraCamadaOxido_nm ?? 3) * 1e-7 : 0;
  let noOx = 0;
  const ne = si.n_e(p, T_C);
  const ni_ = si.ni(p, T_C);
  const taxaF = cin.criarTaxa(p, T_C, modelo);
  const ft = o.fatorTaxa ?? 1;
  const ctx = difusao.contexto(p, T_C);
  const area = new difusao.AreaDifusao(x.length);
  const passos = difusao.passosGeometricos(t_min, nPassos, 1.04);
  let t = 0;
  let xox = o.x0_nm ?? 0;
  let consumido = 0;
  let resto = 0;
  const hT = [0];
  const hX = [xox];
  const hF: number[] = [];
  const pend = [...(o.instantes_min ?? [])].sort((a, b) => a - b);
  const quadros: QuadroOxidacao[] = [];
  const dtsDif = difusao.passosGeometricos(1, 3); // frações dos 3 subpassos de difusão
  const xc = Float64Array.from(x, (v) => v * 1e-7);
  for (let k = 0; k < nPassos; k++) {
    const dt = passos[k];
    const ns = si.eletrons(Math.min(e.ativo[0], ne), ni_);
    const F = ramoA === "ho_plummer" ? cin.fatorHoPlummer(p, T_C, ns) : ramoA === "nomura" ? Fnom : 1;
    const k1 = ft * taxaF(xox, t, F);
    const k2 = ft * taxaF(xox + 0.5 * dt * k1, t + 0.5 * dt, F);
    const dxox = dt * k2;
    xox += dxox;
    t += dt;
    const dSi = consumo * dxox + resto;
    const nCel = Math.floor(dSi / dx);
    resto = dSi - nCel * dx;
    if (nCel > 0) {
      const d = nCel * dx;
      const Pcons = trapz(e.C.subarray(0, nCel + 1), xc.subarray(0, nCel + 1));
      e.C = deslocar(x, e.C, d);
      e.ativo = deslocar(x, e.ativo, d);
      consumido += d;
      let vaiOx = 0;
      if (ramoI === "lado_oxido") {
        vaiOx = Math.min(Pcons, Math.max(capOx - noOx, 0));
        noOx += vaiOx;
      }
      e.C[0] += (Pcons - vaiOx) / (dx * 1e-7); // m >= 1000 (R17)
    }
    for (let j = 0; j < 3; j++) difusao.passoTemporal(ctx, dx, e.C, dtsDif[j] * dt * 60, e.C, undefined, area);
    for (let i = 0; i < e.C.length; i++) e.ativo[i] = Math.min(e.C[i], ne);
    hT.push(t);
    hX.push(xox);
    hF.push(F);
    while (pend.length && t >= pend[0] - 1e-9) {
      quadros.push({ t_min: t, x_ox: xox, si: consumido, F, C: Float64Array.from(e.C), ativo: Float64Array.from(e.ativo) });
      pend.shift();
    }
  }
  if (ramoI === "silicio_inativo") {
    const fr = p.valor("oxidacao.ramos_interface.lado_do_pileup.silicio_inativo.fracao_ativa");
    const lim = o.espessuraRetrograda_nm ?? 15;
    for (let i = 0; i < x.length; i++) if (x[i] <= lim) e.ativo[i] *= fr;
  }
  e.historico.push(`oxidação a ${T_C.toFixed(0)} °C por ${t_min.toFixed(1)} min, ${xox.toFixed(1)} nm de óxido, ${consumido.toFixed(1)} nm de Si consumidos`);
  return {
    T_C, t_min, espessura_nm: xox, siConsumido_nm: consumido, estado: e, doseNoOxido: noOx,
    historiaT: Float64Array.from(hT), historiaX: Float64Array.from(hX), historiaF: Float64Array.from(hF),
    ramoAceleracao: ramoA, ramoInterface: ramoI, quadros,
  };
}

/** Bissecção no tempo até a espessura alvo, com o acoplamento completo (tempo_para_alvo). */
export function tempoParaAlvo(p: Parametros, estado: EstadoDopante, T_C: number, alvo_nm?: number, o: Omit<OpcoesOxidar, "nPassos"> = {}, tol_nm = 0.2): { t_min: number; resultado: ResultadoOxidacao } {
  const alvo = alvo_nm ?? p.valor("receita.oxidacao_porta.espessura_alvo");
  const ramoA = o.ramoAceleracao ?? "ho_plummer";
  const modelo = o.modelo ?? "massoud";
  let tHi = cin.tempoPara(p, T_C, alvo, o.x0_nm ?? 0, modelo, 1);
  let tLo = cin.tempoPara(p, T_C, alvo, o.x0_nm ?? 0, modelo, ramoA === "ho_plummer" ? 10 : p.valor("oxidacao.oxidacao_acelerada_dopagem.nomura_fator_max_implantado"));
  if (ramoA === "sem_aceleracao") return { t_min: tHi, resultado: oxidar(p, estado, T_C, tHi, o) };
  let tm = 0.5 * (tLo + tHi);
  let res: ResultadoOxidacao | null = null;
  for (let it = 0; it < 25; it++) {
    tm = 0.5 * (tLo + tHi);
    res = oxidar(p, estado, T_C, tm, { ...o, nPassos: 80 });
    if (Math.abs(res.espessura_nm - alvo) < tol_nm) break;
    if (res.espessura_nm > alvo) tHi = tm;
    else tLo = tm;
  }
  return { t_min: tm, resultado: res! };
}
