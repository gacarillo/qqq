/**
 * Vista Relatório: documento da receita atual, montado a partir do resultado da cadeia,
 * com tabelas, figuras, origem dos valores, ramos e limitações. Exporta um HTML
 * autocontido. O texto segue a regra do usuário, em português, sem datas e sem travessão
 * nem dois-pontos na prosa.
 */
import { h } from "../dom";
import { botao, etiqueta } from "../componentes";
import { br, sci, num } from "../formato";
import { loja, melhorResultado } from "@/estado/app";
import { resumo, type ResultadoCadeia } from "@/fisica/cadeia";
import { NOMES_RAMO, ESCOLHAS } from "@/fisica/receita";
import { Grafico } from "@/visual/grafico/grafico";
import { Campo2D } from "@/visual/corte2d/campo2d";
import { quadrosProcesso } from "@/visual/corte2d/quadros";
import { salvarArquivo, nomeArquivo } from "@/exportar/salvar";
import referencias from "@/dados/referencias.json";
import type { Vista } from "./tipos";

const LIMITACOES = [
  "Canalização. O alvo do RustBCA é amorfo, e o IMSIL não está disponível; o twist da receita não foi informado.",
  "Difusão transiente acelerada (TED). Falta o prefator da dissolução dos defeitos {311}, o que afeta a cauda e pouco a superfície.",
  "Cauda acelerada de Fair e Tsai pela dissociação do par P e vacância.",
  "Aglomerados de P e defeito e sua cinética de desativação abaixo de 700 °C (R12, R12b).",
  "Difusão acelerada pela oxidação (OED) do P durante o óxido de porta.",
  "Estreitamento de banda no Si n⁺ no Poisson da porta.",
  "Difusão lateral durante a oxidação e tensão mecânica na borda; a oxidação 2D é coluna a coluna.",
  "Janela de contato da porta, definição do canal, metal e ordem dos contatos, que não estão na receita e aparecem só como suposição [I] na cena 3D.",
  "Ilhas multicamada (17 % da área no artigo) e trincas do grafeno, que entram só no desenho e não no transporte.",
  "Parâmetros da histerese por água, que só saem de medidas de ida e volta do dispositivo.",
  "Implantação interpolada numa tabela do RustBCA de 2×10⁴ íons por ponto; fora de 5 a 100 keV, 0 a 5 nm de óxido e 0 a 15° o estúdio recusa o cálculo.",
  "Camada amorfa pelo máximo da perda nuclear; no gfetsim em Python esse máximo vem do histograma de 0,5 nm e é sensível ao ruído, como a validação do estúdio mostrou.",
];

