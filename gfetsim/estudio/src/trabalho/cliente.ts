/**
 * Cliente dos workers de simulação.
 *
 * Dois canais: o rápido roda a cadeia sem a borda 2D e responde em cerca de um segundo;
 * o completo roda também a borda 2D. Um pedido novo substitui o anterior: o canal ocupado
 * é encerrado e recriado, então a resposta que chega é sempre a da receita mais recente.
 * O Monte Carlo usa um conjunto de workers próprios. Se o navegador recusar workers, o
 * motor roda na thread principal, entre quadros.
 */
import type { Receita } from "@/fisica/receita";
import type { ResultadoCadeia } from "@/fisica/cadeia";
import type { Amostra, Saida } from "@/fisica/incerteza/montecarlo";
import type { Pedido, Resposta } from "./protocolo";
import TrabalhadorSimulacao from "./simulador.worker?worker&inline";

type Ouvinte = (r: Resposta) => void;

export interface Canal {
  enviar(p: Pedido): void;
  encerrar(): void;
  ocupado: boolean;
}

let motorLocal: Promise<import("./motor").Motor> | null = null;
const ouvintesLocais = new Set<Ouvinte>();

function canalLocal(ouvinte: Ouvinte): Canal {
  ouvintesLocais.add(ouvinte);
  if (!motorLocal) motorLocal = import("./motor").then((m) => new m.Motor((r) => ouvintesLocais.forEach((o) => o(r))));
  const c: Canal = {
    ocupado: false,
    enviar(p) {
      c.ocupado = true;
      void motorLocal!.then((m) => setTimeout(() => {
        m.tratar(p);
        c.ocupado = false;
      }, 0));
    },
    encerrar() {
      ouvintesLocais.delete(ouvinte);
    },
  };
  return c;
}

export let modoExecucao: "worker" | "local" = "worker";

export function novoCanal(ouvinte: Ouvinte): Canal {
  if (modoExecucao === "worker") {
    try {
      const w = new TrabalhadorSimulacao();
      const c: Canal = {
        ocupado: false,
        enviar(p) {
          c.ocupado = true;
          w.postMessage(p);
        },
        encerrar() {
          w.terminate();
        },
      };
      w.onmessage = (ev: MessageEvent<Resposta>) => {
        if (ev.data.tipo === "resultado" || ev.data.tipo === "erro" || ev.data.tipo === "fim_mc" || ev.data.tipo === "previsao_resultado") c.ocupado = false;
        ouvinte(ev.data);
      };
      let pronto = false;
      let pendente: Pedido | null = null;
      const enviarOriginal = c.enviar;
      c.enviar = (p) => {
        pendente = p;
        enviarOriginal(p);
      };
      w.addEventListener("message", (ev: MessageEvent<Resposta>) => {
        if (ev.data.tipo === "pronto") pronto = true;
        if (ev.data.tipo === "resultado" || ev.data.tipo === "fim_mc" || ev.data.tipo === "previsao_resultado") pendente = null;
      });
      w.onerror = (ev) => {
        ev.preventDefault();
        w.terminate();
        if (!pronto) {
          // o worker nem carregou: passa para a thread principal e reenvia o pedido
          modoExecucao = "local";
          const local = canalLocal(ouvinte);
          c.enviar = (p) => local.enviar(p);
          c.encerrar = () => local.encerrar();
          if (pendente) local.enviar(pendente);
          return;
        }
        c.ocupado = false;
        ouvinte({ tipo: "erro", id: -1, mensagem: `falha no worker: ${ev.message || "sem mensagem"}` });
      };
      return c;
    } catch {
      modoExecucao = "local";
    }
  }
  return canalLocal(ouvinte);
}

export interface EventosSimulacao {
  progresso(fase: "rapido" | "completo", etapa: string, fracao: number): void;
  resultado(fase: "rapido" | "completo", r: ResultadoCadeia, ms: number): void;
  erro(fase: "rapido" | "completo", mensagem: string): void;
}

export class ClienteSimulacao {
  private id = 0;
  private rapido: Canal | null = null;
  private completo: Canal | null = null;
  private idRapido = -1;
  private idCompleto = -1;

  constructor(private readonly ev: EventosSimulacao) {}

  private ouvinte(fase: "rapido" | "completo"): Ouvinte {
    return (r) => {
      const atual = fase === "rapido" ? this.idRapido : this.idCompleto;
      if ("id" in r && r.id !== atual && r.id !== -1) return;
      if (r.tipo === "progresso") this.ev.progresso(fase, r.etapa, r.fracao);
      else if (r.tipo === "resultado") this.ev.resultado(fase, r.resultado, r.ms);
      else if (r.tipo === "erro") this.ev.erro(fase, r.mensagem);
    };
  }

  simular(receita: Receita): void {
    const semBorda: Receita = { ...receita, borda: { calcular: false } };
    if (this.rapido?.ocupado) {
      this.rapido.encerrar();
      this.rapido = null;
    }
    this.rapido ??= novoCanal(this.ouvinte("rapido"));
    this.idRapido = ++this.id;
    this.rapido.enviar({ tipo: "simular", id: this.idRapido, receita: semBorda });
    if (receita.borda.calcular && receita.implante.variante === "A_mascara") {
      if (this.completo?.ocupado) {
        this.completo.encerrar();
        this.completo = null;
      }
      this.completo ??= novoCanal(this.ouvinte("completo"));
      this.idCompleto = ++this.id;
      this.completo.enviar({ tipo: "simular", id: this.idCompleto, receita });
    }
  }

  encerrar(): void {
    this.rapido?.encerrar();
    this.completo?.encerrar();
  }
}

/** Monte Carlo distribuído entre workers, com resultados chegando amostra a amostra. */
export class ExecucaoMC {
  private canais: Canal[] = [];
  private parado = false;

  constructor(
    receita: Receita,
    t_ox_min: number | null,
    amostras: Amostra[],
    aoAmostra: (i: number, s: Saida | null, erro?: string) => void,
    aoFim: () => void,
    nWorkers = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1)),
  ) {
    const n = amostras.length;
    const porW = Math.ceil(n / nWorkers);
    const FATIA = 4; // fatias pequenas para que os resultados apareçam aos poucos
    let canaisAtivos = 0;
    const id = Date.now();
    for (let w = 0; w < nWorkers; w++) {
      const ini = w * porW;
      const fim = Math.min(n, ini + porW);
      if (ini >= fim) break;
      let pendentes = Math.ceil((fim - ini) / FATIA);
      canaisAtivos++;
      const c = novoCanal((r) => {
        if (this.parado) return;
        if (r.tipo === "amostra_mc") aoAmostra(r.indice, r.saida, r.erro);
        else if (r.tipo === "fim_mc" && --pendentes === 0) {
          c.encerrar();
          if (--canaisAtivos === 0) aoFim();
        }
      });
      this.canais.push(c);
      for (let k = ini; k < fim; k += FATIA) c.enviar({ tipo: "avaliar_mc", id, receita, t_ox_min, amostras: amostras.slice(k, Math.min(fim, k + FATIA)), deslocamento: k });
    }
  }

  parar(): void {
    this.parado = true;
    this.canais.forEach((c) => c.encerrar());
  }
}
