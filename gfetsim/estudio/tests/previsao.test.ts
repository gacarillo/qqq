/**
 * Verificação da previsão contra casos com resposta conhecida: álgebra contra a
 * identidade, gradiente da verossimilhança contra diferença finita, validação cruzada em
 * forma fechada contra o reajuste sem o ponto, MCMC contra uma normal correlacionada,
 * autocorrelação contra o AR(1), calibração recuperando um θ verdadeiro, planejamento e
 * otimização em funções de brinquedo, CRPS e CSV.
 */
import { describe, expect, it } from "vitest";
import { cholesky, inversaCholesky, resolverCholesky, Phi, PhiInv, logDetCholesky } from "@/previsao/algebra";
import { ProcessoGaussiano, lmlGradiente, resumoLOO } from "@/previsao/gp";
import { amostrarConjunto, tempoAutocorrelacao } from "@/previsao/mcmc";
import { Emulador, ajustarSaida, planoTreino, dadosDeSaida, type SerialEmulador } from "@/previsao/emulador";
import { Espaco, type ConfigEspaco } from "@/previsao/espaco";
import { calibrar } from "@/previsao/calibracao";
import { prever, probabilidadeSuave } from "@/previsao/preditiva";
import { planejar } from "@/previsao/planejamento";
import { mapaProbabilidade, otimizarReceita } from "@/previsao/otimizacao";
import { crpsAmostral, lerCSV, escreverCSV, placar, wilson } from "@/previsao/caderno";
import { posterioriDaPriori } from "@/previsao/tarefas";
import type { Lote } from "@/previsao/tipos";
import { Aleatorio } from "@/nucleo/aleatorio";
import { carregar } from "@/parametros/parametros";
import { receitaPadrao } from "@/fisica/receita";
import type { NomeSaida, Saida } from "@/fisica/incerteza/montecarlo";

const rng = new Aleatorio(3);

describe("álgebra", () => {
  it("Cholesky, solução e inversa de uma matriz definida positiva", () => {
    const n = 12;
    const B = Float64Array.from({ length: n * n }, () => rng.normal());
    const A = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      let s = i === j ? n : 0;
      for (let k = 0; k < n; k++) s += B[i * n + k] * B[j * n + k];
      A[i * n + j] = s;
    }
    const L = cholesky(A, n)!;
    const Ai = inversaCholesky(L, n);
    let erro = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += A[i * n + k] * Ai[k * n + j];
      erro = Math.max(erro, Math.abs(s - (i === j ? 1 : 0)));
    }
    expect(erro).toBeLessThan(1e-10);
    const b = Float64Array.from({ length: n }, () => rng.normal());
    const x = resolverCholesky(L, n, b);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += A[i * n + k] * x[k];
      expect(s).toBeCloseTo(b[i], 10);
    }
    expect(cholesky(Float64Array.from([1, 2, 2, 1]), 2)).toBeNull();
    expect(logDetCholesky(cholesky(Float64Array.from([4, 0, 0, 9]), 2)!, 2)).toBeCloseTo(Math.log(36), 12);
  });
  it("Φ e Φ⁻¹ são inversas", () => {
    for (const p of [1e-6, 0.01, 0.16, 0.5, 0.84, 0.975, 0.999999]) expect(Phi(PhiInv(p))).toBeCloseTo(p, 6);
    expect(PhiInv(0.975)).toBeCloseTo(1.959964, 4);
  });
});

function f2(x: ArrayLike<number>): number {
  return Math.sin(3 * x[0]) + x[1] * x[1];
}

