/**
 * Álbum de figurinhas: cada fase vencida revela uma peça da figurinha atual; a figurinha completa entra no
 * álbum; cada página fechada dá uma recompensa fixa, mostrada antes (nada sorteado, por causa do ECA Digital).
 *
 * A primeira figurinha tem 8 peças e fecha na fase 8, dentro dos 10 primeiros minutos (seção Primeira sessão).
 * As 16 figurinhas somam exatamente 100 peças, uma por fase da primeira versão.
 */
import { criarAleatorio, embaralhar } from '../logica/aleatorio';

export interface Figurinha {
  numero: number;
  nome: string;
  /** Letra de fruta (arte do tabuleiro) ou chave de ARTE_ESPECIAL. */
  arte: string;
  pecas: number;
  curiosidade: string;
}

export interface Pagina {
  numero: number;
  titulo: string;
  cor: string;
  recompensa: number;
  figurinhas: number[];
}

export const FIGURINHAS: Figurinha[] = [
  { numero: 1, nome: 'Maçã', arte: 'A', pecas: 8, curiosidade: 'Santa Catarina e Rio Grande do Sul colhem quase toda a maçã do Brasil.' },
  { numero: 2, nome: 'Banana', arte: 'B', pecas: 6, curiosidade: 'O Brasil está entre os maiores produtores de banana do mundo.' },
  { numero: 3, nome: 'Laranja', arte: 'D', pecas: 6, curiosidade: 'Boa parte do suco de laranja do mundo sai do Brasil.' },
  { numero: 4, nome: 'Melancia', arte: 'F', pecas: 6, curiosidade: 'Mais de 90% de uma melancia é água.' },
  { numero: 5, nome: 'Uva', arte: 'C', pecas: 6, curiosidade: 'A Serra Gaúcha é a região mais famosa pelas uvas no Brasil.' },
  { numero: 6, nome: 'Morango', arte: 'G', pecas: 6, curiosidade: 'As sementinhas por fora são os frutos de verdade.' },
  { numero: 7, nome: 'Limão', arte: 'E', pecas: 6, curiosidade: 'O limão-taiti, o mais comum na feira, é vendido verde.' },
  { numero: 8, nome: 'Abacaxi', arte: 'J', pecas: 6, curiosidade: 'Do plantio à colheita, o abacaxi leva mais de um ano.' },
  { numero: 9, nome: 'Carambola', arte: 'H', pecas: 6, curiosidade: 'Cortada em fatias, vira estrelinhas.' },
  { numero: 10, nome: 'Coco', arte: 'I', pecas: 6, curiosidade: 'A água de coco vem do coco verde.' },
  { numero: 11, nome: 'Pera', arte: 'K', pecas: 6, curiosidade: 'Muitas peras amadurecem melhor depois de colhidas.' },
  { numero: 12, nome: 'Acerola', arte: 'L', pecas: 6, curiosidade: 'É uma das frutas com mais vitamina C.' },
  { numero: 13, nome: 'Caju', arte: 'caju', pecas: 6, curiosidade: 'A castanha é o fruto; a parte carnuda é um pseudofruto.' },
  { numero: 14, nome: 'Jabuticaba', arte: 'jabuticaba', pecas: 6, curiosidade: 'Nasce grudada no tronco da árvore.' },
  { numero: 15, nome: 'Açaí', arte: 'acai', pecas: 6, curiosidade: 'Vem de uma palmeira da Amazônia.' },
  { numero: 16, nome: 'Maracujá', arte: 'maracuja', pecas: 8, curiosidade: 'A flor do maracujá é chamada de flor-da-paixão.' },
];

export const PAGINAS: Pagina[] = [
  { numero: 1, titulo: 'Clássicos da feira', cor: '#d9483b', recompensa: 100, figurinhas: [1, 2, 3, 4] },
  { numero: 2, titulo: 'Do pomar', cor: '#7346b0', recompensa: 150, figurinhas: [5, 6, 7, 8] },
  { numero: 3, titulo: 'Tropicais', cor: '#14897c', recompensa: 200, figurinhas: [9, 10, 11, 12] },
  { numero: 4, titulo: 'Raridades do Brasil', cor: '#c98410', recompensa: 300, figurinhas: [13, 14, 15, 16] },
];

export const TOTAL_PECAS = FIGURINHAS.reduce((n, f) => n + f.pecas, 0);

export interface SituacaoAlbum {
  /** Figurinhas completas (0 a 16). */
  completas: number;
  /** Índice da figurinha em andamento, ou null se o álbum acabou. */
  atual: number | null;
  /** Peças já reveladas da figurinha em andamento. */
  pecasNaAtual: number;
}

/** Situação do álbum depois de `pecas` peças ganhas (uma por fase vencida). */
export function situacao(pecas: number): SituacaoAlbum {
  let resto = Math.max(0, pecas);
  for (let i = 0; i < FIGURINHAS.length; i++) {
    if (resto < FIGURINHAS[i].pecas) return { completas: i, atual: i, pecasNaAtual: resto };
    resto -= FIGURINHAS[i].pecas;
  }
  return { completas: FIGURINHAS.length, atual: null, pecasNaAtual: 0 };
}

export function paginaDaFigurinha(indice: number): Pagina {
  return PAGINAS.find((p) => p.figurinhas.includes(indice + 1))!;
}

/** Páginas cujas figurinhas estão todas completas. */
export function paginasCompletas(pecas: number): number[] {
  const { completas } = situacao(pecas);
  return PAGINAS.filter((p) => p.figurinhas.every((n) => n <= completas)).map((p) => p.numero);
}

/** Ordem em que as peças de uma figurinha aparecem (fixa, mas não da esquerda para a direita). */
export function ordemDasPecas(indice: number): number[] {
  const n = FIGURINHAS[indice].pecas;
  return embaralhar(criarAleatorio(indice * 131 + 7), Array.from({ length: n }, (_, i) => i));
}

/** Grade das peças: 8 peças em 2×4, 6 peças em 2×3. */
export function gradeDasPecas(indice: number): { colunas: number; linhas: number } {
  const n = FIGURINHAS[indice].pecas;
  return { colunas: 2, linhas: Math.ceil(n / 2) };
}
