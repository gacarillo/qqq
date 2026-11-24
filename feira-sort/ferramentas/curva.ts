/**
 * Curva de dificuldade das 100 primeiras fases, seguindo a tabela do plano:
 *
 * | Fases    | Papel                                              | Falha alvo     | Novidade            |
 * | 1 a 10   | Ensinar a regra, impossível perder                 | 0%             | Regra básica        |
 * | 11 a 35  | Formar o hábito, partidas rápidas                  | até 10%        | Mais tipos de item  |
 * | 36 a 60  | Picos a cada 5 fases, seguidos de fases fáceis     | picos 30%-50%  | Itens escondidos    |
 * | 61 a 100 | Ciclos de subida e recuperação (como no Knit Out)  | picos até 60%  | Caixa trancada      |
 *
 * A "falha" aqui é a do jogador simulado. É uma hipótese de partida: depois do lançamento, a taxa de falha
 * real de cada fase substitui esses números (seção Métricas e testes do plano).
 */

import { ESTREIA_FRUTAS } from '../src/dados/estreias';

export { ESTREIA_FRUTAS };

export type Papel = 'tutorial' | 'habito' | 'novidade' | 'subida' | 'pico' | 'recuperacao';

export interface Vaga {
  fase: number;
  papel: Papel;
  alvoFalha: number;
  tolerancia: number;
  tipos: [number, number];
  vazias: number;
  distribuicao: 'cheias' | 'irregular';
  caixasExtras?: number;
  ocultos: number;
  tranca: boolean;
  maxJogadas: number;
}

export function frutaEstreante(fase: number): string | undefined {
  return Object.keys(ESTREIA_FRUTAS).find((l) => ESTREIA_FRUTAS[l] === fase);
}

export function frutasDisponiveis(fase: number): string[] {
  return Object.keys(ESTREIA_FRUTAS).filter((l) => ESTREIA_FRUTAS[l] <= fase);
}

const arred = (x: number) => Math.round(x * 100) / 100;

export function vaga(n: number): Vaga {
  if (n <= 10) throw new Error('As fases 1 a 10 são feitas à mão (ferramentas/tutorial.ts)');
  const estreia = frutaEstreante(n) !== undefined;

  // 11 a 35: formar o hábito.
  if (n <= 35) {
    const inicio = n <= 18;
    const base = inicio ? 0.01 + 0.03 * ((n - 11) / 7) : 0.04 + 0.06 * ((n - 19) / 16);
    return {
      fase: n,
      papel: estreia ? 'novidade' : 'habito',
      alvoFalha: arred(Math.max(0, estreia ? base - 0.03 : base)),
      tolerancia: 0.03,
      tipos: n <= 14 ? [4, 4] : n <= 18 ? [4, 5] : n <= 24 ? [5, 5] : n <= 30 ? [5, 6] : [6, 6],
      vazias: inicio ? 1 : 2,
      distribuicao: inicio ? 'irregular' : 'cheias',
      caixasExtras: inicio ? 1 : undefined,
      ocultos: 0,
      tranca: false,
      maxJogadas: inicio ? 16 : 22,
    };
  }

  // 36 a 60: primeiros picos, itens escondidos.
  if (n <= 60) {
    if (n === 36) {
      return {
        fase: n, papel: 'novidade', alvoFalha: 0.02, tolerancia: 0.03, tipos: [5, 5], vazias: 2,
        distribuicao: 'cheias', ocultos: 0.15, tranca: false, maxJogadas: 24,
      };
    }
    const posicao = n % 5; // 0 = pico (40, 45, ...), 1 = logo depois do pico
    if (posicao === 0) {
      const k = (n - 40) / 5; // 0..4
      return {
        fase: n, papel: 'pico', alvoFalha: arred(0.3 + 0.05 * k), tolerancia: 0.06, tipos: [7, 8], vazias: 2,
        distribuicao: 'cheias', ocultos: 0.25, tranca: false, maxJogadas: 30,
      };
    }
    if (posicao === 1) {
      return {
        fase: n, papel: 'recuperacao', alvoFalha: 0.03, tolerancia: 0.03, tipos: [6, 6], vazias: 2,
        distribuicao: 'cheias', ocultos: 0, tranca: false, maxJogadas: 26,
      };
    }
    const subida = [0, 0, 0.08, 0.12, 0.16][posicao];
    return {
      fase: n,
      papel: estreia ? 'novidade' : 'subida',
      alvoFalha: arred(estreia ? subida - 0.04 : subida),
      tolerancia: 0.04,
      tipos: n < 46 ? [6, 7] : [7, 7],
      vazias: 2,
      distribuicao: 'cheias',
      ocultos: n % 2 === 0 ? 0.2 : 0,
      tranca: false,
      maxJogadas: 30,
    };
  }

  // 61 a 100: ciclos de subida e recuperação, caixa trancada.
  const posicao = (n - 61) % 5; // 0 recuperação ... 4 pico (65, 70, ..., 100)
  // Fase de recuperação e estreia de fruta ficam sem tranca, para continuarem fáceis.
  const tranca = n === 61 || n === 62 || (n >= 64 && (n - 64) % 3 === 0 && posicao !== 0 && !estreia);
  if (n === 61) {
    return {
      fase: n, papel: 'novidade', alvoFalha: 0.02, tolerancia: 0.03, tipos: [6, 6], vazias: 2,
      distribuicao: 'cheias', ocultos: 0, tranca: true, maxJogadas: 30,
    };
  }
  const tiposFaixa: [number, number] = n <= 70 ? [7, 8] : n <= 85 ? [8, 9] : [9, 10];
  if (posicao === 4) {
    const k = (n - 65) / 5; // 0..7
    return {
      fase: n, papel: 'pico', alvoFalha: arred(0.4 + (0.2 * k) / 7), tolerancia: 0.06, tipos: tiposFaixa,
      vazias: 2, distribuicao: 'cheias', ocultos: tranca ? 0.2 : 0.3, tranca, maxJogadas: 40,
    };
  }
  const alvo = [0.04, 0.12, 0.2, 0.3][posicao];
  return {
    fase: n,
    papel: estreia ? 'novidade' : posicao === 0 ? 'recuperacao' : 'subida',
    alvoFalha: arred(estreia ? Math.max(0.02, alvo - 0.05) : alvo),
    tolerancia: alvo <= 0.2 ? 0.04 : 0.06,
    tipos: posicao === 0 || estreia ? [tiposFaixa[0] - 1, tiposFaixa[0]] : tiposFaixa,
    vazias: 2,
    distribuicao: 'cheias',
    ocultos: !tranca && n >= 63 ? 0.3 : 0,
    tranca,
    maxJogadas: 40,
  };
}
