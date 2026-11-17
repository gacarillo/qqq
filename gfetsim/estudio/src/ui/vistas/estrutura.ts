/**
 * Vista Estrutura 2D: o corte transversal na borda da máscara ao longo do processo, com a
 * grandeza, o mapa de cor, as ferramentas de corte e o perfil da linha de corte ao lado.
 */
import { h } from "../dom";
import { botao, seletor, alternador, painel, legenda } from "../componentes";
import { br, sci, tempo } from "../formato";
import { loja, melhorResultado } from "@/estado/app";
import { Campo2D, type Corte, type Ferramenta, type Grandeza } from "@/visual/corte2d/campo2d";
import { quadrosProcesso, NOME_ETAPA, type QuadroProcesso } from "@/visual/corte2d/quadros";
import { NOMES_MAPAS, type NomeMapa } from "@/visual/cores/mapas";
import { Grafico } from "@/visual/grafico/grafico";
import { armazenamento } from "@/estado/loja";
import type { Vista } from "./tipos";

type NomeGrandeza = "C" | "A" | "I" | "F";
const GRANDEZAS: Record<NomeGrandeza, Omit<Grandeza, "niveis"> & { niveis: number[]; titulo: string }> = {
  C: { nome: "P total", titulo: "P total", unidade: "cm⁻³", log: true, min: 1e15, max: 3e21, niveis: [1e16, 1e17, 1e18, 1e19, 1e20, 1e21] },
  A: { nome: "P ativo", titulo: "P ativo (doador)", unidade: "cm⁻³", log: true, min: 1e15, max: 3e21, niveis: [1e16, 1e17, 1e18, 1e19, 1e20] },
  I: { nome: "P inativo", titulo: "P inativo (precipitado ou fora de sítio)", unidade: "cm⁻³", log: true, min: 1e15, max: 3e21, niveis: [1e18, 1e19, 1e20, 1e21] },
  F: { nome: "fração ativa", titulo: "fração ativa", unidade: "A/C", log: false, min: 0, max: 1, niveis: [0.25, 0.5, 0.75] },
};

