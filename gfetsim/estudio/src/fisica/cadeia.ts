/**
 * Cadeia completa da receita até o transistor, com cache por etapa: mudar um parâmetro
 * elétrico não refaz o recozimento, e assim por diante. Porte de gfetsim/cadeia.py com
 * a física 2D da borda e as curvas que o estúdio mostra.
 */
import { Parametros } from "@/parametros/parametros";
import { arange, interpVetor, linspace, type Vetor } from "@/nucleo/numerico";
import { eps0, q } from "@/nucleo/constantes";
import { simularImplante, type ResultadoImplante } from "./implante/implante";
import { InterpoladorBCA, type TabelaBCA } from "./implante/tabela";
import { receitaEtapas, simularRecozimento, type Etapa, type ResultadoRecozimento, type EstadoDopante } from "./recozimento/recozimento";
import * as si from "./recozimento/silicio";
import * as borda from "./recozimento/borda2d";
import { oxidar, tempoParaAlvo, type QuadroOxidacao } from "./oxidacao/oxidacao";
import { simularEletrico, dopagemDeResistividade, type ResultadoEletrico } from "./eletrico/eletrico";
import { faixaRuptura, parametrosFN, type ParametrosFN } from "./eletrico/oxido";
import type { Receita } from "./receita";

export interface ResultadoOxidacaoCadeia {
  metodo: "termico" | "sputtering";
  t_min: number | null;
  espessura_nm: number;
  siConsumido_nm: number;
  estado: EstadoDopante;
  quadros: QuadroOxidacao[];
  curva: { t: Vetor; x: Vetor; F: Vetor };
  Rs_ohm_sq: number;
  /** óxido sobre o substrato fora da porta, no mesmo tempo */
  espessuraCampo_nm: number;
  doseNoOxido: number;
}

export interface ResultadoBorda {
  grade: borda.Grade2D;
  ys_nm: number;
  mu_y: Vetor;
  sg_y: Vetor;
  Fn: Vetor;
  implante: borda.Mapa2D;
  amorfo: Uint8Array;
  recozimento: borda.Quadro2D[];
  oxidacao: borda.QuadroOx2D[] | null;
  juncao: { z1e18: Vetor; z1e17: Vetor };
}

export interface ResultadoParasita {
  fundo_cm3: number;
  espessura_nm: number;
  V: Vetor; // relativo à tensão de Dirac
  C_sobre_Cox: Vetor;
}

export interface ResultadoCadeia {
  receita: Receita;
  implante: ResultadoImplante;
  recozimento: ResultadoRecozimento;
  oxidacao: ResultadoOxidacaoCadeia;
  eletrico: ResultadoEletrico;
  canal: { V: Vetor; n: Vetor; C: Vetor }; // n e C em m^-2 e F/m² contra V_G - V_D
  parasita: ResultadoParasita;
  borda: ResultadoBorda | null;
  constantes: { fn: ParametrosFN; ruptura_MVcm: [number, number]; eps_ox: number; nEstrela_m2: number };
  provisorios: string[];
  usos: ReturnType<Parametros["tabelaUsos"]>;
  notas: string[];
  tempos_ms: Record<string, number>;
}

export type Progresso = (etapa: string, fracao: number) => void;

function chave(...partes: unknown[]): string {
  return JSON.stringify(partes);
}

export class Simulador {
  private readonly bca: InterpoladorBCA;
  private cache = new Map<string, unknown>();

  constructor(tabela: TabelaBCA, private readonly dados: Record<string, unknown>) {
    this.bca = new InterpoladorBCA(tabela);
  }

  get interpolador(): InterpoladorBCA {
    return this.bca;
  }

  limparCache(): void {
    this.cache.clear();
  }

  private memo<T>(k: string, f: () => T): T {
    if (this.cache.has(k)) return this.cache.get(k) as T;
    const v = f();
    this.cache.set(k, v);
    if (this.cache.size > 60) this.cache.delete(this.cache.keys().next().value!);
    return v;
  }

  parametros(r: Receita): Parametros {
    return new Parametros(this.dados, r.aceitarProvisorios, r.sobrescrever);
  }

