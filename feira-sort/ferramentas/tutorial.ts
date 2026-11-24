/**
 * Fases 1 a 10, feitas à mão: ensinam a regra sem nenhum texto.
 *
 * Todas foram escolhidas entre candidatas que o analisador de espaço provou não terem nenhum estado sem
 * saída: qualquer sequência de toques ainda leva à vitória, então é impossível perder (meta de 0% de falha
 * do plano). O teste `testes/fases.test.ts` confere isso a cada mudança.
 *
 * Letras: A maçã, B banana, C uva, D laranja, E limão (ver src/jogo/frutas.ts).
 */
export interface FaseTutorial {
  caixas: string[];
  licao: string;
}

export const TUTORIAL: FaseTutorial[] = [
  { caixas: ['AAA', 'A'], licao: 'Tocar numa caixa e depois em outra. Uma jogada, mãozinha mostrando.' },
  { caixas: ['ABB', 'BB', 'AAA'], licao: 'Um toque pega todos os itens iguais do topo de uma vez.' },
  { caixas: ['AABB', 'BBAA', ''], licao: 'Caixa vazia serve de apoio.' },
  { caixas: ['A', 'CCBB', 'BBCC', 'AAA'], licao: 'Fruta nova (uva) e três tipos.' },
  { caixas: ['BBBA', 'AB', 'ACA', 'CCC', ''], licao: 'Escolher a ordem das jogadas.' },
  { caixas: ['AB', 'CAA', 'CCBA', 'BBC'], licao: 'Sem caixa vazia: abrir espaço juntando iguais.' },
  { caixas: ['AAA', 'CA', 'DDCB', 'DCB', 'BB', 'DC'], licao: 'Fruta nova (laranja), quatro tipos.' },
  { caixas: ['', 'ABC', 'DD', 'BDDB', 'CCAA', 'CBA'], licao: 'Primeira figurinha completa ao vencer.' },
  { caixas: ['CCDC', 'BC', 'AABD', 'DABA', 'DB'], licao: 'Mais jogadas, ainda sem estado sem saída.' },
  { caixas: ['DEEE', 'ECDD', 'CB', 'CAC', 'DAAB', 'A', 'BB'], licao: 'Fruta nova (limão), cinco tipos.' },
];
