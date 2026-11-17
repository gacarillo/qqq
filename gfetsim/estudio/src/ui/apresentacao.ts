/**
 * Modo apresentação: o processo em quadros de tela cheia, montados da receita atual, para
 * banca, grupo ou orientação. Setas e espaço avançam, Esc sai.
 */
import { h } from "./dom";
import { botao, metrica } from "./componentes";
import { br, sci } from "./formato";
import { loja, melhorResultado } from "@/estado/app";
import { resumo, type ResultadoCadeia } from "@/fisica/cadeia";
import { NOMES_RAMO } from "@/fisica/receita";
import { Campo2D } from "@/visual/corte2d/campo2d";
import { quadrosProcesso, type QuadroProcesso } from "@/visual/corte2d/quadros";
import { Grafico } from "@/visual/grafico/grafico";
import { Canal } from "@/fisica/eletrico/transporte";
import { linspace } from "@/nucleo/numerico";

interface Quadro {
  titulo: string;
  texto: string;
  numeros: [string, string, string?][];
  visual: (alvo: HTMLElement) => void;
}

const G_LOG = { unidade: "cm⁻³", log: true, min: 1e15, max: 3e21, niveis: [1e16, 1e17, 1e18, 1e19, 1e20, 1e21] };

function montarQuadros(res: ResultadoCadeia): Quadro[] {
  const R = resumo(res), im = res.implante, rz = res.recozimento, ox = res.oxidacao, el = res.eletrico, rc = res.receita;
  const qs = quadrosProcesso(res);
  const achar = (et: QuadroProcesso["etapa"], ultimo = true) => {
    const l = qs.filter((q) => q.etapa === et);
    return ultimo ? l[l.length - 1] : l[Math.floor(l.length / 2)];
  };
  const mapa = (q: QuadroProcesso | undefined, campo: "C" | "A", nome: string) => (alvo: HTMLElement) => {
    if (!q) return;
    const c = new Campo2D(alvo, { mapa: "tcad", isolinhas: true, malha: false, materiais: true, escalaReal: true });
    c.definir({ x: q.x, y: q.y, v: q[campo], xox: q.xox ?? undefined, si: q.si ?? undefined, mascara_nm: q.mascara_nm, amorfo: q.amorfo ?? undefined, sombra_nm: q.sombra_nm }, { nome, ...G_LOG });
  };
  const termico = ox.metodo === "termico";
  let avanco = 0;
  if (res.borda) res.borda.grade.y.forEach((y, j) => { if (y < 0 && res.borda!.juncao.z1e18[j] > 0) avanco = Math.max(avanco, -y); });
  const canal = new Canal(res.canal.V, res.canal.n, res.canal.C);
  const d = rc.dispositivo;
  const pc = { mu_m2Vs: d.mu_cm2Vs * 1e-4, rho0_m2: rc.eletrico.nEstrela_cm2 * 1e4, RcW_ohm_m: d.RcW_ohm_um * 1e-6, hbarOmega_eV: d.hbarOmega_meV * 1e-3, L_m: d.L_um * 1e-6, vsat: d.vsat };
  return [
    {
      titulo: "GFET de porta local implantada",
      texto: `Uma região n⁺ implantada sob o canal, coberta por ${br(ox.espessura_nm, 1)} nm de SiO₂, faz o papel da porta. A cadeia simula o implante, o recozimento, o óxido e a eletrostática da pilha com os modelos do gfetsim, cada número com a sua etiqueta de origem.`,
      numeros: [["energia e dose", `${br(im.energia_keV, 0)} keV, ${sci(im.dose_cm2, 1)} cm⁻²`, "B"], ["óxido sobre a porta", `${br(ox.espessura_nm, 1)} nm`, termico ? "C" : "B"], ["tensão de Dirac", `${br(el.V_D, 2)} V`, "C"], ["provisórios usados", String(res.provisorios.length), "I"]],
      visual: mapa(qs[qs.length - 1], "A", "P ativo"),
    },
    {
      titulo: "Implantação de P",
      texto: `O feixe de P⁺ entra a ${br(im.inclinacao, 0)}°; a parede da máscara faz sombra na borda e o espalhamento lateral do RustBCA leva P para baixo dela. O topo amorfiza onde a energia nuclear passa do limiar medido a 300 K.`,
      numeros: [["Rp", `${br(R.Rp_nm, 1)} nm`, "C"], ["ΔRp", `${br(R.dRp_nm, 1)} nm`, "C"], ["camada amorfa", `${br(R.amorfo_nm, 0)} nm`, "C"], ["sombra", `${br(res.borda?.ys_nm ?? 0, 1)} nm`, "C"]],
      visual: mapa(achar("implante"), "C", "P total"),
    },
    {
      titulo: "Recristalização a 550 °C",
      texto: "A frente da SPE parte do cristal mais próximo, de baixo para cima no centro e também de lado na borda. O P preso na frente que avança entra em sítio substitucional e fica ativo.",
      numeros: [["SPE completa em", rz.t_spe_s ? `${br(rz.t_spe_s / 60, 1)} min` : "sem amorfo", "I"], ["velocidade", `${br(rz.v_spe_nm_s * 60, 1)} nm/min`, "I"]],
      visual: mapa(achar("spe", false), "A", "P ativo"),
    },
    {
      titulo: rc.recozimento.variante === "A_rta" ? "Ativação por RTA" : "Ativação em forno",
      texto: `A ${br(rz.etapas[1].T_C, 0)} °C o P difunde pelo modelo de Fair e Tsai, nas duas direções. O pico ativo cai até n_e(T) e o excesso acima de C_sat precipita como SiP.`,
      numeros: [["fração ativa", `${br(100 * R.fracaoAtiva, 1)} %`, "C"], ["n_e(T)", `${sci(rz.n_e, 2)} cm⁻³`, "P"], ["Rs", `${br(rz.Rs_ohm_sq, 1)} Ω/□`, "I"], ["avanço sob a máscara", `${br(avanco, 0)} nm`, "C"]],
      visual: mapa(achar("quente"), "A", "P ativo"),
    },
    {
      titulo: "Óxido de porta",
      texto: termico ? `Oxidação seca a ${rc.oxidacao.T_C} °C com ${NOMES_RAMO[rc.oxidacao.ramoAceleracao]}. Sobre a porta muito dopada o óxido cresce mais rápido que sobre o substrato, e a borda da região n⁺ ganha um degrau.` : "Óxido depositado por sputtering reativo, sem consumir Si nem segregar P.",
      numeros: [["sobre a porta", `${br(R.espessura_nm, 2)} nm`, "C"], ["fora da porta", `${br(R.espessuraCampo_nm, 2)} nm`, "C"], ["tempo", ox.t_min ? `${br(ox.t_min, 1)} min` : "depositado", "C"], ["P ativo na interface", `${sci(R.ativoSuperficie_cm3, 2)} cm⁻³`, "C"]],
      visual: mapa(achar("oxidacao"), "A", "P ativo"),
    },
    {
      titulo: "A porta de Si n⁺ contra uma porta metálica",
      texto: "O Si muito dopado ainda deixa um pouco de campo entrar, e parte da capacitância se perde. A C-V calculada pelo Poisson com Fermi-Dirac mostra quanto, comparada à mesma pilha com porta metálica.",
      numeros: [["perda no Si em 5×10¹²", `${br(100 * R.perdaSi_5e12, 2)} %`, "C"], ["C mínima", `${br(R.Cmin_sobre_Cox, 3)} Cox`, "C"], ["carga por volt", `${sci(R.carga_por_volt_cm2, 2)} cm⁻²/V`, "C"]],
      visual: (alvo) => {
        const g = new Grafico(alvo, { x: { rotulo: "V_G (V)" }, y: { rotulo: "C / Cox" }, razao: 0.62, alturaMax: 560 });
        g.definir({ series: [{ nome: "Si n⁺", x: el.V, y: Float64Array.from(el.C_F_cm2, (c) => c / el.C_ox_F_cm2), cor: "var(--p-ativo)", largura: 2.6 }, { nome: "porta metálica", x: el.V, y: Float64Array.from(el.C_metal_F_cm2, (c) => c / el.C_ox_F_cm2), cor: "var(--texto-3)", tracejado: [5, 4], largura: 2 }] });
      },
    },
    {
      titulo: "O transistor",
      texto: `Com L = W = ${br(d.L_um, 0)} µm, mobilidade de ${br(d.mu_cm2Vs, 0)} cm²/V·s e R_c·W de ${br(d.RcW_ohm_um, 0)} Ω·µm, a transferência sai do modelo de Jiménez sobre a eletrostática da pilha.`,
      numeros: [["V_DS", `${br(d.VDS_V, 2)} V`, "B"], ["campo em V_D + 5 V", `${br(R.E_ox_VD5, 2)} MV/cm`, "C"], ["ruptura", `${br(el.V_ruptura[0], 0)} a ${br(el.V_ruptura[1], 0)} V de V_D`, "P"]],
      visual: (alvo) => {
        const g = new Grafico(alvo, { x: { rotulo: "V_G (V)" }, y: { rotulo: "I_D / W (µA/µm)", min: 0 }, razao: 0.62, alturaMax: 560 });
        const VG = linspace(el.V_D - 10, el.V_D + 10, 81);
        g.definir({ series: [0.05, 0.1, 0.5, 1].map((v, k) => ({ nome: `V_DS ${br(v, 2)} V`, x: VG, y: canal.transferencia(VG, el.V_D, v, pc), cor: ["var(--s1)", "var(--s3)", "var(--s2)", "var(--s6)"][k], largura: 2.2 })) });
      },
    },
    {
      titulo: "O que falta medir",
      texto: "Os valores provisórios que mais pesam são as difusividades de Fair e Tsai, a mobilidade de Masetti, n_i(T), a velocidade da SPE e as permissividades. A borda 2D pede medida do degrau de óxido e do avanço do P sob a máscara.",
      numeros: [["valores [I] nesta receita", String(res.provisorios.length), "I"], ["degrau de óxido", `${br(R.espessura_nm - R.espessuraCampo_nm, 1)} nm`, "C"]],
      visual: (alvo) => alvo.append(h("ul", { style: "font-size:17px;line-height:1.7;color:var(--texto-2);max-width:60ch" }, ...res.provisorios.slice(0, 12).map((k) => h("li", null, h("code", null, k))))),
    },
  ];
}