  simular(r: Receita, progresso: Progresso = () => {}): ResultadoCadeia {
    const p = this.parametros(r);
    const tempos: Record<string, number> = {};
    const medir = <T>(nome: string, f: () => T): T => {
      const t0 = performance.now();
      const v = f();
      tempos[nome] = performance.now() - t0;
      return v;
    };
    const kP = chave(r.aceitarProvisorios, r.sobrescrever);
    const ri = r.implante;
    progresso("implantação", 0);
    const imp = medir("implante", () => this.memo(chave("imp", kP, ri), () => simularImplante(p, this.bca, {
      energia_keV: ri.energia_keV, dose_cm2: ri.dose_cm2, inclinacao: ri.inclinacao, oxido_nativo_nm: ri.oxido_nativo_nm,
      dose_limiar_cm2: ri.dose_limiar_cm2, mascara_nm: ri.variante === "A_mascara" ? ri.mascara_nm : 0,
    })));
    progresso("recozimento", 0.1);
    const rr = r.recozimento;
    const etapas = receitaEtapas(p, rr.variante, rr.T_forno_C, { T_spe: rr.T_spe_C, t_spe_min: rr.t_spe_min, T_rta: rr.T_rta_C, t_rta_s: rr.t_rta_s, t_forno_min: rr.t_forno_min });
    const kRec = chave("rec", kP, ri, rr);
    const rec = medir("recozimento", () => this.memo(kRec, () => simularRecozimento(p, imp, etapas, rr.ramoDesativacao, 8)));
    progresso("oxidação", 0.25);
    const ro = r.oxidacao;
    const kOx = chave("ox", kRec, ro, r.eletrico.rho_ohm_cm);
    const ox = medir("oxidacao", () => this.memo(kOx, () => this.oxidacao(p, r, rec)));
    progresso("elétrico", 0.4);
    const re = r.eletrico;
    const kEl = chave("el", kOx, re);
    const el = medir("eletrico", () => this.memo(kEl, () => {
      const ativo = ox.estado.ativo;
      const { resultado, pilha } = simularEletrico(p, ox.estado.x_nm, ativo, ox.espessura_nm, {
        rhoSubstrato_ohm_cm: re.rho_ohm_cm, nDop_cm2: re.sinalDop * re.nDop_cm2, Q_f_cm2: re.Q_f_cm2, nEstrela_cm2: re.nEstrela_cm2,
        D_it_cm2_eV: re.D_it_cm2_eV, amplitude_V: 14, nPontos: 141, Q_max: 0.06,
      });
      const Vr = linspace(-16, 16, 321);
      const n = Float64Array.from(Vr, (v) => pilha.densidade(v + pilha.V_D));
      const C = Float64Array.from(Vr, (v) => pilha.capacitancia(v + pilha.V_D));
      return { resultado, canal: { V: Vr, n, C } };
    }));
    progresso("fora da porta", 0.5);
    const par = medir("parasita", () => this.memo(chave("par", kOx, re.rho_ohm_cm, re.Q_f_cm2, re.nEstrela_cm2), () => this.parasita(p, re.rho_ohm_cm, ox.espessuraCampo_nm, re)));
    let bordaR: ResultadoBorda | null = null;
    if (r.borda.calcular && ri.variante === "A_mascara") {
      bordaR = medir("borda2d", () => this.memo(chave("borda", kOx, ri.ramoSombra), () => this.borda(p, r, imp, etapas, ox, (f) => progresso("borda 2D", 0.55 + 0.45 * f))));
    }
    progresso("pronto", 1);
    const fn = parametrosFN(p);
    const rup = faixaRuptura(p);
    const notas = [...imp.notas, ...rec.estado.historico, ...el.resultado.notas];
    return {
      receita: r, implante: imp, recozimento: rec, oxidacao: ox, eletrico: el.resultado, canal: el.canal, parasita: par, borda: bordaR,
      constantes: { fn, ruptura_MVcm: rup.adams_MVcm, eps_ox: p.valor("eletrico.materiais.eps_r_SiO2") * eps0, nEstrela_m2: re.nEstrela_cm2 * 1e4 },
      provisorios: p.provisoriosUsados, usos: p.tabelaUsos(), notas, tempos_ms: tempos,
    };
  }

