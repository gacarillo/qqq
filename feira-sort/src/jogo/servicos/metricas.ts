/**
 * Eventos da seção Métricas e testes do plano. Cada evento vai para todos os destinos registrados: hoje um
 * registro local (para o painel "Dados do teste"); no app, o GameAnalytics entra como mais um destino sem
 * mudar quem registra os eventos.
 *
 * Correspondência com o GameAnalytics: fase_inicio/fase_vitoria/fase_derrota viram progression events
 * (Start/Complete/Fail com a fase), ajuda_usada e figurinha_completa viram design events e os de anúncio
 * viram ad events.
 */
export type NomeEvento =
  | 'sessao_inicio'
  | 'fase_inicio'
  | 'fase_vitoria'
  | 'fase_derrota'
  | 'fase_reinicio'
  | 'ajuda_usada'
  | 'anuncio_recompensado'
  | 'anuncio_intersticial'
  | 'figurinha_completa'
  | 'album_pagina_completa';

export type Dados = Record<string, string | number | boolean>;

export interface Evento {
  nome: NomeEvento;
  /** ms desde 1970 */
  t: number;
  dados: Dados;
}

export interface Destino {
  enviar(evento: Evento): void;
}

export class Metricas {
  private destinos: Destino[] = [];

  adicionarDestino(d: Destino): void {
    this.destinos.push(d);
  }

  registrar(nome: NomeEvento, dados: Dados = {}): void {
    const evento: Evento = { nome, t: Date.now(), dados };
    for (const d of this.destinos) {
      try {
        d.enviar(evento);
      } catch {
        // Um destino com problema nunca derruba o jogo.
      }
    }
  }
}

const CHAVE = 'feira-sort:eventos';
const MAXIMO = 600;

/** Guarda os últimos eventos no aparelho, para exportar no painel de dados do teste. */
export class DestinoLocal implements Destino {
  eventos: Evento[] = [];

  constructor() {
    try {
      const texto = localStorage.getItem(CHAVE);
      if (texto) this.eventos = JSON.parse(texto) as Evento[];
    } catch {
      this.eventos = [];
    }
  }

  enviar(evento: Evento): void {
    this.eventos.push(evento);
    if (this.eventos.length > MAXIMO) this.eventos.splice(0, this.eventos.length - MAXIMO);
    try {
      localStorage.setItem(CHAVE, JSON.stringify(this.eventos));
    } catch {
      // sem armazenamento: os eventos ficam só na memória
    }
  }

  limpar(): void {
    this.eventos = [];
    try {
      localStorage.removeItem(CHAVE);
    } catch {
      // nada a fazer
    }
  }
}