export function abrirApresentacao(): void {
  const res = melhorResultado();
  if (!res) return;
  const quadros = montarQuadros(res);
  let k = 0;
  const titulo = h("h1");
  const texto = h("p", { class: "texto" });
  const visual = h("div", { style: "min-width:0;min-height:0" });
  const nums = h("div", { class: "metricas", style: "grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;font-size:15px" });
  const pos = h("span");
  const fechar = () => {
    raiz.remove();
    window.removeEventListener("keydown", tecla);
    loja.set({ apresentacao: false });
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  };
  const ir = (n: number) => {
    k = Math.max(0, Math.min(quadros.length - 1, n));
    const q = quadros[k];
    titulo.textContent = q.titulo;
    texto.textContent = q.texto;
    visual.replaceChildren();
    q.visual(visual);
    nums.replaceChildren(...q.numeros.map(([a, b, e]) => metrica(a, b, { etiqueta: e })));
    pos.textContent = `${k + 1} de ${quadros.length}`;
  };
  const tecla = (e: KeyboardEvent) => {
    if (e.key === "Escape") fechar();
    else if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
      e.preventDefault();
      ir(k + 1);
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      ir(k - 1);
    }
  };
  const raiz = h(
    "div",
    { class: "apresentacao", role: "dialog", "aria-label": "Apresentação do processo" },
    h("header", null, titulo, texto),
    h("div", { class: "quadro" }, visual, h("div", { style: "display:grid;align-content:start;gap:16px" }, nums)),
    h("footer", { class: "rodape" }, botao("Anterior", () => ir(k - 1)), botao("Próximo", () => ir(k + 1), { primario: true }), pos, h("span", { style: "flex:1" }), h("span", null, "setas para navegar, Esc para sair"), botao("Sair", fechar)),
  );
  document.body.append(raiz);
  loja.set({ apresentacao: true });
  window.addEventListener("keydown", tecla);
  void raiz.requestFullscreen?.().catch(() => {});
  ir(0);
}
