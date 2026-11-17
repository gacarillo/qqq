/**
 * Receita de processo do estúdio. Os valores padrão vêm do params.yaml (receita.*) e de
 * escolhas de trabalho marcadas em ESCOLHAS, que o relatório lista como tais.
 */
import type { Parametros } from "@/parametros/parametros";
import type { RamoDesativacao, VarianteRecozimento } from "./recozimento/recozimento";
import type { RamoAceleracao, RamoInterface } from "./oxidacao/oxidacao";
import type { ModeloCinetica } from "./oxidacao/cinetica";
import type { RamoFN } from "./eletrico/oxido";

export type VarianteImplante = "A_mascara" | "B_lamina";
export type RamoSombra = "sombra" | "sem_sombra";
export type MetodoOxido = "termico" | "sputtering";

export interface Receita {
  nome: string;
  aceitarProvisorios: boolean;
  /** valores do params.yaml trocados pelo usuário; passam a ser [B] */
  sobrescrever: Record<string, number>;
  implante: {
    variante: VarianteImplante;
    energia_keV: number;
    dose_cm2: number;
    inclinacao: number;
    oxido_nativo_nm: number;
    mascara_nm: number;
    dose_limiar_cm2: number;
    ramoSombra: RamoSombra;
  };
  recozimento: {
    variante: VarianteRecozimento;
    T_spe_C: number;
    t_spe_min: number;
    T_rta_C: number;
    t_rta_s: number;
    T_forno_C: number;
    t_forno_min: number;
    ramoDesativacao: RamoDesativacao;
  };
  oxidacao: {
    metodo: MetodoOxido;
    T_C: number;
    alvo_nm: number;
    /** tempo fixo; null procura o tempo que dá o alvo */
    tempoFixo_min: number | null;
    ramoAceleracao: RamoAceleracao;
    ramoInterface: RamoInterface;
    modelo: ModeloCinetica;
  };
  eletrico: {
    rho_ohm_cm: number;
    nDop_cm2: number;
    sinalDop: 1 | -1;
    Q_f_cm2: number;
    nEstrela_cm2: number;
    D_it_cm2_eV: number;
    /** par barreira e massa do tunelamento pelo óxido */
    ramoFN: RamoFN;
  };
  dispositivo: {
    L_um: number;
    W_um: number;
    mu_cm2Vs: number;
    RcW_ohm_um: number;
    hbarOmega_meV: number;
    VDS_V: number;
    alfaHist: number;
    tauHist_s: number;
    vsat: boolean;
  };
  borda: { calcular: boolean };
}

/** Escolhas de trabalho que não vêm do params.yaml, com a justificativa mostrada na interface. */
export const ESCOLHAS: Record<string, string> = {
  "recozimento.T_forno_C": "o params.yaml deixa a temperatura do forno B como varredura de 850 a 900 °C; o padrão é 900 °C",
  "oxidacao.T_C": "a temperatura da oxidação de porta é varredura de 800 a 1000 °C; o padrão é 900 °C",
  "eletrico.rho_ohm_cm": "a resistividade do substrato é desconhecida (varredura de 0,001 a 10 Ω·cm); o padrão é 10 Ω·cm",
  "eletrico.nDop_cm2": "a dopagem residual tem prior log-uniforme de 1,4e12 a 1e13 cm⁻² e sinal desconhecido; o padrão é 3e12 cm⁻² de lacunas",
  "dispositivo.L_um": "W e L não estão na receita; o padrão é 10 µm com W = L",
  "dispositivo.mu_cm2Vs": "a mobilidade do CVD tem prior de 300 a 7800 cm²/V·s; o padrão é 1600",
  "dispositivo.RcW_ohm_um": "a resistência de contato tem prior de 100 a 5000 Ω·µm; o padrão é 500",
  "dispositivo.hbarOmega_meV": "ħΩ tem faixa de 15 a 100 meV em R42; o padrão é 55 meV (Meric)",
  "dispositivo.alfaHist": "alfa e tau da histerese são parâmetros de calibração [B] sem valor medido; o padrão é ilustrativo",
};

