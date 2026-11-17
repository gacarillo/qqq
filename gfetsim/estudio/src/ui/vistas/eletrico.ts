/**
 * Vista Elétrico: o transistor em operação com V_G varrido ao vivo, histerese por água,
 * campo e tunelamento, bandas da pilha, e as curvas da porta e do canal com a dispersão
 * entre dispositivos.
 */
import { h } from "../dom";
import { painel, botao, campoNumerico, seletor, alternador, metrica } from "../componentes";
import { br, sci, num } from "../formato";
import { loja, melhorResultado } from "@/estado/app";
import { Grafico } from "@/visual/grafico/grafico";
import { Tela } from "@/visual/grafico/tela";
import { desenharBandas, desenharDispositivo, type EstadoOperacao } from "@/visual/operacao/desenhos";
import { Canal, type ParametrosCanal } from "@/fisica/eletrico/transporte";
import { correnteFN } from "@/fisica/eletrico/oxido";
import { capacitanciaQuantica } from "@/fisica/eletrico/grafeno";
import { relaxar } from "@/fisica/eletrico/histerese";
import { interp, linspace } from "@/nucleo/numerico";
import { Aleatorio } from "@/nucleo/aleatorio";
import { carregar } from "@/parametros/parametros";
import { reduzirMovimento } from "../dom";
import type { ResultadoCadeia } from "@/fisica/cadeia";
import type { Vista } from "./tipos";

const q = 1.602176634e-19, hbar = 1.054571817e-34;
const CORES_SAIDA = ["var(--s6)", "var(--s2)", "var(--texto-3)", "var(--s1)", "var(--s5)"];

