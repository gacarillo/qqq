import { describe, expect, it } from "vitest";
import tabela from "@/dados/tabela_bca.json";
import dados from "@/dados/params.json";
import { carregar } from "@/parametros/parametros";
import { InterpoladorBCA, type TabelaBCA, ForaDaTabela } from "@/fisica/implante/tabela";
import { simularImplante } from "@/fisica/implante/implante";
import { Simulador, resumo } from "@/fisica/cadeia";
import { receitaPadrao } from "@/fisica/receita";
import { indicesSobol } from "@/fisica/incerteza/montecarlo";
import { Aleatorio } from "@/nucleo/aleatorio";
import { fixture } from "./ajuda";

const p = carregar(true);
const bca = new InterpoladorBCA(tabela as unknown as TabelaBCA);
const F = fixture("implante");

describe("implantação pela tabela do RustBCA contra implantacao/modulo.py", () => {
  it("30 keV, nó da tabela, contra 1e5 íons do Python", () => {
    const r = simularImplante(p, bca, { energia_keV: 30, inclinacao: 7, oxido_nativo_nm: 1.5 });
    const ref = F["30.0"];
    // a tabela usa 2e4 íons; o erro estatístico de Rp é ΔRp/sqrt(N), cerca de 0,13 nm
    expect(Math.abs(r.momentos.media - ref.momentos[0])).toBeLessThan(0.5);
    expect(Math.abs(r.momentos.desvio / ref.momentos[1] - 1)).toBeLessThan(0.02);
    expect(Math.abs(r.momentos.assimetria - ref.momentos[2])).toBeLessThan(0.08);
    expect(Math.abs(r.dose_si / ref.dose_si - 1)).toBeLessThan(0.005);
    // contra o critério do Python com a energia nuclear suavizada, 1 nm; contra o máximo bruto
    // (que nesta rodada caiu num pico de ruído junto à superfície) a diferença chega a 2,5 nm
    expect(Math.abs(r.amorfo_nm![1] - ref.amorfo_suavizado[1])).toBeLessThan(1);
    expect(Math.abs(r.amorfo_nm![1] - ref.amorfo[1])).toBeLessThan(3);
    expect(Math.abs(r.pico_cm3 / ref.pico - 1)).toBeLessThan(0.03);
  });
  it("42 keV, entre nós, contra uma rodada nova do RustBCA", () => {
    const r = simularImplante(p, bca, { energia_keV: 42, inclinacao: 7, oxido_nativo_nm: 1.5 });
    const ref = F["42.0"];
    expect(Math.abs(r.momentos.media / ref.momentos[0] - 1)).toBeLessThan(0.01);
    expect(Math.abs(r.momentos.desvio / ref.momentos[1] - 1)).toBeLessThan(0.03);
    expect(Math.abs(r.dose_si / ref.dose_si - 1)).toBeLessThan(0.005);
    // no flanco íngreme o erro relativo da concentração exagera; compara a profundidade dos níveis,
    // interpolada em log porque a referência tem um ponto a cada 4 nm
    const cruzamento = (x: ArrayLike<number>, C: ArrayLike<number>, nivel: number) => {
      let k0 = 0;
      for (let k = 1; k < C.length; k++) if (C[k] > C[k0]) k0 = k;
      for (let k = k0; k < C.length; k++)
        if (C[k] < nivel) return x[k - 1] + ((Math.log(C[k - 1]) - Math.log(nivel)) / (Math.log(C[k - 1]) - Math.log(C[k]))) * (x[k] - x[k - 1]);
      return NaN;
    };
    for (const nivel of [1e20, 3e19, 1e19]) expect(Math.abs(cruzamento(r.x_nm, r.C_cm3, nivel) - cruzamento(ref.x, ref.C, nivel))).toBeLessThan(2.5);
    expect(Math.abs(r.pico_cm3 / ref.pico - 1)).toBeLessThan(0.04);
  });
  it("recusa energias fora da tabela em vez de extrapolar", () => {
    expect(() => simularImplante(p, bca, { energia_keV: 150 })).toThrow(ForaDaTabela);
  });
  it("a máscara de 150 nm bloqueia o feixe de 30 keV", () => {
    const r = simularImplante(p, bca, { mascara_nm: 150 });
    expect(r.transmissaoMascara!.limiteSuperior).toBeLessThanOrEqual(1 / 20000);
  });
});

describe("cadeia completa", () => {
  const sim = new Simulador(tabela as unknown as TabelaBCA, dados as Record<string, unknown>);
  it("receita do params.yaml chega a 20 nm de óxido e a uma pilha coerente", () => {
    const r = receitaPadrao(p);
    r.borda.calcular = false;
    const res = sim.simular(r);
    const R = resumo(res);
    expect(Math.abs(res.oxidacao.espessura_nm - 20)).toBeLessThan(0.2);
    expect(res.oxidacao.espessuraCampo_nm).toBeLessThan(res.oxidacao.espessura_nm);
    expect(R.fracaoAtiva).toBeGreaterThan(0.05);
    expect(R.fracaoAtiva).toBeLessThanOrEqual(1);
    expect(R.Cmin_sobre_Cox).toBeGreaterThan(0.5);
    expect(R.Cmin_sobre_Cox).toBeLessThan(1);
    expect(res.provisorios.length).toBeGreaterThan(5);
  });
  it("a borda 2D roda e o P avança sob a máscara", () => {
    const r = receitaPadrao(p);
    r.recozimento.variante = "B_forno";
    const res = sim.simular(r);
    expect(res.borda).not.toBeNull();
    const g = res.borda!.grade;
    let avanco = 0;
    for (let j = 0; j < g.y.length; j++) if (g.y[j] < 0 && res.borda!.juncao.z1e18[j] > 0) avanco = Math.max(avanco, -g.y[j]);
    expect(avanco).toBeGreaterThan(40);
    const ox = res.borda!.oxidacao!.at(-1)!;
    expect(ox.xox[ox.xox.length - 1]).toBeGreaterThan(ox.xox[0]); // óxido mais grosso sobre a porta
  });
});

describe("índices de Sobol na função de Ishigami", () => {
  it("reproduzem os valores analíticos dentro de 0,05", () => {
    const a = 7, b = 0.1;
    const f = (x: number[]) => Math.sin(x[0]) + a * Math.sin(x[1]) ** 2 + b * x[2] ** 4 * Math.sin(x[0]);
    const rng = new Aleatorio(3);
    const N = 20000;
    const sorteio = () => Array.from({ length: N }, () => [0, 1, 2].map(() => rng.uniforme(-Math.PI, Math.PI)));
    const A = sorteio(), B = sorteio();
    const fA = A.map(f), fB = B.map(f);
    const fAB = [0, 1, 2].map((i) => A.map((x, j) => f(x.map((v, k) => (k === i ? B[j][k] : v)))));
    const { S1, ST } = indicesSobol(fA, fB, fAB);
    const V = a * a / 8 + b * Math.PI ** 4 / 5 + b * b * Math.PI ** 8 / 18 + 0.5;
    const V1 = 0.5 * (1 + b * Math.PI ** 4 / 5) ** 2, V2 = a * a / 8, VT3 = 8 * b * b * Math.PI ** 8 / 225;
    expect(Math.abs(S1[0] - V1 / V)).toBeLessThan(0.05);
    expect(Math.abs(S1[1] - V2 / V)).toBeLessThan(0.05);
    expect(Math.abs(S1[2])).toBeLessThan(0.05);
    expect(Math.abs(ST[2] - VT3 / V)).toBeLessThan(0.05);
  });
});
