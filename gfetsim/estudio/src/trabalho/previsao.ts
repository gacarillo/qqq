/**
 * Cliente das tarefas de previsão: avalia o plano de treino distribuído entre workers e
 * executa as tarefas pesadas (ajuste dos GPs, calibração, mapas) numa fila com tantos
 * workers quantos núcleos houver, menos um.
 */
import type { Receita } from "@/fisica/receita";
import type { Saida } from "@/fisica/incerteza/montecarlo";
import type { TarefaPrevisao, ResultadoTarefa } from "@/previsao/tarefas";
import { novoCanal, type Canal } from "./cliente";
import type { PontoAvaliacao, Resposta } from "./protocolo";

export const nucleos = (): number => Math.max(1, Math.min(6, (typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4) - 1));

/** Avalia pontos com a cadeia completa; os resultados chegam um a um. */
export class ExecucaoPontos {
  private canais: Canal[] = [];
  private parado = false;

  constructor(receita: Receita, pontos: PontoAvaliacao[], aoPonto: (i: number, s: Saida | null, erro?: string) => void, aoFim: () => void, nWorkers = nucleos()) {
    const n = pontos.length;
    const FATIA = 3;
    // fatias distribuídas em rodízio, para os workers terminarem juntos
    const fatias: [number, number][] = [];
    for (let k = 0; k < n; k += FATIA) fatias.push([k, Math.min(n, k + FATIA)]);
    const porW: [number, number][][] = Array.from({ length: Math.min(nWorkers, fatias.length) }, () => []);
    fatias.forEach((f, i) => porW[i % porW.length].push(f));
    let ativos = porW.length;
    if (ativos === 0) {
      queueMicrotask(aoFim);
      return;
    }
    const id = Date.now();
    for (const lista of porW) {
      let pendentes = lista.length;
      const c = novoCanal((r: Resposta) => {
        if (this.parado) return;
        if (r.tipo === "amostra_mc") aoPonto(r.indice, r.saida, r.erro);
        else if (r.tipo === "fim_mc" && --pendentes === 0) {
          c.encerrar();
          if (--ativos === 0) aoFim();
        }
      });
      this.canais.push(c);
      for (const [a, b] of lista) c.enviar({ tipo: "avaliar_pontos", id, receita, pontos: pontos.slice(a, b), deslocamento: a });
    }
  }

  parar(): void {
    this.parado = true;
    this.canais.forEach((c) => c.encerrar());
  }
}

interface Trabalho {
  receita: Receita;
  tarefa: TarefaPrevisao;
  progresso?: (f: number, texto: string) => void;
  ok: (r: ResultadoTarefa) => void;
  falha: (e: Error) => void;
}

/** Fila de tarefas de previsão com um worker por tarefa em andamento. */
export class FilaPrevisao {
  private fila: Trabalho[] = [];
  private ativos = 0;
  private canais = new Set<Canal>();
  private seq = 1;

  constructor(private readonly max = nucleos()) {}

  executar(receita: Receita, tarefa: TarefaPrevisao, progresso?: (f: number, texto: string) => void): Promise<ResultadoTarefa> {
    return new Promise((ok, falha) => {
      this.fila.push({ receita, tarefa, progresso, ok, falha });
      this.bombear();
    });
  }

  get pendentes(): number {
    return this.fila.length + this.ativos;
  }

  cancelarTudo(): void {
    for (const t of this.fila) t.falha(new Error("cancelado"));
    this.fila = [];
    for (const c of this.canais) c.encerrar();
    this.canais.clear();
    this.ativos = 0;
  }

  private bombear(): void {
    while (this.ativos < this.max && this.fila.length) {
      const t = this.fila.shift()!;
      this.ativos++;
      const id = this.seq++;
      let fim = false;
      const c: Canal = novoCanal((r: Resposta) => {
        if (fim) return;
        if (r.tipo === "previsao_progresso" && r.id === id) t.progresso?.(r.fracao, r.texto);
        else if (r.tipo === "previsao_resultado" && r.id === id) terminar(() => t.ok(r.resultado));
        else if (r.tipo === "erro" && (r.id === id || r.id === -1)) terminar(() => t.falha(new Error(r.mensagem)));
      });
      const terminar = (f: () => void) => {
        fim = true;
        c.encerrar();
        this.canais.delete(c);
        this.ativos--;
        f();
        this.bombear();
      };
      this.canais.add(c);
      c.enviar({ tipo: "previsao", id, receita: t.receita, tarefa: t.tarefa });
    }
  }
}