  private oxidacao(p: Parametros, r: Receita, rec: ResultadoRecozimento): ResultadoOxidacaoCadeia {
    const ro = r.oxidacao;
    const e = rec.estado;
    const fundo = dopagemDeResistividade(p, r.eletrico.rho_ohm_cm);
    if (ro.metodo === "sputtering") {
      return { metodo: "sputtering", t_min: null, espessura_nm: ro.alvo_nm, siConsumido_nm: 0, estado: e, quadros: [], curva: { t: new Float64Array([0]), x: new Float64Array([ro.alvo_nm]), F: new Float64Array([1]) },
        Rs_ohm_sq: si.resistenciaFolha(p, e.x_nm, e.ativo), espessuraCampo_nm: ro.alvo_nm, doseNoOxido: 0 };
    }
    const opc = { ramoAceleracao: ro.ramoAceleracao, ramoInterface: ro.ramoInterface, modelo: ro.modelo };
    let t: number;
    if (ro.tempoFixo_min !== null) t = ro.tempoFixo_min;
    else t = tempoParaAlvo(p, e, ro.T_C, ro.alvo_nm, opc).t_min;
    const fr = Array.from(linspace(0, 1, 15), (v) => v ** 1.5);
    const res = oxidar(p, e, ro.T_C, t, { ...opc, instantes_min: fr.slice(1).map((f) => f * t * (1 - 1e-9)) });
    const q0: QuadroOxidacao = { t_min: 0, x_ox: 0, si: 0, F: res.historiaF[0] ?? 1, C: Float64Array.from(e.C), ativo: Float64Array.from(e.ativo) };
    // óxido sobre o substrato uniforme, fora da porta, no mesmo tempo
    const xs = arange(0.5, 300, 1);
    const est = { x_nm: xs, C: new Float64Array(xs.length).fill(fundo), ativo: new Float64Array(xs.length).fill(fundo), amorfo_nm: null, historico: [] };
    const campo = oxidar(p, est, ro.T_C, t, { ...opc, nPassos: 60 });
    return {
      metodo: "termico", t_min: t, espessura_nm: res.espessura_nm, siConsumido_nm: res.siConsumido_nm, estado: res.estado,
      quadros: [q0, ...res.quadros], curva: { t: res.historiaT, x: res.historiaX, F: Float64Array.from([res.historiaF[0] ?? 1, ...res.historiaF]) },
      Rs_ohm_sq: si.resistenciaFolha(p, res.estado.x_nm, res.estado.ativo), espessuraCampo_nm: campo.espessura_nm, doseNoOxido: res.doseNoOxido,
    };
  }

  private parasita(p: Parametros, rho: number, esp: number, re: Receita["eletrico"]): ResultadoParasita {
    const Ns = dopagemDeResistividade(p, rho);
    const x = arange(0.5, 400, 1);
    const { resultado } = simularEletrico(p, x, new Float64Array(x.length).fill(Ns), esp, { nDop_cm2: 0, Q_f_cm2: re.Q_f_cm2, nEstrela_cm2: re.nEstrela_cm2, amplitude_V: 14, nPontos: 57, Q_max: 0.05 });
    return { fundo_cm3: Ns, espessura_nm: esp, V: Float64Array.from(resultado.V, (v) => v - resultado.V_D), C_sobre_Cox: Float64Array.from(resultado.C_F_cm2, (c) => c / resultado.C_ox_F_cm2) };
  }