export function vistaRelatorio(): Vista {
  const doc = h("article", { class: "relatorio", id: "relatorio-doc" });
  const gP = h("div"), gO = h("div"), gC = h("div"), gM = h("div");
  const fPerfil = new Grafico(gP, { x: { rotulo: "profundidade (nm)", min: 0, max: 250 }, y: { rotulo: "concentração de P (cm⁻³)", log: true, min: 1e15, max: 1e22 }, altura: 300 });
  const fOx = new Grafico(gO, { x: { rotulo: "tempo (min)", min: 0 }, y: { rotulo: "espessura do óxido (nm)", min: 0 }, y2: { rotulo: "fator F", min: 0.8 }, altura: 280 });
  const fCV = new Grafico(gC, { x: { rotulo: "V_G (V)" }, y: { rotulo: "C / Cox" }, altura: 280 });
  const fMapa = new Campo2D(gM, { mapa: "tcad", isolinhas: true, malha: false, materiais: true, escalaReal: true });
  const el = h(
    "div",
    { class: "vista", id: "vista-relatorio" },
    h("div", { class: "barra-ferramentas" }, botao("Baixar o relatório", () => void baixar(), { primario: true, icone: "baixar", id: "rel-baixar" }), h("span", { class: "nota" }, "HTML autocontido, com as figuras embutidas. Abra no navegador para imprimir ou salvar em PDF.")),
    doc,
    h("div", { style: "position:absolute;left:-10000px;top:0;width:900px", "aria-hidden": "true" }, gP, gO, gC, gM),
  );

  function linha(rot: string, val: string, et?: string): HTMLElement {
    return h("tr", null, h("td", null, rot), h("td", { class: "dado" }, val), h("td", null, et ? etiqueta(et) : ""));
  }

  function figuras(res: ResultadoCadeia): void {
    const rz = res.recozimento, ox = res.oxidacao, im = res.implante;
    fPerfil.definir({
      series: [
        { nome: "implantado", x: im.x_nm, y: im.C_cm3, cor: "var(--s5)" },
        { nome: "recozido, total", x: rz.estado.x_nm, y: rz.estado.C, cor: "var(--s2)" },
        { nome: "recozido, ativo", x: rz.estado.x_nm, y: rz.estado.ativo, cor: "var(--s2)", tracejado: [5, 4] },
        ...(ox.metodo === "termico" ? [{ nome: "após o óxido, ativo", x: ox.estado.x_nm, y: ox.estado.ativo, cor: "var(--s1)", tracejado: [5, 4] }] : []),
      ],
      marcas: [{ eixo: "y", valor: rz.n_e, cor: "var(--p-ativo)", rotulo: "n_e" }],
    });
    fOx.definir({ series: ox.metodo === "termico" ? [{ nome: "espessura", x: ox.curva.t, y: ox.curva.x, cor: "var(--s1)" }, { nome: "F", x: ox.curva.t, y: ox.curva.F, cor: "var(--s3)", eixo: "y2" }] : [] });
    const el2 = res.eletrico;
    fCV.definir({ series: [{ nome: "Si n⁺", x: el2.V, y: Float64Array.from(el2.C_F_cm2, (c) => c / el2.C_ox_F_cm2), cor: "var(--p-ativo)" }, { nome: "porta metálica", x: el2.V, y: Float64Array.from(el2.C_metal_F_cm2, (c) => c / el2.C_ox_F_cm2), cor: "var(--texto-3)", tracejado: [4, 3] }] });
    const q = quadrosProcesso(res);
    const fim = q[q.length - 1];
    if (fim) fMapa.definir({ x: fim.x, y: fim.y, v: fim.A, xox: fim.xox ?? undefined, si: fim.si ?? undefined }, { nome: "P ativo", unidade: "cm⁻³", log: true, min: 1e15, max: 3e21, niveis: [1e16, 1e17, 1e18, 1e19, 1e20] });
  }

  function img(src: HTMLCanvasElement | null, legenda: string): HTMLElement {
    return h("figure", null, src ? h("img", { src: src.toDataURL("image/png"), alt: legenda }) : null, h("figcaption", null, legenda));
  }

  function montar(): void {
    const res = melhorResultado();
    if (!res) {
      doc.replaceChildren(h("p", { class: "nota" }, "O relatório aparece quando a cadeia termina."));
      return;
    }
    figuras(res);
    const r = res.receita, R = resumo(res), im = res.implante, rz = res.recozimento, ox = res.oxidacao, el2 = res.eletrico;
    const termico = ox.metodo === "termico";
    const prov = res.provisorios;
    const avancoBorda = (() => {
      if (!res.borda) return null;
      let a = 0;
      res.borda.grade.y.forEach((y, j) => {
        if (y < 0 && res.borda!.juncao.z1e18[j] > 0) a = Math.max(a, -y);
      });
      return a;
    })();
    const sintese = `A receita implanta P a ${br(im.energia_keV, 1)} keV e ${sci(im.dose_cm2, 1)} cm⁻² ${r.implante.variante === "A_mascara" ? `por uma máscara de ${br(r.implante.mascara_nm, 0)} nm` : "na lâmina inteira"}, recristaliza a ${br(r.recozimento.T_spe_C, 0)} °C e ativa ${r.recozimento.variante === "A_rta" ? `por RTA a ${br(r.recozimento.T_rta_C, 0)} °C` : `em forno a ${br(r.recozimento.T_forno_C, 0)} °C`}. ${termico ? `O óxido de porta cresce a ${r.oxidacao.T_C} °C até ${br(ox.espessura_nm, 2)} nm em ${br(ox.t_min ?? 0, 1)} min sobre a porta, e fica com ${br(ox.espessuraCampo_nm, 2)} nm fora dela.` : `O óxido de porta é depositado com ${br(ox.espessura_nm, 1)} nm.`} A pilha resultante perde ${br(100 * R.perdaSi_5e12, 2)} % da capacitância para o Si em 5×10¹² cm⁻² e tem C mínima de ${br(R.Cmin_sobre_Cox, 3)} Cox.`;
    doc.replaceChildren(
      h("h1", null, "Relatório da simulação do GFET de porta local"),
      h("p", null, `Receita ${r.nome}. Gerado pelo gfetsim estúdio a partir dos modelos do gfetsim portados para o navegador e validados contra o pacote em Python.`),
      h("h2", null, "Síntese"),
      h("p", null, sintese),
      h("h2", null, "Receita e ramos"),
      h("table", { class: "tabela" }, h("tbody", null,
        linha("variante do implante", r.implante.variante === "A_mascara" ? "A, máscara e janela" : "B, lâmina inteira", "B"),
        linha("energia, dose e inclinação", `${br(im.energia_keV, 1)} keV, ${sci(im.dose_cm2, 2)} cm⁻², ${br(im.inclinacao, 1)}°`, "B"),
        linha("óxido nativo", `${br(im.oxido_nativo_nm, 1)} nm`, "I"),
        linha("inclinação e borda", NOMES_RAMO[r.implante.ramoSombra], "C"),
        linha("recozimento", r.recozimento.variante === "A_rta" ? `SPE ${r.recozimento.T_spe_C} °C ${r.recozimento.t_spe_min} min e RTA ${r.recozimento.T_rta_C} °C ${r.recozimento.t_rta_s} s` : `SPE ${r.recozimento.T_spe_C} °C ${r.recozimento.t_spe_min} min e forno ${r.recozimento.T_forno_C} °C ${r.recozimento.t_forno_min} min`, "B"),
        linha("desativação", NOMES_RAMO[r.recozimento.ramoDesativacao], "C"),
        linha("óxido de porta", termico ? `seco a ${r.oxidacao.T_C} °C, alvo ${br(r.oxidacao.alvo_nm, 1)} nm` : `sputtering, ${br(r.oxidacao.alvo_nm, 1)} nm`, "B"),
        ...(termico ? [linha("aceleração pela dopagem", NOMES_RAMO[r.oxidacao.ramoAceleracao], "C"), linha("P na interface", NOMES_RAMO[r.oxidacao.ramoInterface], "C")] : []),
        linha("substrato", `${br(r.eletrico.rho_ohm_cm, 3)} Ω·cm, ${sci(res.parasita.fundo_cm3, 2)} cm⁻³`, "B"),
        linha("grafeno", `dopagem residual ${sci(r.eletrico.nDop_cm2, 1)} cm⁻² tipo ${r.eletrico.sinalDop < 0 ? "p" : "n"}, n* ${sci(r.eletrico.nEstrela_cm2, 2)} cm⁻²`, "C"),
        linha("transistor", `L = W = ${br(r.dispositivo.L_um, 1)} µm, µ ${br(r.dispositivo.mu_cm2Vs, 0)} cm²/V·s, Rc·W ${br(r.dispositivo.RcW_ohm_um, 0)} Ω·µm`, "B"),
      )),
      h("h2", null, "Resultados"),
      h("table", { class: "tabela" }, h("tbody", null,
        linha("Rp e ΔRp", `${br(R.Rp_nm, 1)} e ${br(R.dRp_nm, 1)} nm`, "C"),
        linha("pico implantado", `${sci(R.pico_cm3, 2)} cm⁻³`, "C"),
        linha("camada amorfa", im.amorfo_nm ? `${br(im.amorfo_nm[0], 1)} a ${br(im.amorfo_nm[1], 1)} nm` : "não amorfiza", "C"),
        linha("fração ativa após o recozimento", `${br(100 * R.fracaoAtiva, 1)} %`, "C"),
        linha("n_e e C_sat na etapa quente", `${sci(rz.n_e, 2)} e ${sci(rz.C_sat, 2)} cm⁻³`, "P"),
        linha("Rs após o recozimento e no fim", `${br(R.Rs_recozido, 1)} e ${br(R.Rs_final, 1)} Ω/□`, "I"),
        ...(avancoBorda !== null ? [linha("avanço do P ativo sob a máscara a 10¹⁸ cm⁻³", `${br(avancoBorda, 0)} nm`, "C")] : []),
        linha("óxido sobre a porta e fora dela", `${br(R.espessura_nm, 2)} e ${br(R.espessuraCampo_nm, 2)} nm`, termico ? "C" : "B"),
        linha("P ativo na interface", `${sci(R.ativoSuperficie_cm3, 2)} cm⁻³`, "C"),
        linha("tensão de Dirac", `${br(el2.V_D, 3)} V`, "C"),
        linha("C mínima e perda no Si em 5×10¹²", `${br(R.Cmin_sobre_Cox, 3)} Cox e ${br(100 * R.perdaSi_5e12, 2)} %`, "C"),
        linha("campo no óxido em V_D + 5 V", `${br(R.E_ox_VD5, 2)} MV/cm`, "C"),
        linha("faixa de ruptura relativa a V_D", `${br(el2.V_ruptura[0], 1)} a ${br(el2.V_ruptura[1], 1)} V`, "P"),
      )),
      h("h2", null, "Figuras"),
      img(fMapa.png(2), "Corte 2D na borda da máscara no fim do processo, P ativo com isolinhas por década."),
      img(fPerfil.png(2), "Perfis de P no centro da janela. Linhas cheias são P total e tracejadas P ativo; a linha horizontal é n_e na etapa quente."),
      ...(termico ? [img(fOx.png(2), "Crescimento acoplado do óxido de porta e o fator de aceleração F ao longo do tempo.")] : []),
      img(fCV.png(2), "C-V da porta com Si n⁺ comparada à mesma pilha com porta metálica."),
      h("h2", null, "Origem dos valores"),
      h("p", null, `${prov.length} valores provisórios [I] entraram neste cálculo, de ${res.usos.length} parâmetros lidos. Eles estão listados abaixo e no pendencias.md do pacote.`),
      h("ul", null, ...prov.map((k) => h("li", null, h("code", null, k)))),
      ...(Object.keys(r.sobrescrever).length ? [h("p", null, "Valores trocados nesta receita, que passam a valer [B]."), h("ul", null, ...Object.entries(r.sobrescrever).map(([k, v]) => h("li", null, h("code", null, k), ` igual a ${num(v, 4)}`)))] : []),
      h("p", null, "Escolhas de trabalho que não vêm do params.yaml."),
      h("ul", null, ...Object.values(ESCOLHAS).map((t) => h("li", null, t))),
      h("h2", null, "O que o modelo não captura"),
      h("ul", null, ...LIMITACOES.map((t) => h("li", null, t))),
      h("h2", null, "Notas da cadeia"),
      h("ul", null, ...res.notas.map((t) => h("li", null, t))),
      h("h2", null, "Referências"),
      h("p", null, `A tabela completa, com ${Object.keys(referencias).length} entradas e a situação de cada conferência, está na aba Parâmetros e em docs/referencias.md.`),
    );
  }

  async function baixar(): Promise<void> {
    const res = melhorResultado();
    if (!res) return;
    const estilo = `body{font:15px/1.55 system-ui,sans-serif;color:#16202a;max-width:900px;margin:32px auto;padding:0 20px}h1{font-size:26px}h2{font-size:18px;margin-top:28px}table{border-collapse:collapse;width:100%;font-size:13px}td{border-bottom:1px solid #d5dce4;padding:5px 8px;vertical-align:top}td:nth-child(2){font-family:ui-monospace,monospace;white-space:nowrap}.etiqueta{font:600 10px ui-monospace,monospace;padding:1px 4px;border-radius:3px;color:#fff;background:#6f7d8b}.etiqueta.P{background:#1f8a57}.etiqueta.C{background:#1d6ea8}.etiqueta.I{background:#a77708}.etiqueta.B{background:#7a52c4}figure{margin:16px 0}img{width:100%;border:1px solid #d5dce4}figcaption{font-size:13px;color:#475665}code{font-size:12px}`;
    const tema = document.documentElement.getAttribute("data-theme");
    document.documentElement.setAttribute("data-theme", "light");
    montar();
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relatório ${r(res.receita.nome)}</title><style>${estilo}</style></head><body>${doc.innerHTML}</body></html>`;
    if (tema) document.documentElement.setAttribute("data-theme", tema);
    montar();
    await salvarArquivo(nomeArquivo(`relatorio ${res.receita.nome}`, "html"), html);
  }
  const r = (s: string) => s.replace(/[<>&]/g, "");

  loja.assinar((n, a) => {
    if ((n.resultado !== a.resultado || n.resultadoBorda !== a.resultadoBorda) && n.aba === "relatorio") montar();
  });
  return { id: "relatorio", titulo: "Relatório", el, ativar: montar };
}
