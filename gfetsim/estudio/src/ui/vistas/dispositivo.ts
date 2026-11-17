/** Vista Dispositivo 3D: o processo inteiro sobre o GFET em 3D, da lâmina à operação. */
import { h, aoRedimensionar, reduzirMovimento } from "../dom";
import { painel, botao, seletor, campoNumerico, metrica } from "../componentes";
import { br, sci } from "../formato";
import { loja, melhorResultado } from "@/estado/app";
import { ETAPAS_3D, DURACAO_3D, estadoProcesso, SUB_TRANSFERENCIA, type Estado3D } from "@/visual/cena3d/processo";
import type { Cena3D, Operacao3D } from "@/visual/cena3d/cena";
import { Canal } from "@/fisica/eletrico/transporte";
import { correnteFN } from "@/fisica/eletrico/oxido";
import { NOMES_RAMO } from "@/fisica/receita";
import type { ResultadoCadeia } from "@/fisica/cadeia";
import type { Vista } from "./tipos";

const VARIANTE: Record<string, string> = { A_rta: "RTA", B_forno: "forno" };

export function vistaDispositivo(): Vista {
  const est = { t: 0.001, tocando: !reduzirMovimento, vel: 1, Vg: 0, dir: 1 };
  let cena: Cena3D | null = null;
  let falha = "";
  let S: Estado3D | null = null;
  let canal: Canal | null = null;
  let res: ResultadoCadeia | null = null;
  let tTexto = 0;
  const canvas = h("canvas", { class: "tela", "aria-label": "Cena 3D do dispositivo; arraste para girar, use a roda ou dois dedos para aproximar", id: "d3-tela" });
  const sobre = h("div", { class: "sobreposicao" });
  const palco = h("div", { class: "palco" }, canvas, sobre);
  const titulo = h("p", { style: "font:600 18px var(--f-titulo);margin:0" });
  const texto = h("p", { class: "nota", style: "font-size:13px;color:var(--texto-2);max-width:70ch" });
  const numeros = h("div", { class: "metricas", style: "grid-template-columns:repeat(auto-fill,minmax(140px,1fr))" });
  const etapas = h("div", { class: "etapas", style: `--n:${ETAPAS_3D.length}` });
  const faixa = h("input", { type: "range", min: 0, max: 1000, value: 0, step: 1, "aria-label": "posição no processo", id: "d3-tempo" });
  const btTocar = botao(est.tocando ? "Pausar" : "Tocar", () => {
    if (!est.tocando && est.t >= DURACAO_3D - 0.01) est.t = 0.001;
    est.tocando = !est.tocando;
    btTocar.querySelector("span")!.textContent = est.tocando ? "Pausar" : "Tocar";
  }, { primario: true, icone: "tocar", id: "d3-tocar" });
  faixa.addEventListener("input", () => (est.t = (+faixa.value / 1000) * DURACAO_3D));
  const botoesEt = ETAPAS_3D.map((e, i) => {
    const b = h("button", { type: "button" }, e.nome, h("small", null, `etapa ${i + 1}`), h("span", { class: "progresso" }));
    b.addEventListener("click", () => (est.t = e.ini + 0.001));
    etapas.append(b);
    return b;
  });
  const cEV = campoNumerico({ rotulo: "Exagero vertical", unidade: "×", valor: 50, min: 5, max: 150, passo: 5, casas: 0, aoMudar: (v) => { if (cena) cena.EV = v; }, aoArrastar: (v) => { if (cena) cena.EV = v; }, id: "d3-ev" });
  const sCorte = seletor({ rotulo: "Corte A−A′", valor: "sim", opcoes: [["sim", "mostrar o interior"], ["nao", "peça inteira"]], aoMudar: (v) => { if (cena) { cena.cortar = v === "sim"; cena.aplicarCorte(); } }, id: "d3-cortar" });
  const sVel = seletor({ rotulo: "Velocidade", valor: "1", opcoes: [["0.5", "0,5×"], ["1", "1×"], ["2", "2×"]], aoMudar: (v) => (est.vel = +v), id: "d3-vel" });
  const cams = h("div", { class: "grupo-botoes" }, ...(["geral", "corte", "cima"] as const).map((c) => botao({ geral: "Vista geral", corte: "Corte A−A′", cima: "De cima" }[c], () => cena?.irPara(c))));
  const el = h(
    "div",
    { class: "vista", id: "vista-dispositivo" },
    h("div", { class: "grade-principal" },
      painel("GFET em 3D", h("div", { class: "pilha" }, palco, h("div", { class: "barra-ferramentas" }, cams), h("div", { class: "grade-3" }, cEV.el, sCorte.el, sVel.el),
        h("p", { class: "nota" }, "Plano em µm reais e vertical multiplicado pelo exagero. W e L vêm da receita, com W = L. A face do corte mostra o perfil de P calculado, do âmbar inativo ao verde-água ativo."))),
      h("div", { class: "pilha" }, painel("Etapa", h("div", { class: "pilha" }, titulo, texto, numeros))),
    ),
    painel("Linha do tempo", h("div", { class: "linha-tempo" }, etapas, faixa, h("div", { class: "barra-ferramentas" }, btTocar))),
  );

  async function iniciar(): Promise<void> {
    if (cena || falha) return;
    try {
      const { Cena3D, carregarThree } = await import("@/visual/cena3d/cena");
      await carregarThree();
      cena = new Cena3D(canvas, sobre);
      montarRotulos();
      aoRedimensionar(palco, (w) => cena?.redimensionar(Math.max(240, w), Math.round(Math.min(600, Math.max(320, w * 0.68)))));
      aplicarReceita();
    } catch (e) {
      falha = `A cena 3D não abriu neste navegador (${(e as Error).message}). As outras vistas funcionam normalmente.`;
      palco.replaceChildren(h("p", { class: "nota", style: "padding:24px" }, falha));
    }
  }

  function montarRotulos(): void {
    if (!cena) return;
    const c = cena;
    sobre.replaceChildren();
    const lista: [string, () => [number, number, number], (S: Estado3D) => boolean][] = [
      ["S", () => [c.layout.S[0][0] + 6, 1, 0], (s) => s.metal > 0.5],
      ["D", () => [c.layout.Dr[0][0] + 6, 1, 0], (s) => s.metal > 0.5],
      ["G", () => [0, 1, c.layout.G[0][1] + 5], (s) => s.metal > 0.5],
      ["Si n⁺", () => [c.layout.a - 2, -0.2, c.layout.b - 2], (s) => !!s.C && s.metal < 0.5 && s.ord >= 3 && s.cu < 0.3],
      ["máscara de SiO₂", () => [-30, (150 * c.EV) / 1000 + 0.5, 18], (s) => s.mascara > 0.5],
      ["grafeno", () => [-26, 0.6, 18], (s) => s.grafeno > 0.5 && s.canal < 0.5],
      ["canal", () => [0, 0.6, c.layout.W / 2 - 1], (s) => s.canal > 0.5],
      ["folha de Cu", () => [-30, 26, 18], (s) => s.cu > 0.3],
      ["PMMA e grafeno", () => [-30, c.yFilme + 1, 18], (s) => s.e.id === "transferencia" && !!s.sub && s.sub.i >= 1 && s.sub.i <= 5],
      ["SiO₂ de porta", () => [c.layout.a - 4, 0.3, -c.layout.b + 2], (s) => s.xoxN > 5 && s.grafeno < 0.5 && s.cu < 0.3],
      ["A", () => [-38, 0.5, 0], () => c.cortar],
      ["A′", () => [38, 0.5, 0], () => c.cortar],
    ];
    c.rotulos = lista.map(([t, p, vis]) => {
      const d = h("div", { class: "rotulo3d" }, t);
      sobre.append(d);
      return { el: d, p, vis };
    });
  }

  function aplicarReceita(): void {
    const r = melhorResultado();
    if (!r || !cena) return;
    res = r;
    canal = new Canal(r.canal.V, r.canal.n, r.canal.C);
    const L = Math.min(30, Math.max(4, r.receita.dispositivo.L_um));
    const masc = r.receita.implante.variante === "A_mascara";
    if (cena.L !== L || cena.comMascara !== masc) {
      cena.L = L;
      cena.comMascara = masc;
      cena.construir();
      montarRotulos();
    }
    est.Vg = r.eletrico.V_D;
  }

  function operacao(dt: number): Operacao3D | null {
    if (!res || !canal || !S || S.e.id !== "operacao") return null;
    const VD = res.eletrico.V_D;
    est.Vg += est.dir * 2 * dt;
    if (est.Vg > VD + 6) est.dir = -1;
    if (est.Vg < VD - 6) est.dir = 1;
    const d = res.receita.dispositivo;
    const pc = { mu_m2Vs: d.mu_cm2Vs * 1e-4, rho0_m2: res.receita.eletrico.nEstrela_cm2 * 1e4, RcW_ohm_m: d.RcW_ohm_um * 1e-6, hbarOmega_eV: d.hbarOmega_meV * 1e-3, L_m: d.L_um * 1e-6, vsat: d.vsat };
    const n = canal.nDe(est.Vg - VD);
    const I = canal.corrente(est.Vg, VD, d.VDS_V, pc).I;
    const E = Math.abs(1.602176634e-19 * n) / res.constantes.eps_ox;
    return { n_m2: n, E_Vm: E, I_Am: I, J_Am2: correnteFN(res.constantes.fn, E), nEstrela_m2: res.constantes.nEstrela_m2, rho0_m2: pc.rho0_m2, ruptura_Vm: res.constantes.ruptura_MVcm[0] * 1e8 };
  }

  function textos(Sx: Estado3D, op: Operacao3D | null): void {
    if (!res) return;
    const r = res, id = Sx.e.id, im = r.implante, rz = r.recozimento, ox = r.oxidacao, rc = r.receita;
    const masc = rc.implante.variante === "A_mascara";
    let t = "";
    let nums: [string, string, string?][] = [];
    if (id === "lamina") {
      t = "Lâmina de Si(100) tipo n. A vista cobre cerca de 76 × 76 µm em torno de um transistor. No plano as dimensões são reais; na vertical, os filmes e as camadas dopadas estão multiplicados pelo exagero.";
      nums = [["resistividade", `${br(rc.eletrico.rho_ohm_cm, 3)} Ω·cm`, "B"], ["fundo", `${sci(r.parasita.fundo_cm3, 1)} cm⁻³`, "I"]];
    } else if (id === "mascara") {
      t = masc ? `Máscara de SiO₂ de ${br(rc.implante.mascara_nm, 0)} nm aberta por litografia no desenho da região n⁺. O retângulo fica sob o canal e o braço leva ao contato da porta. O desenho exato da janela não está na receita e aqui é suposto.` : "Implantação na lâmina inteira, sem máscara. A região n⁺ cobre todo o trecho e a porta fica comum a todos os dispositivos.";
      nums = [["máscara", masc ? `${br(rc.implante.mascara_nm, 0)} nm` : "nenhuma", "B"]];
    } else if (id === "implante") {
      t = `Feixe de P⁺ a ${br(im.energia_keV, 1)} keV inclinado ${br(im.inclinacao, 1)}°. Na janela os íons param em torno de Rp; sobre a máscara param dentro dela. O corte mostra o perfil ainda inativo e a camada amorfa no topo.`;
      nums = [["dose", `${sci(im.dose_cm2 * Sx.dose, 2)} cm⁻²`, "B"], ["Rp", `${br(im.momentos.media, 1)} nm`, "C"], ["camada amorfa", `${br(Sx.amorfo, 0)} nm`, "C"], ["a 10¹⁸ cm⁻³", `${br(Sx.jun, 0)} nm`, "C"], ...(im.transmissaoMascara ? [["passa pela máscara", im.transmissaoMascara.extrapolado ? `< ${sci(im.transmissaoMascara.limiteSuperior, 0)}` : sci(im.transmissaoMascara.valor, 1), "C"] as [string, string, string]] : [])];
    } else if (id === "remocao") {
      t = masc ? "A máscara sai e leva o P que ficou nela. Sobra a região implantada, amorfa no topo e com o P inativo." : "Sem máscara para remover; a lâmina segue para o recozimento.";
      nums = [["P no Si", `${sci(im.dose_si, 2)} cm⁻²`, "C"]];
    } else if (id === "recozimento") {
      t = `A SPE a ${br(rc.recozimento.T_spe_C, 0)} °C recristaliza a camada amorfa e ativa o P preso na frente. Depois vem o ${VARIANTE[rc.recozimento.variante]} a ${br(rz.etapas[1].T_C, 0)} °C, que difunde o P e leva o pico ativo até n_e(T). A lâmina brilha na cor aproximada da temperatura.`;
      nums = [["T", `${br(Sx.T, 0)} °C`, "B"], ["andamento", Sx.tReal, "B"], ["a 10¹⁸ cm⁻³", `${br(Sx.jun, 0)} nm`, "C"], ["Rs final", `${br(rz.Rs_ohm_sq, 1)} Ω/□`, "I"]];
    } else if (id === "oxidacao") {
      t = ox.metodo === "termico" ? `Oxidação seca a ${rc.oxidacao.T_C} °C, Massoud com ${NOMES_RAMO[rc.oxidacao.ramoAceleracao]}. Sobre a porta muito dopada o óxido cresce mais que sobre o substrato, e o degrau aparece na borda da região n⁺.` : `SiO₂ depositado por sputtering, ${br(ox.espessura_nm, 1)} nm, sem consumir Si.`;
      nums = [["óxido sobre n⁺", `${br(Sx.xoxN, 1)} nm`, "C"], ["fora da porta", `${br(Sx.xoxF, 1)} nm`, "C"], ["tempo", Sx.tReal || (ox.t_min ? `${br(ox.t_min, 1)} min` : "depositado"), "C"]];
    } else if (id === "janela") {
      t = "Abertura de uma janela no óxido sobre o braço n⁺ para o contato da porta. O artigo lista esta etapa entre as que ainda serão definidas; a cena mostra só uma corrosão do óxido nessa área.";
      nums = [["janela", "9 × 8 µm", "I"], ["óxido removido", `${br(ox.espessura_nm, 1)} nm`, "C"]];
    } else if (id === "cvd" && Sx.sub) {
      t = Sx.sub.s.txt;
      nums = [["fase", Sx.sub.s.nome, "B"], ["T", `${br(Sx.T, 0)} °C`, "B"], ["pressão", "atmosférica", "B"], ["filme contínuo", "7 × 5 mm", "B"]];
    } else if (id === "transferencia" && Sx.sub) {
      t = `${Sx.sub.s.txt} O grafeno real fica quase invisível sobre 20 nm de óxido, como mostra o modelo de contraste do artigo; aqui ele aparece realçado.`;
      nums = [["passo", `${Sx.sub.i + 1} de ${SUB_TRANSFERENCIA.length}, ${Sx.sub.s.nome}`, "B"], ["T", `${br(Sx.T, 0)} °C`, "B"], ["ilhas multicamada", "17 % da área", "B"], ["defeitos", "2,2×10¹⁰ cm⁻²", "B"]];
    } else if (id === "canal") {
      t = "Definição do canal. A receita não descreve esta etapa, mas sem ela o grafeno ligaria fonte, dreno e porta pela janela. A cena supõe litografia e plasma de O₂ deixando uma faixa de largura W.";
      nums = [["W = L", `${br(rc.dispositivo.L_um, 1)} µm`, "I"]];
    } else if (id === "contatos") {
      t = "Contatos de fonte, dreno e porta. O metal e a espessura não estão na receita; a cena usa 60 nm de um metal dourado só para o desenho. A porta encosta no Si n⁺ pela janela, e fonte e dreno ficam sobre o óxido, em parte sobre a região n⁺, o que soma capacitância parasita.";
      nums = [["metal", "não informado", "B"], ["espessura", "60 nm", "I"]];
    } else {
      t = "O dispositivo ligado com o modelo elétrico da cadeia. V_G varre em torno da tensão de Dirac; elétrons e lacunas atravessam o canal na velocidade de deriva calculada, e as linhas de campo acompanham a carga induzida.";
      if (op) nums = [["V_G", `${br(est.Vg, 2)} V`, "C"], ["n", `${sci(op.n_m2 / 1e4, 2)} cm⁻²`, "C"], ["E_ox", `${br(op.E_Vm / 1e8, 2)} MV/cm`, "C"], ["I_D/W", `${br(op.I_Am, 2)} µA/µm`, "C"]];
    }
    titulo.textContent = Sx.e.nome;
    texto.textContent = t;
    numeros.replaceChildren(...nums.map(([a, b, e]) => metrica(a, b, { etiqueta: e })));
  }

  loja.assinar((n, a) => {
    if (n.resultado !== a.resultado || n.resultadoBorda !== a.resultadoBorda) aplicarReceita();
  });

  return {
    id: "dispositivo",
    titulo: "Dispositivo 3D",
    el,
    ativar() {
      void iniciar().then(aplicarReceita);
    },
    quadro(dt) {
      if (!cena || !res) return;
      if (est.tocando) {
        est.t += dt * est.vel;
        if (est.t >= DURACAO_3D) est.t = ETAPAS_3D[ETAPAS_3D.length - 1].ini + 0.001;
      }
      S = estadoProcesso(res, est.t);
      faixa.value = String(Math.round((est.t / DURACAO_3D) * 1000));
      botoesEt.forEach((b, i) => {
        const e = ETAPAS_3D[i];
        b.setAttribute("aria-current", e === S!.e ? "step" : "false");
        (b.querySelector(".progresso") as HTMLElement).style.width = `${est.t >= e.ini + e.dur ? 100 : e === S!.e ? 100 * S!.u : 0}%`;
      });
      const op = operacao(dt);
      cena.aplicar(S, dt, op, res.implante.inclinacao);
      cena.desenhar();
      cena.atualizarRotulos(S);
      tTexto += dt;
      if (tTexto > 0.25) {
        tTexto = 0;
        textos(S, op);
      }
    },
    exportaveis: () => (cena ? [{ nome: `dispositivo 3D ${S?.e.nome ?? ""}`, png: () => cena!.png() }] : []),
    telaVideo: () => canvas,
  };
}