  private borda(p: Parametros, r: Receita, imp: ResultadoImplante, etapas: Etapa[], ox: ResultadoOxidacaoCadeia, prog: (f: number) => void): ResultadoBorda {
    const g: borda.Grade2D = { x: arange(1, 301, 2), y: arange(-300, 400, 4) };
    const lat = imp.lateral;
    const sel: number[] = [];
    // usa só as faixas com dados (desvio maior que o mínimo de 0,5 nm imposto na interpolação)
    for (let i = 0; i < lat.x.length; i++) if (lat.desvio[i] > 0.6 && lat.x[i] < imp.momentos.media + 4 * imp.momentos.desvio) sel.push(i);
    const fx = sel.map((i) => lat.x[i]);
    const { mu, sg } = borda.lateralPorProfundidade(fx, sel.map((i) => lat.media[i]), sel.map((i) => lat.desvio[i]), g.x);
    const px = interpVetor(g.x, imp.x_nm, imp.C_cm3, undefined, 0);
    const Fn = interpVetor(g.x, imp.x_nm, imp.Fn_eV_cm, undefined, 0);
    const ys = r.implante.ramoSombra === "sombra" ? r.implante.mascara_nm * Math.tan((r.implante.inclinacao * Math.PI) / 180) : 0;
    const { C: C0, cobertura } = borda.mapaInicial(g, px, mu, sg, ys);
    const am = borda.amorfo2D(Fn, cobertura, r.implante.dose_cm2, r.implante.dose_limiar_cm2);
    prog(0.05);
    const quadros = borda.recozer2D(p, g, C0, am, [etapas[0], etapas[1]], 8, r.recozimento.ramoDesativacao, (f) => prog(0.05 + 0.55 * f));
    const fim = quadros[quadros.length - 1];
    let oxq: borda.QuadroOx2D[] | null = null;
    if (ox.metodo === "termico" && ox.t_min) {
      oxq = borda.oxidarPorColuna(p, g, fim.C, fim.ativo, r.oxidacao.T_C, ox.t_min, [0.1, 0.25, 0.5, 0.75, 1], r.oxidacao.ramoAceleracao, r.oxidacao.ramoInterface, (f) => prog(0.6 + 0.4 * f));
    }
    const ref = oxq ? oxq[oxq.length - 1].ativo : fim.ativo;
    const z18 = Float64Array.from(g.y, (_, j) => borda.profundidadeNivel(ref, g, j, 1e18));
    const z17 = Float64Array.from(g.y, (_, j) => borda.profundidadeNivel(ref, g, j, 1e17));
    return { grade: g, ys_nm: ys, mu_y: mu, sg_y: sg, Fn, implante: C0, amorfo: am, recozimento: quadros, oxidacao: oxq, juncao: { z1e18: z18, z1e17: z17 } };
  }
}

/** Grandezas derivadas que o relatório e o painel de resumo mostram. */
export function resumo(res: ResultadoCadeia) {
  const el = res.eletrico;
  const i5 = el.n_cm2.reduce((k, v, i, a) => (Math.abs(v - 5e12) < Math.abs(a[k] - 5e12) ? i : k), 0);
  let Cmin = Infinity;
  for (const c of el.C_F_cm2) Cmin = Math.min(Cmin, c);
  return {
    Rp_nm: res.implante.momentos.media,
    dRp_nm: res.implante.momentos.desvio,
    pico_cm3: res.implante.pico_cm3,
    amorfo_nm: res.implante.amorfo_nm ? res.implante.amorfo_nm[1] - res.implante.amorfo_nm[0] : 0,
    fracaoAtiva: res.recozimento.estado.ativo.reduce((s, v) => s + v, 0) / res.recozimento.estado.C.reduce((s, v) => s + v, 0),
    Rs_recozido: res.recozimento.Rs_ohm_sq,
    Rs_final: res.oxidacao.Rs_ohm_sq,
    t_ox_min: res.oxidacao.t_min,
    espessura_nm: res.oxidacao.espessura_nm,
    espessuraCampo_nm: res.oxidacao.espessuraCampo_nm,
    V_D: el.V_D,
    perdaSi_5e12: el.perdaSi[i5],
    Cmin_sobre_Cox: Cmin / el.C_ox_F_cm2,
    ativoSuperficie_cm3: res.oxidacao.estado.ativo[0],
    E_ox_VD5: (() => {
      let k = 0;
      for (let i = 0; i < el.V.length; i++) if (Math.abs(el.V[i] - (el.V_D + 5)) < Math.abs(el.V[k] - (el.V_D + 5))) k = i;
      return el.E_ox_MVcm[k];
    })(),
    carga_por_volt_cm2: (el.C_ox_F_cm2 / q),
  };
}
