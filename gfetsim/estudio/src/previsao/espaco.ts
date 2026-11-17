/**
 * Espaço de entrada do emulador. Ele junta duas coisas diferentes.
 *
 * Variáveis de receita são o que o laboratório escolhe (temperatura e tempo da oxidação,
 * do RTA, dose). O emulador aprende a cadeia numa faixa delas, e na previsão cada uma
 * recebe a dispersão do equipamento em torno do valor nominal.
 *
 * Parâmetros de calibração são o que ninguém controla e as medidas ensinam (fatores de
 * taxa, cargas, mobilidade do grafeno). Cada um tem a priori declarada no params.yaml, e
 * o domínio do emulador é o suporte dessa priori. Para a priori normal o domínio é a
 * média ± 3σ.
 *
 * Tudo vive no cubo unitário [0, 1]^d. Para faixas log-uniformes a coordenada é linear
 * no logaritmo, então a priori fica plana no cubo.
 */
import type { Parametros, Incerteza } from "@/parametros/parametros";
import { clonarReceita, type Receita } from "@/fisica/receita";
import type { Amostra } from "@/fisica/incerteza/montecarlo";
import type { Aleatorio } from "@/nucleo/aleatorio";

export type NomeVarReceita = "T_ox" | "t_ox" | "T_rta" | "t_rta" | "T_forno" | "t_forno" | "T_spe" | "t_spe" | "dose" | "energia";
export type NomeCalib = "fator_taxa_ox" | "fator_mu_si" | "fator_ne" | "fator_spe" | "Q_f" | "n_dop" | "n_estrela" | "mu_grafeno" | "oxido_nativo" | "dose_limiar" | "vF";

export interface Faixa {
  min: number;
  max: number;
}

export type Priori = { tipo: "uniforme"; min: number; max: number } | { tipo: "loguniforme"; min: number; max: number } | { tipo: "normal"; media: number; sigma: number };

export interface DefVarReceita {
  nome: NomeVarReceita;
  rotulo: string;
  unidade: string;
  log: boolean;
  /** faixa que o estúdio aceita para treinar */
  limites: Faixa;
  /** faixa padrão do treino em torno da receita, como fração ou valor absoluto */
  meiaLargura: (v: number) => number;
  /** chave do params.yaml com a dispersão do equipamento, se houver */
  chaveDispersao?: string;
  ler: (r: Receita, tOx: number | null) => number;
  /** casas no formato da interface */
  casas: number;
  cientifico?: boolean;
  /** precisa de variante de recozimento específica */
  variante?: "A_rta" | "B_forno";
  /** só faz sentido para oxidação térmica */
  termico?: boolean;
}

export interface DefCalib {
  nome: NomeCalib;
  rotulo: string;
  unidade: string;
  chave: string;
  casas: number;
  cientifico?: boolean;
  /** valor sem calibração, usado quando o parâmetro não entra no espaço */
  nominal: (r: Receita, p: Parametros) => number;
}