export function receitaPadrao(p: Parametros): Receita {
  const inc = p.incerteza("implantacao.amorfizacao.limiar_TA.dose_limiar")!;
  return {
    nome: "padrão do params.yaml",
    aceitarProvisorios: true,
    sobrescrever: {},
    implante: {
      variante: "A_mascara",
      energia_keV: p.valor("receita.implantacao.energia"),
      dose_cm2: p.valor("receita.implantacao.dose"),
      inclinacao: p.valor("receita.implantacao.inclinacao"),
      oxido_nativo_nm: p.valor("receita.implantacao.oxido_nativo"),
      mascara_nm: (p.no("receita.implantacao.variantes.A_mascara") as { oxido_mascara_nm: number }).oxido_mascara_nm,
      dose_limiar_cm2: 0.5 * (inc.min! + inc.max!),
      ramoSombra: "sombra",
    },
    recozimento: {
      variante: "A_rta",
      T_spe_C: p.valor("receita.recozimento.spe.temperatura"),
      t_spe_min: p.valor("receita.recozimento.spe.tempo"),
      T_rta_C: p.valor("receita.recozimento.variante_A_rta.temperatura"),
      t_rta_s: p.valor("receita.recozimento.variante_A_rta.tempo"),
      T_forno_C: 900,
      t_forno_min: p.valor("receita.recozimento.variante_B_forno.tempo"),
      ramoDesativacao: "equilibrio",
    },
    oxidacao: {
      metodo: "termico",
      T_C: 900,
      alvo_nm: p.valor("receita.oxidacao_porta.espessura_alvo"),
      tempoFixo_min: null,
      ramoAceleracao: "ho_plummer",
      ramoInterface: "acumulo_classico",
      modelo: "massoud",
    },
    eletrico: { rho_ohm_cm: 10, nDop_cm2: 3e12, sinalDop: -1, Q_f_cm2: 0, nEstrela_cm2: p.valor("eletrico.grafeno.n_residual.ju_lee"), D_it_cm2_eV: 0, ramoFN: "williams" },
    dispositivo: { L_um: 10, W_um: 10, mu_cm2Vs: 1600, RcW_ohm_um: 500, hbarOmega_meV: 55, VDS_V: 0.1, alfaHist: 0.15, tauHist_s: 20, vsat: true },
    borda: { calcular: true },
  };
}

/** Cópia profunda simples (a receita só tem dados). */
export function clonarReceita(r: Receita): Receita {
  return JSON.parse(JSON.stringify(r)) as Receita;
}

/** Lê ou escreve um campo pelo caminho "implante.energia_keV". */
export function campoReceita(r: Receita, caminho: string): unknown {
  return caminho.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], r);
}

export function definirCampo(r: Receita, caminho: string, valor: unknown): Receita {
  const nova = clonarReceita(r);
  const partes = caminho.split(".");
  let o = nova as unknown as Record<string, unknown>;
  for (const k of partes.slice(0, -1)) o = o[k] as Record<string, unknown>;
  o[partes.at(-1)!] = valor;
  return nova;
}

export const NOMES_VARIANTE = {
  A_mascara: "A, máscara de SiO₂",
  B_lamina: "B, lâmina inteira",
  A_rta: "A, RTA",
  B_forno: "B, forno",
} as const;

export const NOMES_RAMO: Record<string, string> = {
  ho_plummer: "Ho e Plummer (R29)",
  nomura: "fator 2,1 de Nomura (R23)",
  sem_aceleracao: "sem aceleração, como o Si leve (N10)",
  acumulo_classico: "acúmulo clássico, m ≥ 1000 (R17)",
  lado_oxido: "camada de P no lado do óxido (R32, N12)",
  silicio_inativo: "P inativo junto à interface (R20, N22)",
  equilibrio: "desativação de equilíbrio (N24, R12)",
  metaestavel: "ativação metaestável no RTA (lado de R18)",
  sombra: "feixe inclinado em direção à janela, com sombra",
  sem_sombra: "plano de inclinação paralelo à borda, sem sombra",
  massoud: "regime fino de Massoud (R26 a R28)",
  deal_grove: "Deal e Grove (R25)",
  williams: "3,13 eV e m = 0,4 (L9, L7 e R45)",
  fukuda: "3,34 eV e m = 0,35 (L11)",
};
