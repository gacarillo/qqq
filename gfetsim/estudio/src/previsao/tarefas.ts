/**
 * Tarefas pesadas da previsão, executadas pelo Motor dentro de um worker (ou na thread
 * principal quando o navegador não deixa criar workers). Cada tarefa recebe o emulador
 * serializado e devolve dados simples, que atravessam o postMessage sem perda.
 */
import type { NomeSaida } from "@/fisica/incerteza/montecarlo";
import type { Parametros } from "@/parametros/parametros";
import { Aleatorio } from "@/nucleo/aleatorio";
import { Emulador, ajustarSaida, type QualidadeSaida, type SerialEmulador } from "./emulador";
import type { SerialGP } from "./gp";
import { calibrar, type ResultadoCalibracao } from "./calibracao";
import { prever, especificacoesValidas, type ResultadoPrevisao } from "./preditiva";
import { planejar, type Candidato, type ResultadoPlano } from "./planejamento";
import { mapaProbabilidade, type ResultadoMapa } from "./otimizacao";
import type { NomeVarReceita, ValoresReceita } from "./espaco";
import { discrepancias, type Especificacao, type Lote, type PosteriorSerial } from "./tipos";

export type TarefaPrevisao =
  | { op: "ajustar"; saida: NomeSaida; Z: number[][]; y: number[]; semente: number; iteracoes?: number }
  | { op: "calibrar"; emulador: SerialEmulador; lotes: Lote[]; passos: number; semente: number }
  | { op: "prever"; emulador: SerialEmulador; posterior: PosteriorSerial; receita: ValoresReceita; specs: Especificacao[]; n: number; semente: number }
  | { op: "planejar"; emulador: SerialEmulador; posterior: PosteriorSerial; receita: ValoresReceita; alvo: NomeSaida; candidatos: Candidato[]; semente: number }
  | { op: "mapa"; emulador: SerialEmulador; posterior: PosteriorSerial; receita: ValoresReceita; specs: Especificacao[]; eixos: [NomeVarReceita, NomeVarReceita]; n: number; semente: number };

export type ResultadoTarefa =
  | { op: "ajustar"; saida: NomeSaida; gp: SerialGP; qualidade: QualidadeSaida }
  | { op: "calibrar"; r: ResultadoCalibracao }
  | { op: "prever"; r: ResultadoPrevisao }
  | { op: "planejar"; r: ResultadoPlano }
  | { op: "mapa"; r: ResultadoMapa };

/** Amostra da priori no formato da posteriori, para comparar e para rodar sem medidas. */
export function posterioriDaPriori(em: Emulador, n: number, semente: number): PosteriorSerial {
  const esp = em.espaco;
  const dc = esp.calib.length;
  const rng = new Aleatorio(semente);
  const a = new Float64Array(n * dc);
  for (let s = 0; s < n; s++) a.set(esp.amostrarPriori(rng), s * dc);
  return { amostras: a, S: n, dc, nTermos: 0 };
}

export function executarTarefa(t: TarefaPrevisao, p: Parametros, progresso: (fracao: number, texto: string) => void): ResultadoTarefa {
  if (t.op === "ajustar") {
    const r = ajustarSaida(t.Z, t.y, { semente: t.semente, iteracoes: t.iteracoes });
    return { op: "ajustar", saida: t.saida, gp: r.gp, qualidade: r.qualidade };
  }
  const em = Emulador.de(p, t.emulador);
  const disc = discrepancias(p, em.saidas);
  if (t.op === "calibrar") {
    const r = calibrar(em, t.lotes, disc, { passos: t.passos, semente: t.semente, progresso: (f) => progresso(f, "amostrando a posteriori") });
    return { op: "calibrar", r };
  }
  if (t.op === "prever") {
    const pri = posterioriDaPriori(em, 4000, t.semente + 3);
    return { op: "prever", r: prever(em, t.posterior, pri, t.receita, especificacoesValidas(em, t.specs), disc, { n: t.n, semente: t.semente }) };
  }
  if (t.op === "planejar") return { op: "planejar", r: planejar(em, t.posterior, t.receita, t.alvo, t.candidatos, disc, { semente: t.semente }) };
  return { op: "mapa", r: mapaProbabilidade(em, t.posterior, t.receita, especificacoesValidas(em, t.specs), disc, t.eixos, { n: t.n, semente: t.semente }) };
}