export const VARS_RECEITA: DefVarReceita[] = [
  { nome: "T_ox", rotulo: "T da oxidação", unidade: "°C", log: false, limites: { min: 800, max: 1000 }, meiaLargura: () => 50, ler: (r) => r.oxidacao.T_C, casas: 0, termico: true },
  { nome: "t_ox", rotulo: "tempo da oxidação", unidade: "min", log: true, limites: { min: 1, max: 600 }, meiaLargura: (v) => v * 0.6, ler: (_r, t) => t ?? NaN, casas: 1, termico: true },
  { nome: "T_rta", rotulo: "T do RTA", unidade: "°C", log: false, limites: { min: 950, max: 1150 }, meiaLargura: () => 40, chaveDispersao: "receita.recozimento.variante_A_rta.temperatura", ler: (r) => r.recozimento.T_rta_C, casas: 0, variante: "A_rta" },
  { nome: "t_rta", rotulo: "tempo do RTA", unidade: "s", log: true, limites: { min: 1, max: 120 }, meiaLargura: (v) => v * 0.6, ler: (r) => r.recozimento.t_rta_s, casas: 1, variante: "A_rta" },
  { nome: "T_forno", rotulo: "T do forno", unidade: "°C", log: false, limites: { min: 800, max: 1000 }, meiaLargura: () => 40, ler: (r) => r.recozimento.T_forno_C, casas: 0, variante: "B_forno" },
  { nome: "t_forno", rotulo: "tempo do forno", unidade: "min", log: true, limites: { min: 1, max: 240 }, meiaLargura: (v) => v * 0.6, ler: (r) => r.recozimento.t_forno_min, casas: 1, variante: "B_forno" },
  { nome: "T_spe", rotulo: "T da SPE", unidade: "°C", log: false, limites: { min: 450, max: 650 }, meiaLargura: () => 30, chaveDispersao: "receita.recozimento.spe.temperatura", ler: (r) => r.recozimento.T_spe_C, casas: 0 },
  { nome: "t_spe", rotulo: "tempo da SPE", unidade: "min", log: true, limites: { min: 1, max: 240 }, meiaLargura: (v) => v * 0.6, ler: (r) => r.recozimento.t_spe_min, casas: 1 },
  { nome: "dose", rotulo: "dose", unidade: "cm⁻²", log: true, limites: { min: 2e14, max: 2e16 }, meiaLargura: (v) => v * 0.5, chaveDispersao: "receita.implantacao.dose", ler: (r) => r.implante.dose_cm2, casas: 2, cientifico: true },
  { nome: "energia", rotulo: "energia", unidade: "keV", log: false, limites: { min: 5, max: 100 }, meiaLargura: (v) => v * 0.3, chaveDispersao: "receita.implantacao.energia", ler: (r) => r.implante.energia_keV, casas: 1 },
];

export const CALIB: DefCalib[] = [
  { nome: "fator_taxa_ox", rotulo: "fator da taxa de oxidação", unidade: "", chave: "previsao.fator_taxa_oxidacao", casas: 3, nominal: () => 1 },
  { nome: "fator_mu_si", rotulo: "fator da mobilidade no Si", unidade: "", chave: "previsao.fator_mobilidade_si", casas: 3, nominal: () => 1 },
  { nome: "fator_ne", rotulo: "fator em n_e(T)", unidade: "", chave: "recozimento.solubilidade_P.incerteza_ne", casas: 3, nominal: () => 1 },
  { nome: "fator_spe", rotulo: "aceleração da SPE pelo P", unidade: "", chave: "recozimento.spe_550C.fator_aceleracao_P", casas: 2, nominal: (_r, p) => p.valor("recozimento.spe_550C.fator_aceleracao_P") },
  { nome: "Q_f", rotulo: "carga fixa no óxido", unidade: "cm⁻²", chave: "eletrico.oxido.carga_fixa_Qf", casas: 2, cientifico: true, nominal: (r) => r.eletrico.Q_f_cm2 },
  { nome: "n_dop", rotulo: "dopagem residual do grafeno", unidade: "cm⁻²", chave: "eletrico.grafeno.dopagem_residual_prior", casas: 2, cientifico: true, nominal: (r) => r.eletrico.nDop_cm2 },
  { nome: "n_estrela", rotulo: "n* das poças", unidade: "cm⁻²", chave: "eletrico.grafeno.n_residual.faixa_calibracao", casas: 2, cientifico: true, nominal: (r) => r.eletrico.nEstrela_cm2 },
  { nome: "mu_grafeno", rotulo: "mobilidade do grafeno", unidade: "cm²/V·s", chave: "eletrico.grafeno.mobilidade.prior_calibracao", casas: 0, nominal: (r) => r.dispositivo.mu_cm2Vs },
  { nome: "oxido_nativo", rotulo: "óxido nativo", unidade: "nm", chave: "receita.implantacao.oxido_nativo", casas: 2, nominal: (r) => r.implante.oxido_nativo_nm },
  { nome: "dose_limiar", rotulo: "dose limiar de amorfização", unidade: "cm⁻²", chave: "implantacao.amorfizacao.limiar_TA.dose_limiar", casas: 2, cientifico: true, nominal: (r) => r.implante.dose_limiar_cm2 },
  { nome: "vF", rotulo: "velocidade de Fermi", unidade: "m/s", chave: "eletrico.grafeno.vF", casas: 2, cientifico: true, nominal: (_r, p) => p.valor("eletrico.grafeno.vF") },
];

