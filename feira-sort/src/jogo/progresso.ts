/**
 * Progresso salvo no aparelho, com número de versão do formato para que atualizações futuras não quebrem
 * saves antigos (seção Princípios de arquitetura do plano). Toda leitura e escrita aceita falhar: em janela
 * anônima, por exemplo, o jogo funciona e só não lembra o progresso.
 */
export const VERSAO_SAVE = 1;
const CHAVE = 'feira-sort:progresso';

export interface EstatisticaFase {
  tentativas: number;
  vitorias: number;
  /** Tentativas que terminaram em reinício ou abandono. */
  falhas: number;
  travou: number;
  desfazer: number;
  caixasExtras: number;
  segundos: number;
}

export interface Progresso {
  versao: number;
  /** Próxima fase a jogar (1 a 100; 101 = terminou o lote). */
  fase: number;
  moedas: number;
  /** Peças de figurinha ganhas (uma por fase vencida pela primeira vez). */
  pecas: number;
  paginasResgatadas: number[];
  config: { som: boolean; vibracao: boolean; anunciosSimulados: boolean };
  anuncios: { ultimoIntersticial: number; fasesDesdeIntersticial: number };
  /** Mecânicas e frutas já apresentadas (para mostrar o aviso de novidade uma vez só). */
  vistos: string[];
  estatisticas: Record<string, EstatisticaFase>;
  criadoEm: number;
}

export function progressoNovo(agora = Date.now()): Progresso {
  return {
    versao: VERSAO_SAVE,
    fase: 1,
    moedas: 0,
    pecas: 0,
    paginasResgatadas: [],
    config: { som: true, vibracao: true, anunciosSimulados: true },
    anuncios: { ultimoIntersticial: 0, fasesDesdeIntersticial: 0 },
    vistos: [],
    estatisticas: {},
    criadoEm: agora,
  };
}

/** Converte qualquer save antigo (ou corrompido) para o formato atual, sem perder o que dá para aproveitar. */
export function migrar(bruto: unknown): Progresso {
  const novo = progressoNovo();
  if (!bruto || typeof bruto !== 'object') return novo;
  const s = bruto as Partial<Progresso>;
  const numero = (v: unknown, padrao: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : padrao;
  return {
    versao: VERSAO_SAVE,
    fase: numero(s.fase, 1, 1, 101),
    moedas: numero(s.moedas, 0),
    pecas: numero(s.pecas, 0, 0, 100),
    paginasResgatadas: Array.isArray(s.paginasResgatadas) ? s.paginasResgatadas.filter((n) => typeof n === 'number') : [],
    config: { ...novo.config, ...(typeof s.config === 'object' && s.config ? s.config : {}) },
    anuncios: { ...novo.anuncios, ...(typeof s.anuncios === 'object' && s.anuncios ? s.anuncios : {}) },
    vistos: Array.isArray(s.vistos) ? s.vistos.filter((v) => typeof v === 'string') : [],
    estatisticas: typeof s.estatisticas === 'object' && s.estatisticas ? s.estatisticas : {},
    criadoEm: numero(s.criadoEm, novo.criadoEm),
  };
}

export function carregar(): Progresso {
  try {
    const texto = localStorage.getItem(CHAVE);
    return texto ? migrar(JSON.parse(texto)) : progressoNovo();
  } catch {
    return progressoNovo();
  }
}

export function salvar(p: Progresso): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(p));
  } catch {
    // Sem armazenamento disponível: o jogo segue, só não lembra o progresso.
  }
}

export function apagar(): void {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    // nada a fazer
  }
}

export function estatistica(p: Progresso, fase: number): EstatisticaFase {
  const chave = String(fase);
  p.estatisticas[chave] ??= { tentativas: 0, vitorias: 0, falhas: 0, travou: 0, desfazer: 0, caixasExtras: 0, segundos: 0 };
  return p.estatisticas[chave];
}
