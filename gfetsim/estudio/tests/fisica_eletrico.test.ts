import { describe, expect, it } from "vitest";
import { carregar } from "@/parametros/parametros";
import { SiPorta } from "@/fisica/eletrico/poisson";
import { correnteJimenez, pilhaDeParams, sigmaDeNEstrela, tabelaNMu } from "@/fisica/eletrico/grafeno";
import { correnteFN, parametrosFN } from "@/fisica/eletrico/oxido";
import { simularEletrico } from "@/fisica/eletrico/eletrico";
import { largura, varrer } from "@/fisica/eletrico/histerese";
import { cada, erroRel, fixture } from "./ajuda";

const p = carregar(true);
const F = fixture("eletrico");

describe("Poisson com Fermi-Dirac contra eletrico/poisson.py", () => {
  const sp = new SiPorta(p, F.x, F.ativo);
  it("equilíbrio local e potencial sem carga na superfície", () => {
    expect(Math.abs(sp.psiEq[0] / F.psi_eq_0 - 1)).toBeLessThan(1e-9);
    expect(Math.abs(sp.psi0[0] / F.psi0_0 - 1)).toBeLessThan(1e-8);
  });
  it("curvatura das bandas para cargas de depleção e acumulação", () => {
    const c = F.Q.map((Q: number) => sp.curvatura(Q));
    expect(erroRel(c, F.curvatura, 1e-6)).toBeLessThan(1e-6);
  });
});

describe("grafeno contra eletrico/grafeno.py", () => {
  it("tabela n(mu) com alargamento gaussiano", () => {
    const t = tabelaNMu(1.1e6, sigmaDeNEstrela(3.58e15, 1.1e6));
    expect(erroRel(cada(t.mu, 50), F.tab_mu)).toBeLessThan(1e-12);
    expect(erroRel(cada(t.n, 50), F.tab_n, 1e12)).toBeLessThan(1e-9);
  });
  const sp = new SiPorta(p, F.x, F.ativo);
  const { pilha } = pilhaDeParams(p, 20, sp);
  it("densidade e capacitância da pilha com Si n+", () => {
    expect(Math.abs(pilha.C_ox / F.C_ox - 1)).toBeLessThan(1e-12);
    expect(erroRel(F.V.map((v: number) => pilha.densidade(v)), F.n, 1e12)).toBeLessThan(1e-6);
    expect(erroRel(F.V.map((v: number) => pilha.capacitancia(v)), F.C)).toBeLessThan(1e-4);
  });
  it("corrente de Jiménez", () => {
    const I = [-3, 0, 3].map((vg) => correnteJimenez(pilha, vg, 0.5, 0.16, 10e-6, 10e-6, 0.055, 1e15, 101));
    expect(erroRel(I, F.jimenez)).toBeLessThan(1e-5);
  });
  it("Fowler e Nordheim", () => {
    const fn = parametrosFN(p);
    expect(erroRel(F.fn_E.map((E: number) => correnteFN(fn, E)), F.fn_J)).toBeLessThan(1e-10);
  });
  it("Fowler e Nordheim no ramo de Fukuda", () => {
    const fn = parametrosFN(p, undefined, undefined, "fukuda");
    expect(fn.barreira_eV).toBe(3.34);
    expect(fn.mrel).toBe(0.35);
    expect(erroRel(F.fn_E.map((E: number) => correnteFN(fn, E)), F.fn_J_fukuda)).toBeLessThan(1e-10);
  });
  it("histerese por relaxação", () => {
    const h = F.histerese;
    expect(erroRel(varrer(h.V, h.taxa, h.alfa, h.tau).VD, h.VD, 1e-9)).toBeLessThan(1e-12);
    expect(largura(h.V, h.taxa, h.alfa, h.tau)).toBeCloseTo(h.largura, 12);
  });
});

describe("módulo elétrico completo contra eletrico/modulo.py", () => {
  it("C-V, densidade, campo e resistência com substrato de 10 Ω·cm", () => {
    const s = F.sim;
    const { resultado: r } = simularEletrico(p, F.x, F.ativo, 20, { rhoSubstrato_ohm_cm: 10, nDop_cm2: -3e12, Q_f_cm2: 1e11, nEstrela_cm2: 3.58e11, muGrafeno_cm2Vs: 1600 });
    expect(Math.abs(r.V_D - s.V_D)).toBeLessThan(1e-6);
    expect(erroRel(r.V, s.V)).toBeLessThan(1e-9);
    expect(erroRel(r.n_cm2, s.n, 1e8)).toBeLessThan(1e-5);
    expect(erroRel(r.C_F_cm2, s.C)).toBeLessThan(2e-4);
    expect(erroRel(r.C_metal_F_cm2, s.Cm)).toBeLessThan(2e-4);
    expect(erroRel(r.E_ox_MVcm, s.E, 1e-3)).toBeLessThan(1e-5);
    expect(erroRel(r.R_quadrado_ohm, s.Rsq)).toBeLessThan(1e-5);
    expect(erroRel(r.V_ruptura, s.Vr)).toBeLessThan(1e-9);
  });
});
