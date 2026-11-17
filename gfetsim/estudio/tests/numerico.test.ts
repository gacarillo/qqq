import { describe, expect, it } from "vitest";
import { F12 } from "@/nucleo/fermi";
import { brent, dopri5, interp, SplineCubica, transformadaDistancia, tridiagonal, trapz, linspace, gradiente } from "@/nucleo/numerico";
import { Aleatorio, quantil, hipercuboLatino } from "@/nucleo/aleatorio";
import { erroRel, fixture } from "./ajuda";

const F = fixture("numerico");

describe("núcleo numérico contra NumPy e SciPy", () => {
  it("F_1/2 de Fermi-Dirac concorda com a tabela de quad do Python em 1e-6", () => {
    // Em eta = -40 o quad do Python tem tolerância absoluta de 1,5e-8 e erra 9e-4 relativo
    // num valor de 4e-18; ali a referência certa é exp(eta)(1 - exp(eta)/2^1,5).
    const sel = F.eta.map((e: number, i: number) => [e, i]).filter(([e]: number[]) => e > -30 || e < -40);
    expect(erroRel(sel.map(([e]: number[]) => F12(e)), sel.map(([, i]: number[]) => F.F12[i]))).toBeLessThan(1e-6);
    expect(Math.abs(F12(-40) / (Math.exp(-40) * (1 - Math.exp(-40) / 2 ** 1.5)) - 1)).toBeLessThan(1e-9);
  });
  it("spline em grade uniforme reproduz um polinômio cúbico exatamente", () => {
    const xs = linspace(0, 1, 11);
    const s = new SplineCubica(xs, xs.map((x) => 1 - 2 * x + 3 * x ** 3));
    for (const x of [-0.3, 0.05, 0.5, 0.97, 1.4]) expect(s.avaliar(x)).toBeCloseTo(1 - 2 * x + 3 * x ** 3, 10);
  });
  it("spline cúbica not-a-knot reproduz interp1d(kind='cubic') com extrapolação", () => {
    const s = new SplineCubica(F.spline.x, F.spline.y);
    const v = F.spline.xq.map((x: number) => s.avaliar(x));
    expect(erroRel(v, F.spline.yq, 1e-3)).toBeLessThan(1e-9);
  });
  it("transformada de distância euclidiana é exata como distance_transform_edt", () => {
    const e = F.edt;
    const d = transformadaDistancia(e.mascara, e.nx, e.ny, e.dx, e.dy);
    expect(erroRel(d, e.d, 1)).toBeLessThan(1e-12);
  });
  it("Thomas resolve um sistema tridiagonal conhecido", () => {
    const n = 50;
    const inf = new Float64Array(n - 1).fill(-1), sup = new Float64Array(n - 1).fill(-1), diag = new Float64Array(n).fill(2.5);
    const xv = linspace(0, 1, n).map((v) => Math.sin(3 * v));
    const rhs = new Float64Array(n);
    for (let i = 0; i < n; i++) rhs[i] = diag[i] * xv[i] + (i > 0 ? inf[i - 1] * xv[i - 1] : 0) + (i < n - 1 ? sup[i] * xv[i + 1] : 0);
    expect(erroRel(tridiagonal(inf, diag, sup, rhs), xv, 1e-6)).toBeLessThan(1e-10);
  });
  it("Brent acha a raiz de cos x = x", () => {
    expect(brent((x) => Math.cos(x) - x, 0, 1)).toBeCloseTo(0.7390851332151607, 12);
  });
  it("Dormand e Prince integra y' = -y e detecta o evento y = 0,5", () => {
    const r = dopri5((_t, y) => [-y[0]], 0, [1], 5, { tAvaliar: [1, 2, 3], evento: (_t, y) => 0.5 - y[0], rtol: 1e-11, atol: 1e-12 });
    expect(r.tEvento).toBeCloseTo(Math.log(2), 7);
    const r2 = dopri5((_t, y) => [-y[0]], 0, [1], 3, { tAvaliar: [1, 2, 3], rtol: 1e-10, atol: 1e-12 });
    expect(erroRel(r2.y.map((v) => v[0]), [Math.exp(-1), Math.exp(-2), Math.exp(-3)])).toBeLessThan(1e-6);
  });
  it("interp, trapézio e gradiente seguem o NumPy", () => {
    expect(interp(2.5, [1, 2, 3], [10, 20, 30])).toBe(25);
    expect(interp(5, [1, 2, 3], [10, 20, 30], 0, -1)).toBe(-1);
    const x = linspace(0, Math.PI, 2001);
    expect(trapz(x.map(Math.sin), x)).toBeCloseTo(2, 6);
    const g = gradiente(x.map((v) => v * v), x);
    expect(g[1000]).toBeCloseTo(2 * x[1000], 9);
  });
  it("gerador é reproduzível e a normal tem média e desvio corretos", () => {
    const a = new Aleatorio(42), b = new Aleatorio(42);
    expect(a.u32()).toBe(b.u32());
    const v = Array.from({ length: 40000 }, () => a.normal(3, 2));
    const m = v.reduce((s, x) => s + x, 0) / v.length;
    const s = Math.sqrt(v.reduce((acc, x) => acc + (x - m) ** 2, 0) / v.length);
    expect(m).toBeCloseTo(3, 1);
    expect(s).toBeCloseTo(2, 1);
    expect(quantil([1, 2, 3, 4], 0.5)).toBe(2.5);
    const h = hipercuboLatino(10, 2, a);
    const ordenado = h.map((r) => Math.floor(r[0] * 10)).sort((x, y) => x - y);
    expect(ordenado).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