export const DEF_VAR = new Map(VARS_RECEITA.map((v) => [v.nome, v]));
export const DEF_CALIB = new Map(CALIB.map((c) => [c.nome, c]));

/** Converte a incerteza do params.yaml na priori do espaço. */
export function prioriDe(inc: Incerteza | null, valor: unknown, chave: string): Priori {
  if (!inc) throw new Error(`${chave} não tem incerteza declarada e não pode ser calibrado`);
  const v = typeof valor === "number" && Number.isFinite(valor) ? valor : 1;
  switch (inc.tipo) {
    case "uniforme":
      return { tipo: "uniforme", min: inc.min!, max: inc.max! };
    case "loguniforme":
      return { tipo: "loguniforme", min: inc.min!, max: inc.max! };
    case "normal":
      return { tipo: "normal", media: v, sigma: inc.sigma! };
    case "normal_rel":
      return { tipo: "normal", media: v, sigma: Math.abs(v) * inc.sigma_rel! };
    default:
      throw new Error(`${chave} é uma varredura, não uma priori`);
  }
}

/** Dispersão do equipamento (desvio, unidades físicas) a partir da incerteza do params.yaml. */
export function dispersaoDe(inc: Incerteza | null, v: number): number {
  if (!inc) return 0;
  switch (inc.tipo) {
    case "normal":
      return inc.sigma ?? 0;
    case "normal_rel":
      return Math.abs(v) * (inc.sigma_rel ?? 0);
    case "uniforme":
      return ((inc.max ?? 0) - (inc.min ?? 0)) / Math.sqrt(12);
    case "loguniforme":
      return (v * Math.log((inc.max ?? 1) / (inc.min ?? 1))) / Math.sqrt(12);
    default:
      return 0;
  }
}

/** Domínio físico de uma priori no cubo: [a, b] e se é logarítmico. */
export function dominio(pr: Priori): { a: number; b: number; log: boolean } {
  if (pr.tipo === "normal") return { a: pr.media - 3 * pr.sigma, b: pr.media + 3 * pr.sigma, log: false };
  return { a: pr.min, b: pr.max, log: pr.tipo === "loguniforme" };
}

export function paraUnidade(v: number, a: number, b: number, log: boolean): number {
  return log ? (Math.log(v) - Math.log(a)) / (Math.log(b) - Math.log(a)) : (v - a) / (b - a);
}

export function deUnidade(u: number, a: number, b: number, log: boolean): number {
  return log ? Math.exp(Math.log(a) + u * (Math.log(b) - Math.log(a))) : a + u * (b - a);
}

/** Log da densidade da priori no cubo (constantes omitidas). */
export function logPrioriUnidade(pr: Priori, u: number): number {
  if (!(u >= 0 && u <= 1)) return -Infinity;
  if (pr.tipo === "normal") return -0.5 * ((u - 0.5) * 6) ** 2;
  return 0;
}

export function amostrarPrioriUnidade(pr: Priori, rng: Aleatorio): number {
  if (pr.tipo !== "normal") return rng.real();
  for (;;) {
    const u = 0.5 + rng.normal(0, 1) / 6;
    if (u >= 0 && u <= 1) return u;
  }
}

export interface ConfigEspaco {
  receita: { nome: NomeVarReceita; min: number; max: number }[];
  calib: NomeCalib[];
}

export interface VarAtiva {
  def: DefVarReceita;
  min: number;
  max: number;
  /** desvio do equipamento em unidades físicas, 0 se não declarado */
  dispersao: number;
}

export interface CalibAtiva {
  def: DefCalib;
  priori: Priori;
  a: number;
  b: number;
  log: boolean;
}

/** Valores físicos das variáveis de receita, pelo nome. */
export type ValoresReceita = Partial<Record<NomeVarReceita, number>>;
export type ValoresCalib = Partial<Record<NomeCalib, number>>;

export class Espaco {
  readonly vars: VarAtiva[];
  readonly calib: CalibAtiva[];
  readonly d: number;
  readonly nv: number;

