/** Vista Átomos: a cascata de um íon de P e o grafeno sobre SiO2 na escala atômica. */
import { h, aoRedimensionar, reduzirMovimento } from "../dom";
import { painel, botao, seletor, metrica } from "../componentes";
import { br, sci } from "../formato";
import { melhorResultado } from "@/estado/app";
import { Grafico } from "@/visual/grafico/grafico";
import { Canal } from "@/fisica/eletrico/transporte";
import { interp, linspace } from "@/nucleo/numerico";
import type { CenaAtomos, Cascata } from "@/visual/atomos/atomos";
import type { Vista } from "./tipos";

export function vistaAtomos(): Vista {
  const est = { modo: "cascata" as "cascata" | "grafeno", ion: 0, t: 0, tocando: !reduzirMovimento, vel: 1, rede: true, Vg: 0, dir: 1 };
  let cena: CenaAtomos | null = null;
  let cascatas: Cascata[] = [];
  let falha = "";
  let tTexto = 0;
  const canvas = h("canvas", { class: "tela", "aria-label": "Cena atômica 3D", id: "at-tela" });
  const sobre = h("div", { class: "sobreposicao" });
  const palco = h("div", { class: "palco" }, canvas, sobre);
  const cab = h("p", { style: "font:600 17px var(--f-titulo);margin:0" });
  const texto = h("p", { class: "nota", style: "font-size:13px;color:var(--texto-2)" });
  const nums = h("div", { class: "metricas" });
  const nota = h("p", { class: "nota" });
  const gArea = h("div");
  const graf = new Grafico(gArea, { x: { rotulo: "profundidade (nm)", min: 0 }, y: { rotulo: "energia do íon (keV)", min: 0 }, y2: { rotulo: "recuos por faixa", min: 0 }, razao: 0.62, alturaMin: 200, alturaMax: 300 });
  const sCena = seletor({ rotulo: "Cena", valor: "cascata", opcoes: [["cascata", "cascata de um íon de P"], ["grafeno", "grafeno sobre SiO₂ amorfo"]], aoMudar: (v) => { est.modo = v as typeof est.modo; montar(); }, id: "at-cena" });
  const sIon = seletor({ rotulo: "Íon do RustBCA", valor: "0", opcoes: [["0", "íon 1"], ["1", "íon 2"], ["2", "íon 3"]], aoMudar: (v) => { est.ion = +v; montar(); }, id: "at-ion" });
  const sVel = seletor({ rotulo: "Velocidade", valor: "1", opcoes: [["0.3", "lenta"], ["1", "normal"], ["3", "rápida"]], aoMudar: (v) => (est.vel = +v), id: "at-vel" });
  const sRede = seletor({ rotulo: "Rede de diamante", valor: "sim", opcoes: [["sim", "perto da trajetória"], ["nao", "esconder"]], aoMudar: (v) => { est.rede = v === "sim"; cena?.mostrarRede(est.rede); }, id: "at-rede" });
  const btTocar = botao(est.tocando ? "Pausar" : "Tocar", () => {
    est.tocando = !est.tocando;
    btTocar.querySelector("span")!.textContent = est.tocando ? "Pausar" : "Tocar";
  }, { primario: true, icone: "tocar", id: "at-tocar" });
  const el = h(
    "div",
    { class: "vista", id: "vista-atomos" },
    h("div", { class: "grade-principal" },
      painel("Escala atômica", h("div", { class: "pilha" }, palco, h("div", { class: "barra-ferramentas" }, sCena.el, sIon.el, sVel.el, sRede.el, btTocar), nota)),
      h("div", { class: "pilha" }, painel("Leitura", h("div", { class: "pilha" }, cab, texto, nums)), painel("Gráfico", gArea)),
    ),
  );

  async function iniciar(): Promise<void> {
    if (cena || falha) return;
    try {
      const m = await import("@/visual/atomos/atomos");
      await m.carregarThreeAtomos();
      cena = new m.CenaAtomos(canvas, sobre);
      cascatas = m.CASCATAS_BRUTAS.map(m.decodificar);
      aoRedimensionar(palco, (w) => cena?.redimensionar(Math.max(240, w), Math.round(Math.min(600, Math.max(320, w * 0.68)))));
      nota.dataset.fonte = m.FONTE_CASCATAS;
      montar();
    } catch (e) {
      falha = `A cena atômica não abriu neste navegador (${(e as Error).message}).`;
      palco.replaceChildren(h("p", { class: "nota", style: "padding:24px" }, falha));
    }
  }

  function montar(): void {
    if (!cena) return;
    (sIon.el as HTMLElement).style.display = est.modo === "cascata" ? "" : "none";
    (sRede.el as HTMLElement).style.display = est.modo === "cascata" ? "" : "none";
    est.t = 0;
    if (est.modo === "cascata") {
      const c = cascatas[est.ion];
      const Rp = melhorResultado()?.implante.momentos.media ?? 40;
      cena.montarCascata(c, Rp);
      cena.mostrarRede(est.rede);
      nota.textContent = `Um íon de P de 30 keV a 7° com todos os ${c.n.toLocaleString("pt-BR")} recuos de Si que o RustBCA acompanhou, em nm reais (${nota.dataset.fonte ?? ""}). Cada átomo deslocado sai do sítio, deixa uma vacância em vermelho e para como intersticial; a cor clareia com a energia recebida. O BCA trata o alvo como amorfo, então a rede de diamante de 0,543 nm é só referência visual. A cascata é da receita do params.yaml e não muda com a energia escolhida.`;
      graf.o.x.rotulo = "profundidade (nm)";
      graf.o.y.rotulo = "energia do íon (keV)";
      const prof = c.ion.map((p) => -p[1]);
      const zmax = Math.max(...prof) * 1.05;
      const nb = 30, hist = new Float64Array(nb), centros = linspace(zmax / nb / 2, zmax - zmax / nb / 2, nb);
      for (let r = 0; r < c.n; r++) {
        const b = Math.floor((-c.ini[3 * r + 1] / zmax) * nb);
        if (b >= 0 && b < nb) hist[b]++;
      }
      graf.definir({
        series: [
          { nome: "recuos por profundidade de origem", x: centros, y: hist, cor: "var(--lacuna)", tipo: "barras", eixo: "y2", alfa: 0.35 },
          { nome: "energia do íon", x: prof, y: c.ion.map((p) => p[3] / 1000), cor: "#ffd27a", unidade: "keV" },
        ],
      });
    } else {
      const nA = cena.montarGrafeno();
      nota.textContent = `Janela de 20 × 20 nm com ${nA.toLocaleString("pt-BR")} átomos de C a 0,142 nm sobre óxido amorfo, com água na interface e uma ilha de bicamada AB. A cor é a densidade local, a do modelo elétrico na tensão atual mais as poças de carga com amplitude de n* e comprimento ilustrativo [I]. Com nD = 2,2 × 10¹⁰ cm⁻² do seu Raman há um defeito a cada 4.500 nm² em média, cerca de 67 nm entre defeitos, então esta janela quase nunca contém um.`;
      graf.o.x.rotulo = "posição ao longo de z = 0 (nm)";
      graf.o.y.rotulo = "n local (10¹² cm⁻²)";
      est.Vg = melhorResultado()?.eletrico.V_D ?? 0;
    }
  }

  function quadroCascata(dt: number): void {
    if (!cena) return;
    if (est.tocando) {
      est.t += (dt * est.vel) / 9;
      if (est.t > 1.35) est.t = 0;
    }
    const L = cena.passoCascata(est.t);
    tTexto += dt;
    if (tTexto < 0.15) return;
    tTexto = 0;
    const c = cascatas[est.ion];
    cab.textContent = est.t < 1 ? `Íon a ${br(L.prof, 1)} nm, com ${br(L.E / 1000, 1)} keV` : `Íon parado a ${br(L.fim, 1)} nm`;
    texto.textContent = "O P⁺ perde energia por freamento eletrônico, contínuo ao longo do caminho, e por colisões nucleares, que mudam sua direção e lançam átomos de Si. Os recuos mais energéticos abrem subcascatas. Onde as vacâncias se acumulam além do limiar, a rede colapsa em Si amorfo, a camada que a SPE recristaliza depois.";
    nums.replaceChildren(metrica("recuos lançados", L.lancados.toLocaleString("pt-BR"), { etiqueta: "C" }), metrica("total no íon", c.n.toLocaleString("pt-BR"), { etiqueta: "C" }), metrica("energia dos recuos", `${br(L.Etot / 1000, 1)} keV`, { etiqueta: "C" }), metrica("profundidade final", `${br(L.fim, 1)} nm`, { etiqueta: "C" }), metrica("sítios de rede", cena.nRede.toLocaleString("pt-BR")));
  }

  function quadroGrafeno(dt: number): void {
    const res = melhorResultado();
    if (!cena || !res) return;
    const canal = new Canal(res.canal.V, res.canal.n, res.canal.C);
    const VD = res.eletrico.V_D;
    if (est.tocando) {
      est.Vg += est.dir * 1.2 * dt * est.vel;
      if (est.Vg > VD + 4) est.dir = -1;
      if (est.Vg < VD - 4) est.dir = 1;
    }
    const n = canal.nDe(est.Vg - VD);
    const nE = res.constantes.nEstrela_m2;
    tTexto += dt;
    if (tTexto < 0.08) return;
    tTexto = 0;
    cena.colorirGrafeno(n, nE, Math.max(-1, Math.min(1, (est.Vg - VD) / 6)) * 1.1, performance.now() / 1000);
    cab.textContent = `V_G ${br(est.Vg, 2)} V, n médio ${sci(n / 1e4, 1)} cm⁻²`;
    texto.textContent = "Perto do ponto de Dirac a carga média some, mas a desordem do óxido e das impurezas deixa poças de elétrons e de lacunas lado a lado. Longe dele as poças somem diante da carga induzida pela porta. A água ligada ao silanol do SiO₂ gira com o campo e prende carga, o que causa a histerese.";
    nums.replaceChildren(metrica("n*", `${sci(nE / 1e4, 2)} cm⁻²`, { etiqueta: "P" }), metrica("E_F − E_D", `${br(1000 * interp(est.Vg, res.eletrico.V, res.eletrico.mu_eV), 0)} meV`, { etiqueta: "C" }), metrica("ilhas multicamada", "17 % da área", { etiqueta: "B" }), metrica("entre defeitos", "cerca de 67 nm", { etiqueta: "C" }));
    const xs = linspace(-10, 10, 121);
    graf.definir({ series: [{ nome: "n local", x: xs, y: Float64Array.from(xs, (x) => cena!.nLocal(x, 0, n, nE) / 1e16), cor: n > 0 ? "var(--eletron)" : "var(--lacuna)", unidade: "10¹² cm⁻²" }], marcas: [{ eixo: "y", valor: 0, cor: "var(--texto-3)" }] });
  }

  return {
    id: "atomos",
    titulo: "Átomos",
    el,
    ativar() {
      void iniciar();
    },
    quadro(dt) {
      if (!cena) return;
      if (est.modo === "cascata") quadroCascata(dt);
      else quadroGrafeno(dt);
      cena.desenhar();
    },
    exportaveis: () => [...(cena ? [{ nome: `escala atômica ${est.modo}`, png: () => cena!.png() }] : []), { nome: "gráfico da escala atômica", png: (e) => graf.png(e), svg: () => graf.svg(), csv: () => graf.csv() }],
    telaVideo: () => canvas,
  };
}
