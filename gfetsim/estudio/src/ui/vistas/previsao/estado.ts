/**
 * Estado da vista Previsão, compartilhado pelas seções e guardado no navegador. O
 * caderno de lotes tem armazenamento próprio (previsao/caderno.ts); aqui ficam o
 * emulador treinado, a calibração, as especificações e a receita-alvo.
 */
import { Loja, armazenamento } from "@/estado/loja";
import { loja as lojaApp } from "@/estado/app";
import { Parametros } from "@/parametros/parametros";
import dadosParams from "@/dados/params.json";
import type { Receita } from "@/fisica/receita";
import type { NomeSaida } from "@/fisica/incerteza/montecarlo";
import { Emulador, NOME_SAIDA, TRANSFORMACAO, type SerialEmulador } from "@/previsao/emulador";
import type { ResultadoCalibracao } from "@/previsao/calibracao";
import type { ResultadoPrevisao } from "@/previsao/preditiva";
import type { ResultadoPlano } from "@/previsao/planejamento";
import type { ResultadoMapa } from "@/previsao/otimizacao";
import type { ValoresReceita, NomeVarReceita } from "@/previsao/espaco";
import { DEF_VAR, DEF_CALIB } from "@/previsao/espaco";
import { gravarCaderno, lerCaderno } from "@/previsao/caderno";
import { ehParametro, nomeParametro, type Especificacao, type Grandeza, type Lote, type PosteriorSerial } from "@/previsao/tipos";
import { posterioriDaPriori } from "@/previsao/tarefas";
import { FilaPrevisao } from "@/trabalho/previsao";
import { br, num, sci } from "../../formato";

export interface Treino {
  feitos: number;
  total: number;
  falhas: number;
  fase: "simulando" | "ajustando";
  ajustados: number;
  nSaidas: number;
  inicio: number;
}

export interface EstadoPrevisao {
  emulador: SerialEmulador | null;
  treino: Treino | null;
  calibracao: ResultadoCalibracao | null;
  calibrando: number | null;
  lotes: Lote[];
  specs: Especificacao[];
  alvo: ValoresReceita;
  previsao: ResultadoPrevisao | null;
  prevendo: boolean;
  plano: ResultadoPlano | null;
  planejando: boolean;
  mapa: ResultadoMapa | null;
  mapeando: boolean;
  conferencia: { s: NomeSaida; emulador: number[]; cadeia: number[] }[] | null;
}

const K_EMU = "gfetsim.previsao.emulador";
const K_CAL = "gfetsim.previsao.calibracao";
const K_SPEC = "gfetsim.previsao.specs";
const K_ALVO = "gfetsim.previsao.alvo";

type CalSalva = Omit<ResultadoCalibracao, "posterior"> & { posterior: Omit<PosteriorSerial, "amostras"> & { amostras: number[] } };

function lerCalibracao(): ResultadoCalibracao | null {
  const c = armazenamento.ler<CalSalva | null>(K_CAL, null);
  if (!c?.posterior?.amostras) return null;
  return { ...c, posterior: { ...c.posterior, amostras: Float64Array.from(c.posterior.amostras) } };
}

export const lojaPrev = new Loja<EstadoPrevisao>({
  emulador: armazenamento.ler<SerialEmulador | null>(K_EMU, null),
  treino: null,
  calibracao: lerCalibracao(),
  calibrando: null,
  lotes: lerCaderno(),
  specs: armazenamento.ler<Especificacao[]>(K_SPEC, []),
  alvo: armazenamento.ler<ValoresReceita>(K_ALVO, {}),
  previsao: null,
  prevendo: false,
  plano: null,
  planejando: false,
  mapa: null,
  mapeando: false,
  conferencia: null,
});

lojaPrev.observar((s) => s.emulador, (e) => armazenamento.gravar(K_EMU, e), false);
lojaPrev.observar((s) => s.lotes, (l) => gravarCaderno(l), false);
lojaPrev.observar((s) => s.specs, (l) => armazenamento.gravar(K_SPEC, l), false);
lojaPrev.observar((s) => s.alvo, (l) => armazenamento.gravar(K_ALVO, l), false);
lojaPrev.observar((s) => s.calibracao, (c) => {
  if (!c) return armazenamento.gravar(K_CAL, null);
  const salvo: CalSalva = { ...c, posterior: { ...c.posterior, amostras: Array.from(c.posterior.amostras) } };
  armazenamento.gravar(K_CAL, salvo);
}, false);

export const fila = new FilaPrevisao();

/** Parâmetros da receita atual do estúdio, com as sobrescritas do usuário. */
export function parametrosDe(r: Receita): Parametros {
  return new Parametros(dadosParams as Record<string, unknown>, r.aceitarProvisorios, r.sobrescrever);
}

