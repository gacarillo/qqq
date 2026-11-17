import { describe, expect, it } from "vitest";
import { carregar, ParametroAusente } from "@/parametros/parametros";
import { Aleatorio } from "@/nucleo/aleatorio";

describe("regras do params.yaml", () => {
  it("valor null sem provisório aceito bloqueia o modelo", () => {
    const p = carregar(false);
    expect(() => p.valor("recozimento.difusao_P.fair_tsai.D0_neutro")).toThrow(ParametroAusente);
  });
  it("provisório aceito vira [I] e fica registrado", () => {
    const p = carregar(true);
    expect(p.valor("recozimento.difusao_P.fair_tsai.D0_neutro")).toBe(3.85);
    expect(p.etiqueta("recozimento.difusao_P.fair_tsai.D0_neutro")).toBe("I");
    expect(p.provisoriosUsados).toContain("recozimento.difusao_P.fair_tsai.D0_neutro");
  });
  it("valor do usuário passa a ser [B]", () => {
    const p = carregar(true, { "receita.implantacao.energia": 40 });
    expect(p.valor("receita.implantacao.energia")).toBe(40);
    expect(p.etiqueta("receita.implantacao.energia")).toBe("B");
  });
  it("valor publicado mantém a etiqueta da fonte", () => {
    const p = carregar(true);
    expect(p.valor("recozimento.solubilidade_P.A_ne")).toBe(1.3e22);
    expect(p.etiqueta("recozimento.solubilidade_P.A_ne")).toBe("P");
  });
  it("amostragem segue o tipo declarado e recusa varreduras", () => {
    const p = carregar(true);
    const r = new Aleatorio(1);
    const u = p.amostrar("implantacao.amorfizacao.limiar_TA.dose_limiar", r, 2000);
    expect(Math.min(...u)).toBeGreaterThanOrEqual(1e15);
    expect(Math.max(...u)).toBeLessThanOrEqual(3e15);
    const lu = p.amostrar("eletrico.grafeno.mobilidade.prior_calibracao", r, 4000);
    const mediaLog = lu.reduce((s, v) => s + Math.log(v), 0) / lu.length;
    expect(mediaLog).toBeCloseTo(0.5 * (Math.log(300) + Math.log(7800)), 1);
    expect(() => p.amostrar("receita.oxidacao_porta.temperatura", r, 3)).toThrow(/varredura/);
  });
  it("encontra as folhas com etiqueta para o inspetor", () => {
    const f = carregar(true).folhas();
    expect(f.length).toBeGreaterThan(150);
    expect(f.some((x) => x.chave === "oxidacao.massoud_regime_fino.Si100_T_menor_1000C.C_B")).toBe(true);
  });
});
