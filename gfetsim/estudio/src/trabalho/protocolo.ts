/** Mensagens entre a interface e os workers de simulação. */
import type { Receita } from "@/fisica/receita";
import type { ResultadoCadeia } from "@/fisica/cadeia";
import type { Amostra, Saida } from "@/fisica/incerteza/montecarlo";
import type { TarefaPrevisao, ResultadoTarefa } from "@/previsao/tarefas";

/** Um ponto do plano de treino do emulador: receita própria, tempo de oxidação e amostra. */
export interface PontoAvaliacao {
  receita: Receita;
  t_ox_min: number | null;
  amostra: Amostra;
}

export type Pedido =
  | { tipo: "simular"; id: number; receita: Receita }
  | { tipo: "avaliar_mc"; id: number; receita: Receita; t_ox_min: number | null; amostras: Amostra[]; deslocamento: number }
  | { tipo: "avaliar_pontos"; id: number; receita: Receita; pontos: PontoAvaliacao[]; deslocamento: number }
  | { tipo: "previsao"; id: number; receita: Receita; tarefa: TarefaPrevisao }
  | { tipo: "limpar" };

export type Resposta =
  | { tipo: "pronto" }
  | { tipo: "progresso"; id: number; etapa: string; fracao: number }
  | { tipo: "resultado"; id: number; resultado: ResultadoCadeia; ms: number }
  | { tipo: "amostra_mc"; id: number; indice: number; saida: Saida | null; erro?: string }
  | { tipo: "fim_mc"; id: number }
  | { tipo: "previsao_progresso"; id: number; fracao: number; texto: string }
  | { tipo: "previsao_resultado"; id: number; resultado: ResultadoTarefa; ms: number }
  | { tipo: "erro"; id: number; mensagem: string; pilha?: string };
