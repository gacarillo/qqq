import { describe, expect, it } from "vitest";
import { carregar } from "@/parametros/parametros";
import { densidadePearson } from "@/fisica/implante/pearson";
import * as si from "@/fisica/recozimento/silicio";
import * as dif from "@/fisica/recozimento/difusao";
import { aplicar, estadoInicial, fracaoAtiva, receitaEtapas, velocidadeSPE } from "@/fisica/recozimento/recozimento";
import * as cin from "@/fisica/oxidacao/cinetica";
import { oxidar, tempoParaAlvo, type RamoAceleracao, type RamoInterface } from "@/fisica/oxidacao/oxidacao";
import { dopagemDeResistividade } from "@/fisica/eletrico/eletrico";
import { cada, erroRel, fixture } from "./ajuda";

const p = carregar(true);

describe("Pearson contra implantacao/pearson.py", () => {
  const F = fixture("pearson");
  const xFull = Array.from({ length: 600 }, (_, i) => 0.25 + 0.5 * i);
  for (const c of F.casos) {
    it(`momentos ${c.momentos.join(", ")} dão Pearson ${c.tipo}`, () => {
      const [media, desvio, assimetria, curtose] = c.momentos;
      const { f, tipo } = densidadePearson(xFull, { media, desvio, assimetria, curtose });
      expect(tipo).toBe(c.tipo);
      expect(erroRel(cada(f, F.passo), c.f, 1e-6 * Math.max(...c.f))).toBeLessThan(1e-9);
    });
  }
});

describe("propriedades do Si contra recozimento/silicio.py", () => {
  const F = fixture("silicio");
  it("ni, n_e e C_sat", () => {
    expect(erroRel(F.T.map((t: number) => si.ni(p, t)), F.ni)).toBeLessThan(1e-12);
    expect(erroRel(F.T.map((t: number) => si.n_e(p, t)), F.n_e)).toBeLessThan(1e-12);
    expect(erroRel(F.T.map((t: number) => si.C_sat(p, t)), F.C_sat)).toBeLessThan(1e-12);
  });
  it("mobilidade de Masetti e o ramo de Qin", () => {
    const ms = si.lerMasetti(p);
    expect(erroRel(F.N.map((n: number) => si.mobilidadeMasetti(ms, n)), F.masetti)).toBeLessThan(1e-12);
    expect(erroRel(F.N.map((n: number) => si.mobilidade(p, n, "limite_inferior_qin")), F.qin)).toBeLessThan(1e-12);
  });
  it("resistência de folha e dopagem pela resistividade", () => {
    const xs = Array.from({ length: 600 }, (_, i) => 0.25 + 0.5 * i);
    const { f } = densidadePearson(xs, { media: 40.1, desvio: 18.4, assimetria: 0.45, curtose: 3.2 });
    const C = Array.from(f, (v) => Math.min(3e15 * 0.99 * v * 1e7, 3e20));
    expect(Math.abs(si.resistenciaFolha(p, xs, C) / F.Rs - 1)).toBeLessThan(1e-10);
    expect(erroRel(F.rho.map((r: number) => dopagemDeResistividade(p, r)), F.dopagem_rho)).toBeLessThan(1e-8);
  });
});

describe("difusão de Fair e Tsai contra recozimento/difusao.py", () => {
  const F = fixture("difusao");
  const x = Array.from({ length: F.C0.length }, (_, i) => 0.5 * i);
  it("difusividade em quatro níveis de n/ni", () => {
    const c = dif.coeficientesFT(p, 1000);
    expect(erroRel([0, 1, 10, 100].map((u) => dif.difusividadeFT(c, u)), F.D_FT)).toBeLessThan(1e-12);
  });
  it("um passo implícito com Picard", () => {
    const out = dif.passoTemporal(dif.contexto(p, 1000), 0.5, F.C0, 5, new Float64Array(F.C0.length));
    expect(erroRel(cada(out, F.passo), F.passo1, 1e14)).toBeLessThan(1e-7);
  });
  it("RTA de 10 s a 1050 °C e forno de 30 min a 900 °C", () => {
    expect(erroRel(cada(dif.difundir(p, x, F.C0, 1050, 10), F.passo), F.rta, 1e14)).toBeLessThan(1e-6);
    expect(erroRel(cada(dif.difundir(p, x, F.C0, 900, 1800), F.passo), F.forno, 1e14)).toBeLessThan(1e-6);
  });
});