let cacheEm: { serial: SerialEmulador; em: Emulador } | null = null;

/** Emulador reconstruído na thread principal, com cache pela identidade do serial. */
export function emuladorAtual(): Emulador | null {
  const s = lojaPrev.get().emulador;
  if (!s) return null;
  if (cacheEm?.serial === s) return cacheEm.em;
  try {
    const em = Emulador.de(parametrosDe(s.base), s);
    cacheEm = { serial: s, em };
    return em;
  } catch {
    return null;
  }
}

/** Posteriori em uso: a calibração se for do mesmo emulador, senão a priori. */
export function posterioriAtual(): PosteriorSerial | null {
  const em = emuladorAtual();
  if (!em) return null;
  const c = lojaPrev.get().calibracao;
  if (c && c.posterior.dc === em.espaco.calib.length && c.nomes.join() === em.espaco.calib.map((x) => x.def.nome).join()) return c.posterior;
  return posterioriDaPriori(em, 3000, 1);
}

export function receitaApp(): Receita {
  return lojaApp.get().receita;
}

/** Receita-alvo completa: o que o usuário pôs, e a base do emulador no resto. */
export function alvoCompleto(): ValoresReceita {
  const em = emuladorAtual();
  if (!em) return lojaPrev.get().alvo;
  return { ...em.espaco.receitaBase(), ...lojaPrev.get().alvo };
}

/* ---------------------------------------------------------------- nomes e formatos */

export function rotuloGrandeza(g: Grandeza): string {
  if (ehParametro(g)) return `${DEF_CALIB.get(nomeParametro(g))?.rotulo ?? g} (medida direta)`;
  return NOME_SAIDA.get(g)?.rotulo ?? g;
}

export function unidadeGrandeza(g: Grandeza): string {
  if (ehParametro(g)) return DEF_CALIB.get(nomeParametro(g))?.unidade ?? "";
  return NOME_SAIDA.get(g)?.unidade ?? "";
}

/** Formata um valor de saída com as casas certas para a grandeza. */
export function fmtSaida(s: NomeSaida, v: number): string {
  if (!Number.isFinite(v)) return "sem valor";
  if (s === "ativo_superficie") return sci(v, 2);
  if (s === "fracao_ativa" || s === "C_min_sobre_Cox") return br(v, 3);
  if (s === "perda_si_5e12") return `${br(100 * v, 2)} %`;
  if (TRANSFORMACAO[s] === "log") return num(v, 3);
  if (s === "V_D" || s === "E_ox_em_VD_mais_5V") return br(v, 2);
  return br(v, 2);
}

export function fmtVar(nome: NomeVarReceita, v: number): string {
  const d = DEF_VAR.get(nome);
  if (!d || !Number.isFinite(v)) return String(v);
  return d.cientifico ? sci(v, d.casas) : br(v, d.casas);
}

export function fmtPct(p: number | null | undefined, casas = 0): string {
  return p === null || p === undefined || !Number.isFinite(p) ? "sem valor" : `${br(100 * p, casas)} %`;
}

/** Saídas que alguém mede no laboratório; as outras só aparecem na previsão. */
export const MEDIVEIS: NomeSaida[] = ["espessura_ox_nm", "Rs_recozido", "Rs_final", "fracao_ativa", "ativo_superficie", "amorfo_nm", "V_D", "C_min_sobre_Cox", "Rsq_grafeno_5e12"];

/** Especificações iniciais: a espessura alvo da receita ± 1 nm, as outras desligadas. */
export function specsPadrao(r: Receita): Especificacao[] {
  const alvo = r.oxidacao.alvo_nm;
  return [
    { s: "espessura_ox_nm", min: Number((alvo - 1).toFixed(2)), max: Number((alvo + 1).toFixed(2)), ativa: true },
    { s: "Rs_final", min: null, max: 60, ativa: false },
    { s: "V_D", min: -3, max: 3, ativa: false },
    { s: "C_min_sobre_Cox", min: 0.8, max: null, ativa: false },
    { s: "E_ox_em_VD_mais_5V", min: null, max: 5, ativa: false },
    { s: "fracao_ativa", min: 0.6, max: null, ativa: false },
  ];
}

/** Paleta das séries da vista, pelas variáveis do tema. */
export const COR = {
  priori: "var(--texto-3)",
  posteriori: "var(--acento)",
  medido: "var(--aviso)",
  ok: "var(--ok)",
  erro: "var(--erro)",
  s2: "var(--s2)",
  s3: "var(--s3)",
};
