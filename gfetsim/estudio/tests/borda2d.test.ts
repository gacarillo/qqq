import { describe, expect, it } from "vitest";
import { carregar } from "@/parametros/parametros";
import * as b from "@/fisica/recozimento/borda2d";
import { receitaEtapas } from "@/fisica/recozimento/recozimento";
import { erroRel, fixture } from "./ajuda";

const p = carregar(true);
const F = fixture("borda2d");
const g = { x: Float64Array.from(F.x), y: Float64Array.from(F.y) };

describe("borda 2D contra recozimento/borda2d.py", () => {
  const { C, cobertura } = b.mapaInicial(g, F.px, F.mu, F.sg, 18.4);
  it("mapa inicial com sombra de 18,4 nm", () => {
    expect(erroRel(C.v, F.C0, 1e12)).toBeLessThan(2e-7);
  });
  it("camada amorfa ponderada pela cobertura", () => {
    const am = b.amorfo2D(F.Fn, cobertura, 3e15, 2e15);
    let dif = 0;
    for (let k = 0; k < am.length; k++) if (am[k] !== F.amorfo[k]) dif++;
    expect(dif).toBeLessThanOrEqual(2); // células exatamente no limiar podem divergir pelo erf
  });
  it("difusão 2D por separação de operadores", () => {
    const Cd = b.difundir2D(p, g, { nx: g.x.length, ny: g.y.length, v: Float64Array.from(F.C0) }, 1000, 30, 8);
    expect(erroRel(Cd.v, F.Cd, 1e14)).toBeLessThan(1e-6);
  });
  it("SPE e RTA em 2D", () => {
    const am = Uint8Array.from(F.amorfo);
    const q = b.recozer2D(p, g, { nx: g.x.length, ny: g.y.length, v: Float64Array.from(F.C0) }, am, receitaEtapas(p, "A_rta") as [never, never], 3);
    expect(q.length).toBe(F.n_quadros);
    let n = 0;
    for (const v of q[4].amorfo) n += v;
    expect(n).toBe(F.spe_meio_amorfo);
    expect(erroRel(q.at(-1)!.C.v, F.final_C, 1e14)).toBeLessThan(1e-6);
    expect(erroRel(q.at(-1)!.ativo.v, F.final_A, 1e14)).toBeLessThan(1e-6);
  });
  it("ajuste quadrático igual ao np.polyfit", () => {
    const x = [0, 1, 2, 3, 4, 5];
    const y = x.map((v) => 2 + 0.5 * v - 0.1 * v * v);
    const c = b.ajusteQuadratico(x, y);
    expect(c[0]).toBeCloseTo(-0.1, 12);
    expect(c[1]).toBeCloseTo(0.5, 12);
    expect(c[2]).toBeCloseTo(2, 12);
  });
});
