/** Nome e cor de cada tipo de item (a letra é a usada nos arquivos de fase). */
export interface Fruta {
  letra: string;
  nome: string;
  /** Cor principal, usada em partículas e brilhos. */
  cor: string;
}

export const FRUTAS: Fruta[] = [
  { letra: 'A', nome: 'Maçã', cor: '#e2453c' },
  { letra: 'B', nome: 'Banana', cor: '#f7d23e' },
  { letra: 'C', nome: 'Uva', cor: '#7b4bb7' },
  { letra: 'D', nome: 'Laranja', cor: '#f59a23' },
  { letra: 'E', nome: 'Limão', cor: '#7cc242' },
  { letra: 'F', nome: 'Melancia', cor: '#f05a5a' },
  { letra: 'G', nome: 'Morango', cor: '#e8364f' },
  { letra: 'H', nome: 'Carambola', cor: '#f2c230' },
  { letra: 'I', nome: 'Coco', cor: '#8b5a2b' },
  { letra: 'J', nome: 'Abacaxi', cor: '#f2b630' },
  { letra: 'K', nome: 'Pera', cor: '#b5d334' },
  { letra: 'L', nome: 'Acerola', cor: '#c81e3a' },
];

export function fruta(tipo: number): Fruta {
  return FRUTAS[tipo] ?? FRUTAS[0];
}