  constructor(
    private readonly p: Parametros,
    readonly base: Receita,
    /** tempo de oxidação da receita base (min), da cadeia nominal */
    readonly tOxBase: number | null,
    readonly config: ConfigEspaco,
  ) {
    this.vars = config.receita.map(({ nome, min, max }) => {
      const def = DEF_VAR.get(nome);
      if (!def) throw new Error(`variável de receita desconhecida: ${nome}`);
      if (!(max > min)) throw new Error(`faixa vazia em ${def.rotulo}`);
      if (def.log && !(min > 0)) throw new Error(`${def.rotulo} precisa de mínimo positivo`);
      const v0 = def.ler(base, tOxBase);
      const dispersao = def.chaveDispersao ? dispersaoDe(p.incerteza(def.chaveDispersao), Number.isFinite(v0) ? v0 : (min + max) / 2) : 0;
      return { def, min, max, dispersao };
    });
    this.calib = config.calib.map((nome) => {
      const def = DEF_CALIB.get(nome);
      if (!def) throw new Error(`parâmetro de calibração desconhecido: ${nome}`);
      const md = p.metadados(def.chave);
      const priori = prioriDe(p.incerteza(def.chave), md.valor ?? md.valor_provisorio, def.chave);
      const { a, b, log } = dominio(priori);
      return { def, priori, a, b, log };
    });
    this.nv = this.vars.length;
    this.d = this.nv + this.calib.length;
  }

  /** Faixa padrão de treino de cada variável aplicável à receita, recortada pelos limites. */
  static faixasPadrao(base: Receita, tOx: number | null): { nome: NomeVarReceita; min: number; max: number }[] {
    const out: { nome: NomeVarReceita; min: number; max: number }[] = [];
    for (const def of VARS_RECEITA) {
      if (!Espaco.aplicavel(def, base)) continue;
      const v = def.ler(base, tOx);
      if (!Number.isFinite(v)) continue;
      const m = def.meiaLargura(v);
      let min = Math.max(def.limites.min, v - m);
      let max = Math.min(def.limites.max, v + m);
      if (def.log) {
        min = Math.max(def.limites.min, v / (1 + m / v));
        max = Math.min(def.limites.max, v * (1 + m / v));
      }
      out.push({ nome: def.nome, min, max });
    }
    return out;
  }

  static aplicavel(def: DefVarReceita, base: Receita): boolean {
    if (def.variante && def.variante !== base.recozimento.variante) return false;
    if (def.termico && base.oxidacao.metodo !== "termico") return false;
    return true;
  }

  /** Coordenada no cubo de uma variável de receita i. */
  uVar(i: number, v: number): number {
    const a = this.vars[i];
    return paraUnidade(v, a.min, a.max, a.def.log);
  }

  vVar(i: number, u: number): number {
    const a = this.vars[i];
    return deUnidade(u, a.min, a.max, a.def.log);
  }

  uCalib(j: number, v: number): number {
    const c = this.calib[j];
    return paraUnidade(v, c.a, c.b, c.log);
  }

  vCalib(j: number, u: number): number {
    const c = this.calib[j];
    return deUnidade(u, c.a, c.b, c.log);
  }

  /** Coordenadas das variáveis de receita; as ausentes ficam no valor da receita base. */
  unidadeReceita(v: ValoresReceita): Float64Array {
    return Float64Array.from(this.vars, (a, i) => this.uVar(i, v[a.def.nome] ?? a.def.ler(this.base, this.tOxBase)));
  }

  /** Valores nominais das variáveis de receita da base. */
  receitaBase(): ValoresReceita {
    const o: ValoresReceita = {};
    for (const a of this.vars) o[a.def.nome] = a.def.ler(this.base, this.tOxBase);
    return o;
  }

  /** Centro da priori de cada parâmetro de calibração, no cubo. */
  centroCalib(): Float64Array {
    return Float64Array.from(this.calib, (c, j) => {
      if (c.priori.tipo === "normal") return 0.5;
      const v = c.def.nominal(this.base, this.p);
      const u = this.uCalib(j, v);
      return Number.isFinite(u) && u >= 0 && u <= 1 ? u : 0.5;
    });
  }

  logPriori(uc: ArrayLike<number>): number {
    let s = 0;
    for (let j = 0; j < this.calib.length; j++) {
      s += logPrioriUnidade(this.calib[j].priori, uc[j]);
      if (s === -Infinity) return s;
    }
    return s;
  }

