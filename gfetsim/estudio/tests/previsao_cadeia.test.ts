/**
 * Emulador treinado na cadeia de verdade: com poucas avaliações ele precisa reproduzir a
 * espessura do óxido e a fração ativa fora dos pontos de treino, e a calibração com um
 * lote sintético gerado pela própria cadeia precisa cobrir o fator verdadeiro.
 */
import { describe, expect, it } from "vitest";
import tabela from "@/dados/tabela_bca.json";
import dados from "@/dados/params.json";
import { Simulador } from "@/fisica/cadeia";
import type { TabelaBCA } from "@/fisica/implante/tabela";
import { receitaPadrao } from "@/fisica/receita";
import { carregar } from "@/parametros/parametros";
import { avaliar, type Saida, type NomeSaida } from "@/fisica/incerteza/montecarlo";
import { Espaco, type ConfigEspaco } from "@/previsao/espaco";
import { Emulador, ajustarSaida, dadosDeSaida, planoTreino, type SerialEmulador } from "@/previsao/emulador";
import { calibrar } from "@/previsao/calibracao";
import type { Lote } from "@/previsao/tipos";

describe("emulador sobre a cadeia completa", () => {
  const sim = new Simulador(tabela as unknown as TabelaBCA, dados as Record<string, unknown>);
  const base = receitaPadrao(carregar(true));
  base.borda.calcular = false;
  const p = sim.parametros(base);
  const nominal = sim.simular(base);
  const tOx = nominal.oxidacao.t_min;
  const config: ConfigEspaco = { receita: [{ nome: "t_ox", min: 6, max: 24 }], calib: ["fator_taxa_ox"] };
  const esp = new Espaco(p, base, tOx, config);
  const rodar = (z: ArrayLike<number>): Saida => {
    const pt = esp.pontoFisico(z);
    return avaliar(p, sim.interpolador, pt.receita, pt.t_ox_min, pt.amostra);
  };
  const Z = planoTreino(14, 2, 3);
  const Y = Z.map(rodar);
  const saidas: NomeSaida[] = ["espessura_ox_nm", "fracao_ativa"];
  const serial: SerialEmulador = { versao: 1, chave: esp.chave(), base, tOxBase: tOx, config, saidas, gps: {}, Z, Y, qualidade: {}, ms: 0 };
  for (const s of saidas) {
    const d = dadosDeSaida(Z, Y, s);
    const r = ajustarSaida(d.Z, d.y, { semente: 2 });
    serial.gps[s] = r.gp;
    serial.qualidade[s] = r.qualidade;
  }
  const em = new Emulador(esp, serial);

  it("o tempo nominal de oxidação existe e cai na faixa do treino", () => {
    expect(tOx).not.toBeNull();
    expect(tOx!).toBeGreaterThan(6);
    expect(tOx!).toBeLessThan(24);
  });
  it("reproduz a espessura fora dos pontos de treino", () => {
    let pior = 0;
    for (const z of [[0.2, 0.3], [0.65, 0.8], [0.9, 0.15]]) {
      const real = rodar(z).espessura_ox_nm;
      pior = Math.max(pior, Math.abs(em.media("espessura_ox_nm", z) - real));
    }
    expect(pior).toBeLessThan(0.35);
    expect(em.qualidade.get("espessura_ox_nm")!.Q2).toBeGreaterThan(0.97);
  }, 30000);
  it("calibra o fator da taxa com um lote sintético da própria cadeia", () => {
    const fV = 1.12;
    const tLote = 15;
    const z = [esp.uVar(0, tLote), esp.uCalib(0, fV)];
    const medido = rodar(z).espessura_ox_nm;
    const lotes: Lote[] = [{ id: "S", nome: "sintético", receita: { t_ox: tLote }, usarNaCalibracao: true, criado: 0, medidas: [{ id: "m", grandeza: "espessura_ox_nm", valor: medido, sigma: 0.2, relativo: false }] }];
    const r = calibrar(em, lotes, { espessura_ox_nm: 0 }, { passos: 900, semente: 5 });
    const f = r.resumo[0];
    expect(f.posteriori.p2_5).toBeLessThan(fV);
    expect(f.posteriori.p97_5).toBeGreaterThan(fV);
    expect(f.encolhimento).toBeGreaterThan(0.7);
  }, 30000);
});