describe("processo gaussiano", () => {
  const X = planoTreino(40, 2, 9);
  const y = X.map(f2);
  const gp = ProcessoGaussiano.ajustar(X, y, { semente: 2 });
  it("gradiente analítico da verossimilhança igual à diferença finita", () => {
    const n = 15;
    const d = 2;
    const Xf = Float64Array.from(X.slice(0, n).flat());
    const yf = Float64Array.from(y.slice(0, n), (v) => v - 0.3);
    const th = Float64Array.from([Math.log(0.4), Math.log(0.7), 0.2, Math.log(0.05)]);
    const g = new Float64Array(4);
    lmlGradiente(Xf, n, d, yf, th, g);
    for (let k = 0; k < 4; k++) {
      const h = 1e-5;
      const a = Float64Array.from(th);
      const b = Float64Array.from(th);
      a[k] += h;
      b[k] -= h;
      const num = (lmlGradiente(Xf, n, d, yf, a, null) - lmlGradiente(Xf, n, d, yf, b, null)) / (2 * h);
      expect(Math.abs(g[k] - num)).toBeLessThan(1e-5 * Math.max(1, Math.abs(num)));
    }
  });
  it("aprende uma função lisa em duas dimensões", () => {
    let sse = 0;
    for (let k = 0; k < 200; k++) {
      const x = [rng.real(), rng.real()];
      sse += (gp.media(x) - f2(x)) ** 2;
    }
    expect(Math.sqrt(sse / 200)).toBeLessThan(0.03);
    const r = resumoLOO(gp);
    expect(r.Q2).toBeGreaterThan(0.99);
    expect(r.dentro2s).toBeGreaterThan(0.85);
  });
  it("validação cruzada em forma fechada igual ao reajuste sem o ponto", () => {
    const s = gp.serial();
    const { media, desvio } = gp.loo();
    for (const i of [0, 7, 23]) {
      const d = s.d;
      const X2 = s.X.filter((_, k) => Math.floor(k / d) !== i);
      const y2 = s.y.filter((_, k) => k !== i);
      const g2 = ProcessoGaussiano.de({ ...s, X: X2, y: y2 });
      const pr = g2.prever(gp.ponto(i));
      expect(pr.media).toBeCloseTo(media[i], 6);
      expect(Math.sqrt(pr.variancia + gp.ruido ** 2)).toBeCloseTo(desvio[i], 6);
    }
  });
  it("a variância some nos pontos de treino e cresce longe deles", () => {
    const perto = gp.prever(gp.ponto(3)).variancia;
    const longe = gp.prever([3, 3]).variancia;
    expect(perto).toBeLessThan(1e-3);
    expect(longe).toBeGreaterThan(100 * perto);
  });
  it("o plano de treino é um hipercubo latino", () => {
    const P = planoTreino(20, 3, 5);
    for (let k = 0; k < 3; k++) {
      const caixas = new Set(P.slice(1).map((p) => Math.floor(p[k] * 20)));
      expect(caixas.size).toBeGreaterThanOrEqual(18);
      expect(P.every((p) => p[k] >= 0 && p[k] <= 1)).toBe(true);
    }
  });
});

describe("MCMC por conjunto", () => {
  it("amostra uma normal correlacionada", () => {
    const s1 = 1;
    const s2 = 2;
    const rho = 0.8;
    const det = s1 * s1 * s2 * s2 * (1 - rho * rho);
    const logp = (x: Float64Array) => -0.5 * ((s2 * s2 * x[0] * x[0] - 2 * rho * s1 * s2 * x[0] * x[1] + s1 * s1 * x[1] * x[1]) / det);
    const r = amostrarConjunto(logp, (g) => Float64Array.from([g.normal(), g.normal()]), 2, { passos: 2500, semente: 4, maxAmostras: 8000 });
    let m0 = 0, m1 = 0, v0 = 0, v1 = 0, c = 0;
    for (let s = 0; s < r.S; s++) {
      m0 += r.amostras[2 * s];
      m1 += r.amostras[2 * s + 1];
    }
    m0 /= r.S;
    m1 /= r.S;
    for (let s = 0; s < r.S; s++) {
      const a = r.amostras[2 * s] - m0;
      const b = r.amostras[2 * s + 1] - m1;
      v0 += a * a;
      v1 += b * b;
      c += a * b;
    }
    v0 /= r.S;
    v1 /= r.S;
    c /= r.S;
    expect(Math.abs(m0)).toBeLessThan(0.12);
    expect(Math.abs(m1)).toBeLessThan(0.25);
    expect(v0).toBeGreaterThan(0.8);
    expect(v0).toBeLessThan(1.25);
    expect(v1).toBeGreaterThan(3.2);
    expect(v1).toBeLessThan(5);
    expect(c / Math.sqrt(v0 * v1)).toBeCloseTo(0.8, 1);
    expect(Math.max(...r.rhat)).toBeLessThan(1.05);
    expect(r.aceitacao).toBeGreaterThan(0.3);
  });
  it("tempo de autocorrelação de um AR(1)", () => {
    const g = new Aleatorio(8);
    const phi = 0.8;
    const x = new Float64Array(40000);
    for (let t = 1; t < x.length; t++) x[t] = phi * x[t - 1] + g.normal();
    const tau = tempoAutocorrelacao(x);
    expect(tau).toBeGreaterThan(9 * 0.8);
    expect(tau).toBeLessThan(9 * 1.2);
  });
});