describe("recozimento completo contra recozimento/modulo.py", () => {
  const F = fixture("recozimento");
  const perfil = { x_nm: Float64Array.from(F.x), C_cm3: Float64Array.from(F.C), amorfo_nm: F.amorfo as [number, number] };
  it("velocidade da SPE a 550 °C", () => {
    expect(Math.abs(velocidadeSPE(p, 550) / F.v_spe - 1)).toBeLessThan(1e-12);
  });
  for (const [nome, variante, T, ramo] of [["A", "A_rta", undefined, "equilibrio"], ["A_meta", "A_rta", undefined, "metaestavel"], ["B900", "B_forno", 900, "equilibrio"]] as const) {
    it(`variante ${nome}`, () => {
      let e = estadoInicial(perfil);
      for (const et of receitaEtapas(p, variante, T)) e = aplicar(p, e, et, { ramo }).estado;
      const c = F.casos[nome];
      expect(erroRel(cada(e.C, F.passo), c.C, 1e14)).toBeLessThan(1e-6);
      expect(erroRel(cada(e.ativo, F.passo), c.ativo, 1e14)).toBeLessThan(1e-6);
      expect(Math.abs(fracaoAtiva(e) / c.fracao - 1)).toBeLessThan(1e-6);
      expect(Math.abs(si.resistenciaFolha(p, e.x_nm, e.ativo) / c.Rs - 1)).toBeLessThan(1e-6);
    });
  }
});

describe("cinética de oxidação contra oxidacao/cinetica.py", () => {
  const F = fixture("cinetica");
  for (const T of [850, 900, 950]) {
    it(`Massoud, Deal e Grove e Ho e Plummer a ${T} °C`, () => {
      const c = F[String(T)];
      const m = cin.massoud100(p, T);
      for (const k of ["B", "BA", "K1", "K2", "tau1", "tau2"] as const) expect(Math.abs(m[k] / c.massoud[k] - 1)).toBeLessThan(1e-12);
      const dg = cin.dealGrove100(p, T);
      expect(erroRel([dg.B, dg.BA], c.dg)).toBeLessThan(1e-12);
      // contra a solução de tolerância apertada o porte concorda em 1e-7; contra o LSODA padrão
      // do gfetsim a diferença é o erro do próprio LSODA, até 7e-6 no primeiro instante
      expect(erroRel(cin.espessura(p, T, c.t), c.x_preciso)).toBeLessThan(1e-7);
      expect(erroRel(cin.espessura(p, T, c.t), c.x)).toBeLessThan(1e-5);
      expect(erroRel(cin.espessura(p, T, c.t, 0, "massoud", 2.1), c.x_F2)).toBeLessThan(1e-5);
      expect(Math.abs(cin.tempoPara(p, T, 20) / c.t20 - 1)).toBeLessThan(1e-5);
      expect(Math.abs(cin.tempoPara(p, T, 20, 0, "deal_grove") / c.t20_dg - 1)).toBeLessThan(1e-5);
      expect(erroRel([1e17, 1e19, 1e20, 3e20].map((n) => cin.fatorHoPlummer(p, T, n)), c.F_hp)).toBeLessThan(1e-12);
    });
  }
});

describe("oxidação acoplada contra oxidacao/modulo.py", () => {
  const F = fixture("oxidacao");
  const e = { x_nm: Float64Array.from(F.x), C: Float64Array.from(F.C), ativo: Float64Array.from(F.ativo), amorfo_nm: null, historico: [] };
  for (const chave of Object.keys(F.casos)) {
    it(`ramo ${chave}`, () => {
      const [ra, ri] = chave.split("|") as [RamoAceleracao, RamoInterface];
      const r = oxidar(p, e, 900, 12, { ramoAceleracao: ra, ramoInterface: ri });
      const c = F.casos[chave];
      expect(Math.abs(r.espessura_nm / c.xox - 1)).toBeLessThan(1e-9);
      expect(Math.abs(r.siConsumido_nm - c.si)).toBeLessThan(1e-9);
      expect(erroRel(cada(r.estado.C, F.passo), c.C, 1e14)).toBeLessThan(1e-6);
      expect(erroRel(cada(r.estado.ativo, F.passo), c.ativo, 1e14)).toBeLessThan(1e-6);
      expect(erroRel(cada(r.historiaF, 10), c.F)).toBeLessThan(1e-9);
      expect(Math.abs(r.doseNoOxido - c.no_oxido)).toBeLessThanOrEqual(1e-6 * Math.max(1, c.no_oxido));
    });
  }
  it("tempo até 20 nm com o acoplamento completo", () => {
    const { t_min, resultado } = tempoParaAlvo(p, e, 900, 20, { ramoAceleracao: "ho_plummer" });
    expect(Math.abs(t_min / F.alvo.t - 1)).toBeLessThan(1e-5);
    expect(Math.abs(resultado.espessura_nm - F.alvo.xox)).toBeLessThan(1e-3);
  });
});