  amostrarPriori(rng: Aleatorio): Float64Array {
    return Float64Array.from(this.calib, (c) => amostrarPrioriUnidade(c.priori, rng));
  }

  /** Junta receita e calibração num ponto do cubo. */
  juntar(ur: ArrayLike<number>, uc: ArrayLike<number>, z = new Float64Array(this.d)): Float64Array {
    for (let i = 0; i < this.nv; i++) z[i] = ur[i];
    for (let j = 0; j < this.calib.length; j++) z[this.nv + j] = uc[j];
    return z;
  }

  /**
   * Ponto físico para a cadeia: a receita com as variáveis trocadas, o tempo de oxidação e
   * a amostra com todas as entradas do Monte Carlo (as que não estão no espaço ficam no
   * valor da receita base).
   */
  pontoFisico(z: ArrayLike<number>): { receita: Receita; t_ox_min: number | null; amostra: Amostra } {
    const r = clonarReceita(this.base);
    let tOx = this.tOxBase;
    const p = this.p;
    const a: Amostra = {
      energia: r.implante.energia_keV, dose: r.implante.dose_cm2, inclinacao: r.implante.inclinacao, oxido_nativo: r.implante.oxido_nativo_nm,
      dose_limiar: r.implante.dose_limiar_cm2, fator_ne: 1, fator_spe: p.valor("recozimento.spe_550C.fator_aceleracao_P"),
      T_rta: r.recozimento.T_rta_C, T_spe: r.recozimento.T_spe_C, Q_f: r.eletrico.Q_f_cm2, n_estrela: r.eletrico.nEstrela_cm2,
      n_dop: r.eletrico.nDop_cm2, vF: p.valor("eletrico.grafeno.vF"), mu_grafeno: r.dispositivo.mu_cm2Vs, fator_eps_ox: 1,
    };
    for (let i = 0; i < this.nv; i++) {
      const v = this.vVar(i, Math.min(1, Math.max(0, z[i])));
      switch (this.vars[i].def.nome) {
        case "T_ox": r.oxidacao.T_C = v; break;
        case "t_ox": tOx = v; break;
        case "T_rta": a.T_rta = v; r.recozimento.T_rta_C = v; break;
        case "t_rta": r.recozimento.t_rta_s = v; break;
        case "T_forno": r.recozimento.T_forno_C = v; break;
        case "t_forno": r.recozimento.t_forno_min = v; break;
        case "T_spe": a.T_spe = v; r.recozimento.T_spe_C = v; break;
        case "t_spe": r.recozimento.t_spe_min = v; break;
        case "dose": a.dose = v; r.implante.dose_cm2 = v; break;
        case "energia": a.energia = v; r.implante.energia_keV = v; break;
      }
    }
    for (let j = 0; j < this.calib.length; j++) {
      const v = this.vCalib(j, Math.min(1, Math.max(0, z[this.nv + j])));
      const nome = this.calib[j].def.nome;
      if (nome === "fator_taxa_ox") a.fator_taxa_ox = v;
      else if (nome === "fator_mu_si") a.fator_mu_si = v;
      else (a as Record<string, number>)[nome] = v;
    }
    return { receita: r, t_ox_min: tOx, amostra: a };
  }

  /** Valores físicos dos parâmetros de calibração de um ponto do cubo. */
  calibFisico(uc: ArrayLike<number>): ValoresCalib {
    const o: ValoresCalib = {};
    this.calib.forEach((c, j) => (o[c.def.nome] = this.vCalib(j, uc[j])));
    return o;
  }

  /** Chave que identifica um emulador: ramos da receita, partes fixas e configuração. */
  chave(): string {
    const r = this.base;
    const fixo = {
      v: [r.implante.variante, r.implante.ramoSombra, r.recozimento.variante, r.recozimento.ramoDesativacao, r.oxidacao.metodo, r.oxidacao.ramoAceleracao, r.oxidacao.ramoInterface, r.oxidacao.modelo, r.eletrico.sinalDop, r.eletrico.ramoFN],
      s: r.sobrescrever,
      c: this.config,
    };
    return JSON.stringify(fixo);
  }
}