export function vistaEstrutura(): Vista {
  const pref = armazenamento.ler("gfetsim.estrutura", { grandeza: "C" as NomeGrandeza, mapa: "tcad" as NomeMapa, isolinhas: true, malha: false, materiais: true, escalaReal: true });
  let quadros: QuadroProcesso[] = [];
  let indice = 0;
  let tocando = false;
  let acumulado = 0;
  let ferramenta: Ferramenta = "sonda";
  const guardar = () => armazenamento.gravar("gfetsim.estrutura", pref);

  const areaCampo = h("div");
  const grafCorte = h("div");
  const infoQuadro = h("div", { class: "barra-ferramentas" });
  const aviso2D = h("p", { class: "nota" });
  const campo = new Campo2D(areaCampo, { mapa: pref.mapa, isolinhas: pref.isolinhas, malha: pref.malha, materiais: pref.materiais, escalaReal: pref.escalaReal, aoCortar: (c) => mostrarCorte(c) });
  const graf = new Grafico(grafCorte, { x: { rotulo: "profundidade (nm)" }, y: { rotulo: "concentração (cm⁻³)", log: true, min: 1e15, max: 1e22 }, razao: 0.72, alturaMin: 220, alturaMax: 360, nomeArquivo: "corte" });

  const faixa = h("input", { type: "range", min: 0, max: 0, step: 1, value: 0, class: "tempo-faixa", "aria-label": "quadro do processo", id: "estr-quadro" });
  const etapas = h("div", { class: "etapas", style: "--n:4" });
  const btTocar = botao("Tocar", () => alternarTocar(), { icone: "tocar", primario: true, id: "estr-tocar" });
  const alternarTocar = () => {
    tocando = !tocando;
    if (tocando && indice >= quadros.length - 1) indice = 0;
    btTocar.replaceChildren(...botao(tocando ? "Pausar" : "Tocar", () => {}, { icone: tocando ? "pausar" : "tocar" }).childNodes);
  };
  faixa.addEventListener("input", () => {
    indice = +faixa.value;
    mostrar();
  });

  const ferramentas: [Ferramenta, string, string][] = [
    ["sonda", "Sonda", "passe o cursor para ler o valor; clique para um corte vertical"],
    ["corte_v", "Corte vertical", "clique ou arraste para escolher a coluna"],
    ["corte_h", "Corte lateral", "clique numa profundidade para o perfil lateral"],
    ["corte_livre", "Corte livre", "arraste de um ponto a outro"],
    ["regua", "Régua", "arraste para medir"],
    ["mover", "Mover", "arraste para deslocar a vista; Ctrl e a roda aproximam"],
  ];
  const botoesFerr = ferramentas.map(([f, t, d]) => {
    const b = botao(t, () => {
      ferramenta = f;
      campo.definirFerramenta(f);
      botoesFerr.forEach((x, k) => x.setAttribute("aria-pressed", String(ferramentas[k][0] === f)));
    }, { dica: d, pressionado: f === ferramenta });
    return b;
  });

  const selG = seletor<NomeGrandeza>({ valor: pref.grandeza, opcoes: (Object.keys(GRANDEZAS) as NomeGrandeza[]).map((k) => [k, GRANDEZAS[k].titulo]), aoMudar: (v) => { pref.grandeza = v; guardar(); mostrar(); }, id: "estr-grandeza" });
  const selM = seletor<NomeMapa>({ valor: pref.mapa, opcoes: NOMES_MAPAS, aoMudar: (v) => { pref.mapa = v; campo.o.mapa = v; guardar(); mostrar(); }, id: "estr-mapa" });
  const alts = (["isolinhas", "malha", "materiais", "escalaReal"] as const).map((k) => alternador({ isolinhas: "isolinhas por década", malha: "malha", materiais: "materiais", escalaReal: "mesma escala" }[k], pref[k], (v) => { pref[k] = v; campo.o[k] = v; guardar(); campo.desenhar(); }).el);

  const el = h(
    "div",
    { class: "vista", id: "vista-estrutura" },
    h("div", { class: "grade-principal" },
      painel("Corte na borda da máscara", h("div", { class: "pilha" },
        h("div", { class: "barra-ferramentas" }, h("span", { class: "rotulo" }, "Campo"), selG.el, h("span", { class: "rotulo" }, "Cores"), selM.el, ...alts),
        h("div", { class: "barra-ferramentas" }, h("span", { class: "grupo-botoes" }, ...botoesFerr),
          h("span", { class: "grupo-botoes" }, botao("+", () => campo.zoom(1 / 1.4), { dica: "aproximar" }), botao("−", () => campo.zoom(1.4), { dica: "afastar" }), botao("Ajustar", () => campo.ajustar(), { dica: "voltar à vista da borda (duplo clique)" }))),
        areaCampo,
        aviso2D,
      ), [infoQuadro]),
      h("div", { class: "pilha" },
        painel("Perfil na linha de corte", h("div", { class: "pilha" }, grafCorte, h("p", { class: "nota", id: "estr-corte-nota" }, "Clique no corte para escolher a coluna. O perfil mostra P total e P ativo ao longo da linha."))),
        painel("Leitura do quadro", h("div", { id: "estr-leitura", class: "metricas" })),
      ),
    ),
    painel("Linha do tempo do processo", h("div", { class: "linha-tempo" }, etapas, faixa, h("div", { class: "barra-ferramentas" }, btTocar, h("span", { class: "nota", id: "estr-tempo" })))),
  );

  function grandezaAtual(q: QuadroProcesso): { v: Float64Array; g: Grandeza } {
    const def = GRANDEZAS[pref.grandeza];
    const n = q.C.length;
    let v: Float64Array;
    if (pref.grandeza === "C") v = q.C;
    else if (pref.grandeza === "A") v = q.A;
    else if (pref.grandeza === "I") {
      v = new Float64Array(n);
      for (let k = 0; k < n; k++) v[k] = Math.max(q.C[k] - q.A[k], 0);
    } else {
      v = new Float64Array(n);
      for (let k = 0; k < n; k++) v[k] = q.C[k] > 1e15 ? q.A[k] / q.C[k] : NaN;
    }
    return { v, g: { nome: def.nome, unidade: def.unidade, log: def.log, min: def.min, max: def.max, niveis: def.niveis } };
  }

  function mostrarCorte(c: Corte): void {
    const q = quadros[indice];
    if (!q) return;
    // P total e ativo na mesma linha
    const amostrar = (dados: Float64Array) => {
      const ny = q.y.length;
      const out = new Float64Array(c.s.length);
      for (let k = 0; k < c.s.length; k++) {
        const t = k / (c.s.length - 1);
        const yy = c.a[0] + t * (c.b[0] - c.a[0]);
        const xx = c.a[1] + t * (c.b[1] - c.a[1]);
        const j = Math.round((yy - q.y[0]) / (q.y[1] - q.y[0]));
        const jj = Math.max(0, Math.min(ny - 1, j));
        const d = q.si ? q.si[jj] : 0;
        const fi = (xx - d - q.x[0]) / (q.x[1] - q.x[0]);
        if (xx - d < 0) {
          out[k] = NaN;
          continue;
        }
        const i = Math.max(0, Math.min(q.x.length - 2, Math.floor(fi)));
        const ti = Math.max(0, Math.min(1, fi - i));
        out[k] = dados[i * ny + jj] * (1 - ti) + dados[(i + 1) * ny + jj] * ti;
      }
      return out;
    };
    const rot = c.tipo === "v" ? "profundidade (nm)" : c.tipo === "h" ? "lateral y (nm)" : "distância ao longo do corte (nm)";
    graf.o.x.rotulo = rot;
    const res = melhorResultado();
    const marcas = res ? [{ eixo: "y" as const, valor: res.recozimento.n_e, cor: "var(--p-ativo)", rotulo: "n_e" }, { eixo: "y" as const, valor: res.recozimento.C_sat, cor: "var(--p-inativo)", rotulo: "C_sat" }] : [];
    graf.definir({
      series: [
        { nome: "P total", x: c.s, y: amostrar(q.C), cor: "var(--p-inativo)", unidade: "cm⁻³" },
        { nome: "P ativo", x: c.s, y: amostrar(q.A), cor: "var(--p-ativo)", unidade: "cm⁻³" },
      ],
      marcas: q.etapa === "quente" || q.etapa === "oxidacao" ? marcas : [],
    });
    const nota = el.querySelector("#estr-corte-nota");
    if (nota) nota.textContent = c.tipo === "v" ? `Coluna em y = ${br(c.a[0], 0)} nm. ${c.a[0] < 0 ? "Sob a máscara." : "Na janela."}` : c.tipo === "h" ? `Perfil lateral a ${br(c.a[1], 0)} nm de profundidade.` : `Corte de (${br(c.a[0], 0)}, ${br(c.a[1], 0)}) a (${br(c.b[0], 0)}, ${br(c.b[1], 0)}) nm.`;
  }

  function mostrar(): void {
    const q = quadros[indice];
    if (!q) return;
    const { v, g } = grandezaAtual(q);
    campo.definir({ x: q.x, y: q.y, v, xox: q.xox ?? undefined, si: q.si ?? undefined, mascara_nm: q.mascara_nm, amorfo: q.amorfo ?? undefined, sombra_nm: q.sombra_nm }, g);
    faixa.value = String(indice);
    if (!campo.corteAtual) campo.cortar("v", [120, 1], [120, 299]);
    infoQuadro.replaceChildren(h("span", { class: "chip" }, NOME_ETAPA[q.etapa]), h("span", { class: "chip" }, `${br(q.T_C, 0)} °C`), h("span", { class: "chip" }, q.rotulo));
    aviso2D.textContent = q.de2D
      ? "Física 2D da borda. A janela da porta fica à direita de y = 0; a máscara e a sombra do feixe a 7° aparecem na implantação."
      : loja.get().rodando.completo
        ? "A borda 2D ainda está sendo calculada. Por enquanto o perfil 1D do centro da janela aparece estendido na lateral."
        : "Perfil 1D estendido na lateral. A borda 2D só existe na variante A e com o cálculo 2D ligado na receita.";
    const leitura = el.querySelector("#estr-leitura")!;
    const ny = q.y.length;
    const jC = ny - 1;
    let maxC = 0, sumA = 0, sumC = 0;
    for (let i = 0; i < q.x.length; i++) {
      maxC = Math.max(maxC, q.C[i * ny + jC]);
      sumA += q.A[i * ny + jC];
      sumC += q.C[i * ny + jC];
    }
    const xoxC = q.xox ? q.xox[jC] : 0, xoxF = q.xox ? q.xox[0] : 0;
    leitura.replaceChildren(
      ...[
        ["pico no centro", `${sci(maxC, 2)} cm⁻³`],
        ["fração ativa no centro", sumC > 0 ? `${br((100 * sumA) / sumC, 1)} %` : "n/d"],
        ["óxido na janela", q.xox ? `${br(xoxC, 2)} nm` : "sem óxido"],
        ["óxido fora da porta", q.xox ? `${br(xoxF, 2)} nm` : "sem óxido"],
        ["temperatura", `${br(q.T_C, 0)} °C`],
        ["tempo na etapa", tempo(q.t_s)],
      ].map(([a, b]) => h("div", { class: "metrica" }, h("b", null, b), h("span", null, h("em", null, a)))),
    );
    etapas.querySelectorAll("button").forEach((b) => {
      const et = b.dataset.etapa as QuadroProcesso["etapa"];
      const ini = quadros.findIndex((x) => x.etapa === et);
      let fim = -1;
      quadros.forEach((x, k) => {
        if (x.etapa === et) fim = k;
      });
      const atual = q.etapa === et;
      b.setAttribute("aria-current", atual ? "step" : "false");
      const prog = b.querySelector<HTMLElement>(".progresso");
      if (prog) prog.style.width = `${indice > fim ? 100 : atual && fim > ini ? (100 * (indice - ini)) / (fim - ini) : atual ? 100 : 0}%`;
    });
    const tEl = el.querySelector("#estr-tempo");
    if (tEl) tEl.textContent = `quadro ${indice + 1} de ${quadros.length}`;
    const c = campo.corteAtual;
    if (c) mostrarCorte(c);
  }

  function carregarResultado(): void {
    const res = melhorResultado();
    if (!res) return;
    const novo = quadrosProcesso(res);
    const etapaAntes = quadros[indice]?.etapa;
    quadros = novo;
    faixa.max = String(Math.max(0, quadros.length - 1));
    if (indice >= quadros.length || (etapaAntes && quadros[indice]?.etapa !== etapaAntes)) indice = Math.max(0, quadros.length - 1);
    const presentes = [...new Set(quadros.map((x) => x.etapa))];
    etapas.style.setProperty("--n", String(presentes.length));
    etapas.replaceChildren(...presentes.map((et) => {
      const b = h("button", { type: "button", dataset: { etapa: et } }, NOME_ETAPA[et], h("small", null, `${quadros.filter((x) => x.etapa === et).length} quadros`), h("span", { class: "progresso" }));
      b.addEventListener("click", () => {
        indice = quadros.findIndex((x) => x.etapa === et);
        mostrar();
      });
      return b;
    }));
    mostrar();
  }

  loja.assinar((n, a) => {
    if (n.resultado !== a.resultado || n.resultadoBorda !== a.resultadoBorda) carregarResultado();
  });

  return {
    id: "estrutura",
    titulo: "Estrutura 2D",
    el,
    ativar() {
      carregarResultado();
      campo.desenhar();
      void legenda;
    },
    quadro(dt) {
      if (!tocando || quadros.length < 2) return;
      acumulado += dt;
      if (acumulado > 0.45) {
        acumulado = 0;
        if (indice < quadros.length - 1) {
          indice++;
          mostrar();
        } else alternarTocar();
      }
    },
    exportaveis: () => [
      { nome: `corte 2D ${GRANDEZAS[pref.grandeza].nome} ${quadros[indice]?.rotulo ?? ""}`, png: (e) => campo.png(e), svg: () => campo.svg(), csv: () => campo.csv() },
      { nome: "perfil na linha de corte", png: (e) => graf.png(e), svg: () => graf.svg(), csv: () => graf.csv() },
    ],
    telaVideo: () => campo.canvas,
  };
}