/** Emulador de brinquedo: funções analíticas no espaço real, para testar sem a cadeia. */
function emuladorBrinquedo(): { em: Emulador; verdade: (T: number, f: number, Qf: number) => Saida } {
  const p = carregar(true);
  const base = receitaPadrao(p);
  const config: ConfigEspaco = { receita: [{ nome: "T_ox", min: 850, max: 950 }], calib: ["fator_taxa_ox", "Q_f"] };
  const esp = new Espaco(p, base, 13.6, config);
  const verdade = (T: number, f: number, Qf: number) => ({ espessura_ox_nm: 20 * f * Math.exp(0.012 * (T - 900)), V_D: 3 - Qf / 2e11 }) as unknown as Saida;
  const Z = planoTreino(60, 3, 21);
  const Y = Z.map((z) => verdade(esp.vVar(0, z[0]), esp.vCalib(0, z[1]), esp.vCalib(1, z[2])));
  const saidas: NomeSaida[] = ["espessura_ox_nm", "V_D"];
  const serial: SerialEmulador = { versao: 1, chave: esp.chave(), base, tOxBase: 13.6, config, saidas, gps: {}, Z, Y, qualidade: {}, ms: 0 };
  for (const s of saidas) {
    const d = dadosDeSaida(Z, Y, s);
    const r = ajustarSaida(d.Z, d.y, { semente: 1 });
    serial.gps[s] = r.gp;
    serial.qualidade[s] = r.qualidade;
  }
  return { em: new Emulador(esp, serial), verdade };
}

describe("calibração, previsão, planejamento e otimização", () => {
  const { em, verdade } = emuladorBrinquedo();
  const fV = 1.1;
  const qV = 3e11;
  const lotes: Lote[] = [880, 920].map((T, i) => ({
    id: `L${i}`, nome: `lote ${i}`, receita: { T_ox: T }, usarNaCalibracao: true, criado: 0,
    medidas: [
      { id: `e${i}`, grandeza: "espessura_ox_nm", valor: verdade(T, fV, qV).espessura_ox_nm, sigma: 0.15, relativo: false },
      { id: `v${i}`, grandeza: "V_D", valor: verdade(T, fV, qV).V_D, sigma: 0.05, relativo: false },
    ],
  }));
  const disc = { espessura_ox_nm: 0, V_D: 0 };
  const cal = calibrar(em, lotes, disc, { passos: 1200, semente: 3 });
  it("o emulador de brinquedo é exato", () => {
    expect(em.qualidade.get("espessura_ox_nm")!.Q2).toBeGreaterThan(0.999);
    expect(em.qualidade.get("V_D")!.Q2).toBeGreaterThan(0.999);
  });
  it("recupera o θ verdadeiro e estreita a priori", () => {
    const f = cal.resumo.find((r) => r.nome === "fator_taxa_ox")!;
    const q = cal.resumo.find((r) => r.nome === "Q_f")!;
    expect(f.posteriori.p2_5).toBeLessThan(fV);
    expect(f.posteriori.p97_5).toBeGreaterThan(fV);
    expect(Math.abs(f.posteriori.p50 - fV)).toBeLessThan(0.02);
    expect(q.posteriori.p50 / qV).toBeGreaterThan(0.85);
    expect(q.posteriori.p50 / qV).toBeLessThan(1.15);
    expect(f.encolhimento).toBeGreaterThan(0.9);
    expect(cal.diagnostico!.rhat.every((r) => r < 1.1)).toBe(true);
    expect(cal.residuos.every((r) => Math.abs(r.z) < 3)).toBe(true);
  });
  it("prevê um lote novo e a probabilidade de cumprir", () => {
    const pri = posterioriDaPriori(em, 3000, 1);
    const T = 905;
    const r = prever(em, cal.posterior, pri, { T_ox: T }, [{ s: "espessura_ox_nm", min: 21, max: 24, ativa: true }], disc, { n: 3000, semente: 2, semDispersao: true });
    const d = r.posteriori.espessura_ox_nm!;
    const alvo = verdade(T, fV, qV).espessura_ox_nm;
    expect(d.p2_5).toBeLessThan(alvo);
    expect(d.p97_5).toBeGreaterThan(alvo);
    expect(d.p97_5 - d.p2_5).toBeLessThan(r.priori.espessura_ox_nm!.p97_5 - r.priori.espessura_ox_nm!.p2_5);
    expect(r.pEspec!).toBeGreaterThan(0.9);
    expect(r.pEspecPriori!).toBeLessThan(r.pEspec!);
  });
  it("a probabilidade suave cai fora da faixa", () => {
    const z = em.espaco.juntar(em.espaco.unidadeReceita({ T_ox: 900 }), Float64Array.from([em.espaco.uCalib(0, 1), 0.5]));
    expect(probabilidadeSuave(em, z, [{ s: "espessura_ox_nm", min: 19, max: 21, ativa: true }], { espessura_ox_nm: 0.2 })).toBeGreaterThan(0.99);
    expect(probabilidadeSuave(em, z, [{ s: "espessura_ox_nm", min: 25, max: 26, ativa: true }], { espessura_ox_nm: 0.2 })).toBeLessThan(1e-6);
  });
  it("medir o alvo vale mais que medir algo que não depende de θ do alvo", () => {
    const pri = posterioriDaPriori(em, 2000, 5);
    const r = planejar(em, pri, { T_ox: 900 }, "espessura_ox_nm", [
      { grandeza: "espessura_ox_nm", receita: { T_ox: 900 }, rotuloReceita: "alvo", sigma: 0.2, relativo: false },
      { grandeza: "V_D", receita: { T_ox: 900 }, rotuloReceita: "alvo", sigma: 0.05, relativo: false },
      { grandeza: "param:fator_taxa_ox", receita: {}, rotuloReceita: "direto", sigma: 0.01, relativo: true },
    ], { espessura_ox_nm: 0, V_D: 0 }, { semente: 2 });
    const por = new Map(r.itens.map((i) => [i.candidato.grandeza, i.reducao]));
    expect(por.get("espessura_ox_nm")!).toBeGreaterThan(0.6);
    expect(por.get("param:fator_taxa_ox")!).toBeGreaterThan(0.6);
    expect(Math.abs(por.get("V_D")!)).toBeLessThan(0.1);
  });
  it("a receita ótima cai onde a espessura acerta a especificação", () => {
    const specs = [{ s: "espessura_ox_nm" as NomeSaida, min: 21.5, max: 22.5, ativa: true }];
    const r = otimizarReceita(em, cal.posterior, { T_ox: 860 }, specs, { espessura_ox_nm: 0.2 }, { livres: ["T_ox"], semente: 4 });
    expect(Math.abs(r.receita.T_ox! - 900)).toBeLessThan(8);
    expect(r.p).toBeGreaterThan(0.8);
    expect(() => mapaProbabilidade(em, cal.posterior, { T_ox: 900 }, specs, {}, ["T_ox", "T_ox"], { n: 6 })).toThrow();
  });
});