export function vistaEletrico(): Vista {
  const op = { Vg: 0, dir: 1, varrer: !reduzirMovimento, taxa: 1, acel: 10, Vt: 0, t: 0, hist: [] as [number, number, number][], dispersao: true, ligado: { pocas: true, histerese: true, tunel: true, ilhas: true } };
  let res: ResultadoCadeia | null = null;
  let canal: Canal | null = null;
  let pc: ParametrosCanal | null = null;
  let estado: EstadoOperacao | null = null;
  let curvas: { VG: Float64Array; I: Float64Array; disp: { V: Float64Array; I: Float64Array }[]; saida: { dv: number; vds: Float64Array; I: Float64Array }[]; gm: Float64Array; fT: Float64Array } | null = null;
  const P = carregar(true);

  const aDisp = h("div"), aBanda = h("div");
  let ultimoDt = 0;
  const telaDisp = new Tela(aDisp, { razao: 0.5, alturaMin: 240, alturaMax: 380, rotulo: "Corte do transistor em operação" }, (p) => estado && desenharDispositivo(p, estado, ultimoDt, el));
  const telaBanda = new Tela(aBanda, { razao: 0.62, alturaMin: 240, alturaMax: 360, rotulo: "Diagrama de bandas da pilha" }, (p) => estado && desenharBandas(p, estado, el));
  const gs: Record<string, HTMLElement> = Object.fromEntries(["cv", "tr", "sa", "ca", "ft", "cq"].map((k) => [k, h("div")]));
  const gCV = new Grafico(gs.cv, { x: { rotulo: "V_G (V)" }, y: { rotulo: "C / Cox" }, razao: 0.7, alturaMin: 200, alturaMax: 300 });
  const gTr = new Grafico(gs.tr, { x: { rotulo: "V_G (V)" }, y: { rotulo: "I_D / W (µA/µm)", min: 0 }, razao: 0.7, alturaMin: 200, alturaMax: 300 });
  const gSa = new Grafico(gs.sa, { x: { rotulo: "V_DS (V)", min: 0 }, y: { rotulo: "I_D / W (µA/µm)", min: 0 }, razao: 0.7, alturaMin: 200, alturaMax: 300 });
  const gCa = new Grafico(gs.ca, { x: { rotulo: "V_G (V)" }, y: { rotulo: "E_ox (MV/cm)", min: 0 }, y2: { rotulo: "J_FN (A/cm²)", log: true, min: 1e-30, max: 1e2 }, razao: 0.7, alturaMin: 200, alturaMax: 300 });
  const gFt = new Grafico(gs.ft, { x: { rotulo: "V_G (V)" }, y: { rotulo: "f_T intrínseca (GHz)", min: 0 }, y2: { rotulo: "g_m / W (mS/mm)", min: 0 }, razao: 0.7, alturaMin: 200, alturaMax: 300 });
  const gCq = new Grafico(gs.cq, { x: { rotulo: "V_G (V)" }, y: { rotulo: "capacitância (µF/cm²)", min: 0 }, razao: 0.7, alturaMin: 200, alturaMax: 300 });

  const leituras = h("div", { class: "metricas", style: "grid-template-columns:repeat(auto-fill,minmax(130px,1fr))" });
  const btVarrer = botao(op.varrer ? "Parar a varredura" : "Varrer V_G", () => {
    op.varrer = !op.varrer;
    btVarrer.querySelector("span")!.textContent = op.varrer ? "Parar a varredura" : "Varrer V_G";
  }, { primario: true, icone: "tocar", id: "op-varrer" });
  const cVg = campoNumerico({ rotulo: "V_G manual", unidade: "V", valor: 0, min: -16, max: 16, passo: 0.05, casas: 2, etiqueta: "B", aoMudar: (v) => { op.Vg = v; op.varrer = false; }, aoArrastar: (v) => { op.Vg = v; op.varrer = false; }, id: "op-vg" });
  const cTaxa = campoNumerico({ rotulo: "Taxa de varredura", unidade: "V/s", valor: 1, min: 0.01, max: 100, log: true, etiqueta: "B", aoMudar: (v) => (op.taxa = v), id: "op-taxa" });
  const sAcel = seletor({ rotulo: "Tempo", valor: "10", opcoes: [["1", "real"], ["10", "10 vezes mais rápido"], ["100", "100 vezes mais rápido"]], aoMudar: (v) => (op.acel = +v), id: "op-acel" });
  const alts = h("div", { class: "barra-ferramentas" },
    alternador("poças de carga", true, (v) => { op.ligado.pocas = v; }).el,
    alternador("histerese por água", true, (v) => { op.ligado.histerese = v; op.hist = []; }).el,
    alternador("tunelamento", true, (v) => { op.ligado.tunel = v; }).el,
    alternador("ilhas multicamada (desenho)", true, (v) => { op.ligado.ilhas = v; }).el,
    alternador("40 dispositivos sorteados", true, (v) => { op.dispersao = v; calcularCurvas(); desenharCurvas(); }).el,
  );

  const el = h(
    "div",
    { class: "vista", id: "vista-eletrico" },
    h("div", { class: "grade-principal" },
      painel("Transistor em operação", h("div", { class: "pilha" }, aDisp, h("div", { class: "barra-ferramentas" }, btVarrer), h("div", { class: "grade-3" }, cVg.el, cTaxa.el, sAcel.el), alts)),
      h("div", { class: "pilha" }, painel("Bandas da pilha", aBanda), painel("Leituras", leituras)),
    ),
    h("div", { class: "grade-3" },
      painel("C-V da porta", gs.cv),
      painel("Transferência e histerese", gs.tr),
      painel("Saída", gs.sa),
      painel("Campo e tunelamento", gs.ca),
      painel("Frequência de corte", gs.ft),
      painel("Capacitância quântica e perda no Si", gs.cq),
    ),
    h("p", { class: "nota" }, "A eletrostática vem do Poisson com Fermi-Dirac no Si da porta e da pilha com poças de carga; o transporte, de Jiménez (R42) com R_c por ponto fixo. A histerese é a relaxação de primeira ordem de R47 com α e τ de calibração [B]. Os 40 dispositivos sorteiam mobilidade, n*, R_c, ħΩ e dopagem residual nas faixas do params.yaml."),
  );

  function parametrosCanal(r: ResultadoCadeia): ParametrosCanal {
    const d = r.receita.dispositivo;
    return { mu_m2Vs: d.mu_cm2Vs * 1e-4, rho0_m2: r.receita.eletrico.nEstrela_cm2 * 1e4, RcW_ohm_m: d.RcW_ohm_um * 1e-6, hbarOmega_eV: d.hbarOmega_meV * 1e-3, L_m: d.L_um * 1e-6, vsat: d.vsat };
  }

  function calcularCurvas(): void {
    if (!res || !canal || !pc) return;
    const VD = res.eletrico.V_D, vds = res.receita.dispositivo.VDS_V;
    const VG = linspace(VD - 12, VD + 12, 97);
    const I = canal.transferencia(VG, VD, vds, pc);
    const gm = new Float64Array(VG.length), fT = new Float64Array(VG.length);
    for (let i = 0; i < VG.length; i++) {
      const a = Math.max(0, i - 1), b = Math.min(VG.length - 1, i + 1);
      gm[i] = (I[b] - I[a]) / (VG[b] - VG[a]);
      fT[i] = Math.abs(gm[i]) / (2 * Math.PI * canal.CDe(VG[i] - VD) * pc.L_m);
    }
    const saida = [-6, -3, 0, 3, 6].map((dv) => {
      const v = linspace(0.02, 3, 31);
      return { dv, vds: v, I: canal!.saida(dv, VD, v, pc!) };
    });
    const disp: { V: Float64Array; I: Float64Array }[] = [];
    if (op.dispersao) {
      const rng = new Aleatorio(41);
      const pri = (k: string) => P.incerteza(k)!;
      const mu = pri("eletrico.grafeno.mobilidade.prior_calibracao"), ne = pri("eletrico.grafeno.n_residual.faixa_calibracao"), rc = pri("eletrico.grafeno.resistencia_contato"), om = pri("eletrico.grafeno.hbar_Omega_prior"), dop = pri("eletrico.grafeno.dopagem_residual_prior");
      for (let d = 0; d < 40; d++) {
        const par: ParametrosCanal = { mu_m2Vs: rng.logUniforme(mu.min!, mu.max!) * 1e-4, rho0_m2: rng.logUniforme(ne.min!, ne.max!) * 1e4, RcW_ohm_m: rng.logUniforme(rc.min!, rc.max!) * 1e-6, hbarOmega_eV: rng.uniforme(om.min!, om.max!), L_m: pc.L_m, vsat: pc.vsat };
        const nd = res.receita.eletrico.sinalDop * rng.logUniforme(dop.min!, dop.max!) * 1e4;
        const vd = -canal.VrelDe(nd) + 0; // V_G - V_D que dá n_dop em V_G = 0
        const Vd = linspace(vd - 12, vd + 12, 41);
        disp.push({ V: Vd, I: canal.transferencia(Vd, vd, vds, par) });
      }
    }
    curvas = { VG, I, disp, saida, gm, fT };
  }

  function desenharCurvas(): void {
    if (!res || !curvas || !canal) return;
    const el2 = res.eletrico, VD = el2.V_D;
    const Cox = el2.C_ox_F_cm2;
    gCV.definir({
      series: [
        { nome: "pilha com Si n⁺", x: el2.V, y: Float64Array.from(el2.C_F_cm2, (c) => c / Cox), cor: "var(--p-ativo)" },
        { nome: "mesma pilha, porta metálica", x: el2.V, y: Float64Array.from(el2.C_metal_F_cm2, (c) => c / Cox), cor: "var(--texto-3)", tracejado: [4, 3] },
        { nome: `fora da porta, ${br(res.parasita.espessura_nm, 1)} nm sobre ${sci(res.parasita.fundo_cm3, 1)} cm⁻³`, x: Float64Array.from(res.parasita.V, (v) => v + VD), y: res.parasita.C_sobre_Cox, cor: "var(--s2)", tracejado: [2, 3] },
        ...loja.get().comparacao.map((c) => ({ nome: c.nome, x: c.resultado.eletrico.V, y: Float64Array.from(c.resultado.eletrico.C_F_cm2, (v) => v / c.resultado.eletrico.C_ox_F_cm2), cor: c.cor, tracejado: [5, 3] })),
      ],
    });
    gTr.definir({
      series: [
        ...curvas.disp.map((d, k) => ({ nome: `dispositivo ${k + 1}`, x: d.V, y: Float64Array.from(d.I), cor: "var(--texto-3)", largura: 1, alfa: 0.3, legenda: false })),
        { nome: "sem histerese", x: curvas.VG, y: curvas.I, cor: "var(--texto-2)", largura: 2, unidade: "µA/µm" },
        { nome: "ida", x: op.hist.filter((p) => p[2] > 0).map((p) => p[0]), y: op.hist.filter((p) => p[2] > 0).map((p) => p[1]), cor: "var(--s1)", tipo: "pontos", raio: 1.6 },
        { nome: "volta", x: op.hist.filter((p) => p[2] < 0).map((p) => p[0]), y: op.hist.filter((p) => p[2] < 0).map((p) => p[1]), cor: "var(--s2)", tipo: "pontos", raio: 1.6 },
      ],
      pontos: estado ? [{ x: op.Vg, y: estado.I_Am, cor: op.dir > 0 ? "var(--s1)" : "var(--s2)" }] : [],
    });
    gSa.definir({ series: curvas.saida.map((s, k) => ({ nome: `V_G − V_D = ${s.dv > 0 ? "+" : ""}${s.dv} V`, x: s.vds, y: s.I, cor: CORES_SAIDA[k], unidade: "µA/µm" })), pontos: estado ? [{ x: res.receita.dispositivo.VDS_V, y: estado.I_Am, cor: "var(--texto)" }] : [] });
    const fn = res.constantes.fn;
    const Jfn = Float64Array.from(el2.E_ox_MVcm, (E) => correnteFN(fn, E * 1e8) * 1e-4);
    gCa.definir({
      series: [{ nome: "campo no óxido", x: el2.V, y: el2.E_ox_MVcm, cor: "var(--oxido)", unidade: "MV/cm" }, { nome: "corrente de Fowler e Nordheim", x: el2.V, y: Jfn, cor: "var(--aviso)", eixo: "y2", unidade: "A/cm²" }],
      regioes: [{ eixo: "y", de: res.constantes.ruptura_MVcm[0], ate: res.constantes.ruptura_MVcm[1], cor: "var(--erro)", alfa: 0.15, rotulo: "ruptura, 10 a 13 MV/cm (B1)" }],
      pontos: estado ? [{ x: op.Vg, y: estado.E_Vm / 1e8, cor: "var(--oxido)" }] : [],
    });
    gFt.definir({
      series: [{ nome: "f_T", x: curvas.VG, y: Float64Array.from(curvas.fT, (v) => v / 1e9), cor: "var(--p-ativo)", unidade: "GHz" }, { nome: "g_m", x: curvas.VG, y: Float64Array.from(curvas.gm, (v) => Math.abs(v)), cor: "var(--s5)", eixo: "y2", unidade: "mS/mm" }],
    });
    const cq = Float64Array.from(el2.n_cm2, (n) => capacitanciaQuantica(n * 1e4, P.valor("eletrico.grafeno.vF"), res!.constantes.nEstrela_m2) * 100);
    gCq.definir({
      series: [
        { nome: "C_q do grafeno", x: el2.V, y: cq, cor: "var(--eletron)", unidade: "µF/cm²" },
        { nome: "C total da pilha", x: el2.V, y: Float64Array.from(el2.C_F_cm2, (c) => c * 1e6), cor: "var(--p-ativo)", unidade: "µF/cm²" },
      ],
      marcas: [{ eixo: "y", valor: Cox * 1e6, cor: "var(--oxido)", rotulo: `Cox ${br(Cox * 1e6, 3)} µF/cm²` }],
    });
  }

  function carregar_(): void {
    const r = melhorResultado();
    if (!r || r === res) return;
    res = r;
    canal = new Canal(r.canal.V, r.canal.n, r.canal.C);
    pc = parametrosCanal(r);
    op.hist = [];
    op.Vt = 0;
    if (!op.varrer) op.Vg = r.eletrico.V_D;
    calcularCurvas();
    desenharCurvas();
  }

  function passo(dt: number): void {
    if (!res || !canal || !pc) return;
    const r = res;
    const dts = dt * op.acel;
    const VD0 = r.eletrico.V_D;
    if (op.varrer) {
      op.Vg += op.dir * op.taxa * dts;
      if (op.Vg > VD0 + 7) {
        op.Vg = VD0 + 7;
        op.dir = -1;
      }
      if (op.Vg < VD0 - 7) {
        op.Vg = VD0 - 7;
        op.dir = 1;
      }
      cVg.definir(op.Vg);
    }
    const d = r.receita.dispositivo;
    op.Vt = op.ligado.histerese ? relaxar(op.Vt, op.Vg, VD0, d.alfaHist, d.tauHist_s, dts) : 0;
    const VD = VD0 + op.Vt;
    const Vrel = op.Vg - VD;
    const n = canal.nDe(Vrel);
    const { I, Vint } = canal.corrente(op.Vg, VD, d.VDS_V, pc);
    const E = Math.abs(q * n) / r.constantes.eps_ox;
    const B = r.eletrico.bandas;
    const kk = Math.max(0, Math.min(B.V.length - 2, Math.floor((Vrel + VD0 - B.V[0]) / (B.V[1] - B.V[0]))));
    const tt = Math.max(0, Math.min(1, (Vrel + VD0 - B.V[kk]) / (B.V[1] - B.V[0])));
    const psi = Float64Array.from(B.psi[kk], (v, i) => v * (1 - tt) + B.psi[kk + 1][i] * tt);
    estado = {
      Vg: op.Vg, VD, n_m2: n, E_Vm: E, I_Am: I, Vint, J_Am2: op.ligado.tunel ? correnteFN(r.constantes.fn, E) : 0,
      phi_V: interp(Vrel + VD0, r.eletrico.V, r.eletrico.phi_V), mu_eV: interp(Vrel + VD0, r.eletrico.V, r.eletrico.mu_eV),
      tox_nm: r.oxidacao.espessura_nm, nEstrela_m2: op.ligado.pocas ? r.constantes.nEstrela_m2 : 1e13, rho0_m2: pc.rho0_m2, Vt_hist: op.Vt, alfa: d.alfaHist,
      ruptura_MVcm: r.constantes.ruptura_MVcm, barreira_eV: r.constantes.fn.barreira_eV, eta_superficie: r.eletrico.eta_superficie,
      bandaX_nm: B.x_nm, bandaPsi: psi, C_ox: r.eletrico.C_ox_F_cm2 * 1e4, t: op.t, ligado: op.ligado,
    };
    op.t += dt;
    op.hist.push([op.Vg, I, op.dir]);
    if (op.hist.length > 700) op.hist.shift();
  }

  let tLeit = 0;
  function atualizarLeituras(): void {
    if (!estado || !res || !canal || !pc) return;
    const e = estado;
    const ss = canal.pequenosSinais(e.Vg, e.VD, res.receita.dispositivo.VDS_V, pc);
    const Cn = canal.CDe(e.Vg - e.VD);
    leituras.replaceChildren(
      metrica("V_G", `${br(e.Vg, 2)} V`), metrica("V_D com histerese", `${br(e.VD, 3)} V`), metrica("n no grafeno", `${sci(e.n_m2 / 1e4, 2)} cm⁻²`),
      metrica("E_F − E_D", `${br(e.mu_eV * 1000, 0)} meV`), metrica("C / Cox", br(Cn / (res.eletrico.C_ox_F_cm2 * 1e4), 3)), metrica("curvatura no Si", `${br(e.phi_V * 1000, 1)} mV`),
      metrica("E_ox", `${br(e.E_Vm / 1e8, 2)} MV/cm`, { alerta: e.E_Vm > 0.8 * e.ruptura_MVcm[0] * 1e8 }), metrica("J Fowler-Nordheim", e.J_Am2 * 1e-4 > 1e-30 ? `${sci(e.J_Am2 * 1e-4, 1)} A/cm²` : "abaixo de 10⁻³⁰"),
      metrica("I_D / W", `${br(e.I_Am, 2)} µA/µm`), metrica("R·W total", `${num((res.receita.dispositivo.VDS_V / Math.max(e.I_Am, 1e-12)) * 1e6, 4)} Ω·µm`), metrica("V_DS no canal", `${br(e.Vint, 3)} V`),
      metrica("g_m / W", `${br(Math.abs(ss.gm), 3)} mS/mm`), metrica("f_T intrínseca", `${br(ss.fT / 1e9, 3)} GHz`), metrica("ganho g_m/g_ds", br(ss.ganho, 2)),
      metrica("velocidade de deriva", `${sci(e.I_Am / (q * (Math.abs(e.n_m2) + pc.rho0_m2)), 2)} m/s`), metrica("v_sat local", `${sci((res.receita.dispositivo.hbarOmega_meV * 1e-3 * q) / hbar / Math.sqrt(Math.PI * (Math.abs(e.n_m2) + pc.rho0_m2)), 2)} m/s`),
    );
  }

  loja.assinar((n, a) => {
    if (n.resultado !== a.resultado || n.resultadoBorda !== a.resultadoBorda || n.comparacao !== a.comparacao) {
      if (n.comparacao !== a.comparacao) desenharCurvas();
      carregar_();
    }
  });

  return {
    id: "eletrico",
    titulo: "Elétrico",
    el,
    ativar() {
      carregar_();
      passo(0);
      telaDisp.desenhar();
      telaBanda.desenhar();
      desenharCurvas();
      atualizarLeituras();
    },
    quadro(dt) {
      passo(dt);
      if (!estado) return;
      ultimoDt = dt;
      telaDisp.desenhar();
      ultimoDt = 0;
      telaBanda.desenhar();
      tLeit += dt;
      if (tLeit > 0.2) {
        tLeit = 0;
        atualizarLeituras();
        desenharCurvas();
      }
    },
    exportaveis: () => [
      { nome: "transistor em operação", png: (e) => telaDisp.png(e), svg: () => telaDisp.svg() },
      { nome: "bandas da pilha", png: (e) => telaBanda.png(e), svg: () => telaBanda.svg() },
      { nome: "C-V da porta", png: (e) => gCV.png(e), svg: () => gCV.svg(), csv: () => gCV.csv() },
      { nome: "transferência", png: (e) => gTr.png(e), svg: () => gTr.svg(), csv: () => gTr.csv() },
      { nome: "saída", png: (e) => gSa.png(e), svg: () => gSa.svg(), csv: () => gSa.csv() },
      { nome: "campo e tunelamento", png: (e) => gCa.png(e), svg: () => gCa.svg(), csv: () => gCa.csv() },
      { nome: "frequência de corte", png: (e) => gFt.png(e), svg: () => gFt.svg(), csv: () => gFt.csv() },
      { nome: "capacitância quântica", png: (e) => gCq.png(e), svg: () => gCq.svg(), csv: () => gCq.csv() },
    ],
    telaVideo: () => telaDisp.canvas,
  };
}
