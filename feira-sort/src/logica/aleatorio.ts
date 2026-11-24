/** Gerador pseudoaleatório com semente (mulberry32): a mesma semente gera sempre a mesma fase. */
export type Aleatorio = () => number;

export function criarAleatorio(semente: number): Aleatorio {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function inteiro(rng: Aleatorio, minimo: number, maximo: number): number {
  return minimo + Math.floor(rng() * (maximo - minimo + 1));
}

export function embaralhar<T>(rng: Aleatorio, lista: T[]): T[] {
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
}

/** Semente estável a partir de um texto (ex.: a data do desafio diário). */
export function sementeDeTexto(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
