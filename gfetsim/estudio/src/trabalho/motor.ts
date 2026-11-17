/**
 * Motor de simulação, o mesmo dentro do worker e na thread principal (quando o navegador
 * não deixa criar workers). Recebe Pedidos e emite Respostas.
 */
import tabela from "@/dados/tabela_bca.json";
import dadosParams from "@/dados/params.json";
import { Simulador } from "@/fisica/cadeia";
import type { TabelaBCA } from "@/fisica/implante/tabela";
import { avaliar } from "@/fisica/incerteza/montecarlo";
import type { Pedido, Resposta } from "./protocolo";

export class Motor {
  readonly sim = new Simulador(tabela as unknown as TabelaBCA, dadosParams as Record<string, unknown>);
  private cancelado = new Set<number>();

  constructor(private readonly emitir: (r: Resposta) => void) {}

  cancelar(id: number): void {
    this.cancelado.add(id);
  }

  tratar(m: Pedido): void {
    if (m.tipo === "limpar") {
      this.sim.limparCache();
      return;
    }
    if (m.tipo === "simular") {
      const t0 = performance.now();
      try {
        const resultado = this.sim.simular(m.receita, (etapa, fracao) => this.emitir({ tipo: "progresso", id: m.id, etapa, fracao }));
        this.emitir({ tipo: "resultado", id: m.id, resultado, ms: performance.now() - t0 });
      } catch (e) {
        const err = e as Error;
        this.emitir({ tipo: "erro", id: m.id, mensagem: err.message, pilha: err.stack });
      }
      return;
    }
    if (m.tipo === "avaliar_mc") {
      const p = this.sim.parametros(m.receita);
      m.amostras.forEach((a, k) => {
        if (this.cancelado.has(m.id)) return;
        try {
          const saida = avaliar(p, this.sim.interpolador, m.receita, m.t_ox_min, a);
          this.emitir({ tipo: "amostra_mc", id: m.id, indice: m.deslocamento + k, saida });
        } catch (e) {
          this.emitir({ tipo: "amostra_mc", id: m.id, indice: m.deslocamento + k, saida: null, erro: (e as Error).message });
        }
      });
      this.emitir({ tipo: "fim_mc", id: m.id });
    }
  }
}
