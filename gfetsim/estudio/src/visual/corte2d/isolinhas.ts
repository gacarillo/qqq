/**
 * Isolinhas por marching squares sobre uma grade retangular, com interpolação linear nas
 * arestas e desempate do caso de sela pela média do quadrado.
 */
export interface Segmento {
  a: [number, number]; // (i, j) contínuos: i profundidade, j lateral
  b: [number, number];
}

export function isolinhas(v: ArrayLike<number>, nx: number, ny: number, nivel: number): Segmento[] {
  const seg: Segmento[] = [];
  const val = (i: number, j: number) => v[i * ny + j];
  const corte = (va: number, vb: number) => (nivel - va) / (vb - va);
  for (let i = 0; i < nx - 1; i++) {
    for (let j = 0; j < ny - 1; j++) {
      const a = val(i, j), b = val(i, j + 1), c = val(i + 1, j + 1), d = val(i + 1, j);
      if (!Number.isFinite(a + b + c + d)) continue;
      let k = 0;
      if (a >= nivel) k |= 8;
      if (b >= nivel) k |= 4;
      if (c >= nivel) k |= 2;
      if (d >= nivel) k |= 1;
      if (k === 0 || k === 15) continue;
      // pontos nas arestas: topo (a-b), direita (b-c), base (d-c), esquerda (a-d)
      const topo: [number, number] = [i, j + corte(a, b)];
      const dir: [number, number] = [i + corte(b, c), j + 1];
      const base: [number, number] = [i + 1, j + corte(d, c)];
      const esq: [number, number] = [i + corte(a, d), j];
      const add = (p: [number, number], q: [number, number]) => seg.push({ a: p, b: q });
      switch (k) {
        case 1: case 14: add(esq, base); break;
        case 2: case 13: add(base, dir); break;
        case 3: case 12: add(esq, dir); break;
        case 4: case 11: add(topo, dir); break;
        case 6: case 9: add(topo, base); break;
        case 7: case 8: add(esq, topo); break;
        case 5: case 10: {
          const centro = (a + b + c + d) / 4 >= nivel;
          if ((k === 5) === centro) {
            add(esq, topo);
            add(base, dir);
          } else {
            add(esq, base);
            add(topo, dir);
          }
          break;
        }
      }
    }
  }
  return seg;
}