describe("caderno", () => {
  it("CRPS de uma amostra degenerada é o erro absoluto", () => {
    expect(crpsAmostral([2, 2, 2], 5)).toBeCloseTo(3, 12);
    expect(crpsAmostral([0, 1], 0.5)).toBeCloseTo(0.25, 12);
  });
  it("intervalo de Wilson contém a proporção", () => {
    const [a, b] = wilson(7, 10);
    expect(a).toBeLessThan(0.7);
    expect(b).toBeGreaterThan(0.7);
    expect(a).toBeGreaterThan(0.3);
  });
  it("placar mede cobertura e PIT", () => {
    const am = Array.from({ length: 200 }, (_, i) => 10 + (i - 100) / 50);
    const lotes: Lote[] = [8, 9.5, 10, 10.4, 13].map((v, i) => ({
      id: `L${i}`, nome: `L${i}`, receita: {}, usarNaCalibracao: false, criado: 0,
      medidas: [{ id: "m", grandeza: "espessura_ox_nm", valor: v, sigma: 0.1, relativo: false }],
      previsao: { quando: 0, emulador: "", nMedidasCalibracao: 0, pEspec: null, saidas: { espessura_ox_nm: { p2_5: 8.1, p16: 9.4, p50: 10, p84: 10.6, p97_5: 11.9, amostras: am } } },
    }));
    const p = placar(lotes);
    expect(p.n).toBe(5);
    expect(p.cobertura68).toBeCloseTo(3 / 5, 12);
    expect(p.cobertura95).toBeCloseTo(3 / 5, 12);
    expect(p.itens[2].pit).toBeCloseTo(0.505, 2);
    expect(p.pit.reduce((a, b) => a + b, 0)).toBe(5);
  });
  it("CSV de ida e volta", () => {
    const txt = "lote;grandeza;valor;sigma;T_ox\nA;espessura_ox_nm;20,3;0,3;900\nA;V_D;2,1;0,2;900\nB;Rs_final;35;;920\n";
    const r = lerCSV(txt, [], () => ({ sigma: 0.03, relativo: true }));
    expect(r.nMedidas).toBe(3);
    expect(r.lotes).toHaveLength(2);
    expect(r.lotes[0].receita.T_ox).toBe(900);
    expect(r.lotes[0].medidas[0].valor).toBeCloseTo(20.3, 12);
    expect(r.lotes[1].medidas[0].relativo).toBe(true);
    const volta = lerCSV(escreverCSV(r.lotes), [], () => ({ sigma: 0.03, relativo: true }));
    expect(volta.nMedidas).toBe(3);
    expect(volta.lotes[1].medidas[0].sigma).toBeCloseTo(0.03, 12);
  });
});
