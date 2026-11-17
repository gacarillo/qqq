import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

const pasta = fileURLToPath(new URL("./fixtures/", import.meta.url));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fixture(nome: string): any {
  return JSON.parse(readFileSync(pasta + nome + ".json", "utf8"));
}

/** Maior erro relativo entre a e b, com piso absoluto para valores pequenos. */
export function erroRel(a: ArrayLike<number>, b: ArrayLike<number>, piso = 0): number {
  expect(a.length).toBe(b.length);
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    const e = Math.abs(a[i] - b[i]) / Math.max(Math.abs(b[i]), piso, 1e-300);
    if (e > m) m = e;
  }
  return m;
}

export function cada<T>(v: ArrayLike<T>, passo: number): T[] {
  const r: T[] = [];
  for (let i = 0; i < v.length; i += passo) r.push(v[i]);
  return r;
}
