/**
 * Uma partida de uma fase: seleção por toque, jogadas, desfazer, caixa extra, reinício, vitória e travamento.
 * Não sabe nada de tela; avisa quem estiver ouvindo pelos callbacks.
 */
import {
  adicionarCaixaExtra,
  criarEstado,
  motivoInvalido,
  mover,
  podeSelecionar,
  semJogadas,
  venceu,
  type DefinicaoFase,
  type Estado,
  type MotivoInvalido,
  type ResultadoMovimento,
} from '../logica/regras';
import { ECONOMIA } from './economia';

export interface OuvintePartida {
  selecionou(caixa: number | null): void;
  moveu(r: ResultadoMovimento, de: number, para: number): void;
  invalido(caixa: number, motivo: MotivoInvalido | 'nao-selecionavel'): void;
  desfez(estado: Estado): void;
  reiniciou(estado: Estado): void;
  ganhouCaixa(estado: Estado): void;
  venceu(): void;
  travou(): void;
}

export class Partida {
  estado: Estado;
  selecionada: number | null = null;
  jogadas = 0;
  desfazerRestante: number;
  desfazerUsados = 0;
  caixaExtraUsada = false;
  terminada = false;
  inicio = Date.now();
  private historico: Estado[] = [];
  private revelados = new Set<number>();

  constructor(
    readonly def: DefinicaoFase,
    private ouvinte: OuvintePartida,
  ) {
    this.estado = criarEstado(def);
    this.desfazerRestante = this.tutorial ? Infinity : ECONOMIA.desfazerGratisPorFase;
  }

  get tutorial(): boolean {
    return this.def.id <= ECONOMIA.ultimaFaseTutorial;
  }

  get podeDesfazer(): boolean {
    return !this.terminada && this.historico.length > 0;
  }

  tocar(indice: number | null): void {
    if (this.terminada) return;
    if (indice === null) {
      if (this.selecionada !== null) this.mudarSelecao(null);
      return;
    }
    if (this.selecionada === null) {
      if (podeSelecionar(this.estado, indice)) this.mudarSelecao(indice);
      else if (this.estado.caixas[indice].itens.length > 0) this.ouvinte.invalido(indice, 'nao-selecionavel');
      return;
    }
    if (this.selecionada === indice) {
      this.mudarSelecao(null);
      return;
    }
    const de = this.selecionada;
    const motivo = motivoInvalido(this.estado, de, indice);
    if (motivo) {
      this.selecionada = null;
      this.ouvinte.invalido(indice, motivo);
      this.ouvinte.selecionou(null);
      return;
    }
    this.historico.push(this.estado);
    const r = mover(this.estado, de, indice);
    for (const id of r.revelados) this.revelados.add(id);
    for (const item of r.movidos) this.revelados.add(item.id);
    this.estado = r.estado;
    this.selecionada = null;
    this.jogadas++;
    this.ouvinte.moveu(r, de, indice);
    if (venceu(this.estado)) {
      this.terminada = true;
      this.ouvinte.venceu();
    } else if (semJogadas(this.estado)) {
      this.ouvinte.travou();
    }
  }

  private mudarSelecao(indice: number | null): void {
    this.selecionada = indice;
    this.ouvinte.selecionou(indice);
  }

  /** Desfaz a última jogada. O que já foi revelado continua revelado (não dá para espiar desfazendo). */
  desfazer(): boolean {
    if (!this.podeDesfazer || this.desfazerRestante <= 0) return false;
    const anterior = this.historico.pop()!;
    this.estado = {
      capacidade: anterior.capacidade,
      caixas: anterior.caixas.map((c) => ({
        chave: c.chave,
        itens: c.itens.map((i) => (i.oculto && this.revelados.has(i.id) ? { ...i, oculto: false } : i)),
      })),
    };
    this.selecionada = null;
    this.desfazerRestante--;
    this.desfazerUsados++;
    this.ouvinte.desfez(this.estado);
    return true;
  }

  ganharDesfazer(n: number): void {
    this.desfazerRestante = Math.max(0, this.desfazerRestante) + n;
  }

  /** Uma caixa vazia a mais nesta tentativa. O desfazer não a remove. */
  adicionarCaixa(): boolean {
    if (this.terminada || this.caixaExtraUsada) return false;
    this.caixaExtraUsada = true;
    this.estado = adicionarCaixaExtra(this.estado);
    this.historico = this.historico.map(adicionarCaixaExtra);
    this.selecionada = null;
    this.ouvinte.ganhouCaixa(this.estado);
    return true;
  }

  reiniciar(): void {
    this.estado = criarEstado(this.def);
    this.historico = [];
    this.revelados.clear();
    this.selecionada = null;
    this.jogadas = 0;
    this.desfazerRestante = this.tutorial ? Infinity : ECONOMIA.desfazerGratisPorFase;
    this.desfazerUsados = 0;
    this.caixaExtraUsada = false;
    this.terminada = false;
    this.inicio = Date.now();
    this.ouvinte.reiniciou(this.estado);
  }

  segundos(): number {
    return Math.round((Date.now() - this.inicio) / 1000);
  }
}
