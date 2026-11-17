/**
 * Casca do estúdio: barra superior, receita, área de trabalho com abas, inspetor e
 * console. Liga a receita aos workers de simulação, o laço de animação às vistas e os
 * atalhos de teclado.
 */
import { h, debounce } from "./dom";
import { botao, abrirMenu, abrirModal, aviso, instalarDicas, icone, type ItemMenu } from "./componentes";
import { br } from "./formato";
import { loja, registrar, desfazer, refazer, historico, trocarReceita, projetos, melhorResultado, type Aba } from "@/estado/app";
import { ClienteSimulacao, modoExecucao } from "@/trabalho/cliente";
import { montarReceita } from "./paineis/receita";
import { montarInspetor } from "./paineis/inspetor";
import { salvarArquivo, salvarPNG, nomeArquivo } from "@/exportar/salvar";
import { gravarCanvas, videoDisponivel } from "@/exportar/video";
import type { Vista } from "./vistas/tipos";
import type { Receita } from "@/fisica/receita";

export interface FabricaVistas {
  [id: string]: () => Vista;
}

const ROTULOS: [Aba, string][] = [
  ["estrutura", "Estrutura 2D"],
  ["perfis", "Perfis"],
  ["oxidacao", "Oxidação"],
  ["dispositivo", "Dispositivo 3D"],
  ["eletrico", "Elétrico"],
  ["atomos", "Átomos"],
  ["incerteza", "Incerteza"],
  ["parametros", "Parâmetros"],
  ["relatorio", "Relatório"],
];

export function montarCasca(raiz: HTMLElement, fabricas: FabricaVistas, apresentar: () => void): void {
  instalarDicas(document.body);
  const vistas = new Map<Aba, Vista>();
  const app = h("div", { class: "app" });
  const receitaEl = h("aside", { class: "receita", "aria-label": "Receita de processo", id: "painel-receita" });
  const inspetorEl = h("aside", { class: "inspetor", "aria-label": "Resultados", id: "painel-inspetor" });
  const abasEl = h("div", { class: "abas", role: "tablist", "aria-label": "Vistas" });
  const vistasEl = h("div", { style: "display:grid;min-height:0;min-width:0;overflow:hidden" });
  const trabalho = h("main", { class: "trabalho" }, abasEl, vistasEl);
  const consoleLinhas = h("div", { class: "console-linhas", role: "log", "aria-live": "polite" });
  const consoleEl = h("section", { class: "console recolhido", "aria-label": "Console" });
  const btConsole = botao("Console", () => consoleEl.classList.toggle("recolhido"), { fantasma: true });
  consoleEl.append(h("div", { class: "console-cab" }, btConsole, h("span", { id: "console-resumo", style: "text-transform:none;letter-spacing:0;font:12px var(--f-dado)" })), consoleLinhas);

  // estado da simulação
  const luz = h("span", { class: "luz" });
  const barra = h("span", { class: "barra" }, h("i"));
  const txtEstado = h("span", { class: "rotulo-longo" }, "pronto");
  const estadoEl = h("div", { class: "estado-sim", "aria-live": "polite" }, luz, barra, txtEstado);

  const cliente = new ClienteSimulacao({
    progresso(fase, etapa, fracao) {
      if (fase === "completo" || !loja.get().rodando.completo) loja.set({ progresso: { etapa: fase === "completo" ? `borda 2D, ${etapa}` : etapa, fracao } });
    },
    resultado(fase, r, ms) {
      if (fase === "rapido") {
        loja.set((s) => ({ resultado: r, rodando: { ...s.rodando, rapido: false }, erro: null }));
        registrar("ok", `cadeia 1D em ${br(ms / 1000, 2)} s; óxido ${br(r.oxidacao.espessura_nm, 2)} nm, V_D ${br(r.eletrico.V_D, 3)} V, ${r.provisorios.length} provisórios [I]`);
      } else {
        loja.set((s) => ({ resultadoBorda: r, rodando: { ...s.rodando, completo: false } }));
        registrar("ok", `borda 2D em ${br(ms / 1000, 1)} s (${Object.entries(r.tempos_ms).map(([k, v]) => `${k} ${br(v / 1000, 2)} s`).join(", ")})`);
      }
    },
    erro(fase, msg) {
      loja.set((s) => ({ rodando: { ...s.rodando, [fase]: false }, erro: msg }));
      registrar("erro", `${fase === "rapido" ? "cadeia" : "borda 2D"}: ${msg}`);
      aviso(msg, "erro", 7000);
    },
  });
  const simular = () => {
    const r = loja.get().receita;
    loja.set({ rodando: { rapido: true, completo: r.borda.calcular && r.implante.variante === "A_mascara" }, progresso: { etapa: "implantação", fracao: 0 } });
    registrar("info", `simulando ${r.implante.variante === "A_mascara" ? "variante A" : "variante B"}, ${r.recozimento.variante === "A_rta" ? `RTA ${r.recozimento.T_rta_C} °C` : `forno ${r.recozimento.T_forno_C} °C`}, ${r.oxidacao.metodo === "termico" ? `óxido térmico a ${r.oxidacao.T_C} °C` : "óxido depositado"}`);
    cliente.simular(r);
  };
  const simularDepois = debounce(simular, 380);
  loja.observar((s) => s.receita, () => {
    if (loja.get().automatico) simularDepois();
  }, false);
  loja.assinar((n, a) => {
    if (n.rodando === a.rodando && n.progresso === a.progresso && n.erro === a.erro) return;
    const rod = n.rodando.rapido || n.rodando.completo;
    luz.className = `luz${rod ? " rodando" : n.erro ? " erro" : ""}`;
    (barra.firstChild as HTMLElement).style.width = `${rod ? Math.round(100 * n.progresso.fracao) : 100}%`;
    txtEstado.textContent = rod ? n.progresso.etapa : n.erro ? "erro, veja o console" : "pronto";
  });
  loja.assinar((n, a) => {
    if (n.log === a.log) return;
    const novas = n.log.slice(a.log.length > n.log.length ? 0 : a.log.length);
    for (const l of novas) consoleLinhas.append(h("div", { class: l.nivel }, h("time", null, new Date(l.t).toLocaleTimeString("pt-BR")), l.texto));
    while (consoleLinhas.childElementCount > 300) consoleLinhas.firstElementChild?.remove();
    consoleLinhas.scrollTop = consoleLinhas.scrollHeight;
    const ult = n.log.at(-1);
    const res = document.getElementById("console-resumo");
    if (res && ult) res.textContent = ult.texto;
  });

  // barra superior
  const btDesfazer = botao("", () => desfazer(), { icone: "desfazer", fantasma: true, dica: "desfazer (Ctrl+Z)" });
  const btRefazer = botao("", () => refazer(), { icone: "refazer", fantasma: true, dica: "refazer (Ctrl+Shift+Z)" });
  loja.observar((s) => s.receita, () => {
    btDesfazer.disabled = !historico.podeDesfazer;
    btRefazer.disabled = !historico.podeRefazer;
  });
  const btAuto = botao("Automático", () => {
    loja.set((s) => ({ automatico: !s.automatico }));
    btAuto.setAttribute("aria-pressed", String(loja.get().automatico));
  }, { pressionado: true, dica: "simular a cada mudança da receita" });
  const btSimular = botao("Simular", () => simular(), { primario: true, icone: "tocar", atalho: "Ctrl↵", id: "bt-simular" });
  const btExportar = botao("Exportar", () => abrirMenu(btExportar, itensExportar()), { icone: "baixar", id: "bt-exportar" });
  const btProjeto = botao("Projeto", () => abrirMenu(btProjeto, itensProjeto()), { id: "bt-projeto" });
  const btApresentar = botao("Apresentar", () => apresentar(), { icone: "tela", dica: "modo apresentação, passo a passo do processo" });
  const btTema = botao("", () => loja.set((s) => ({ tema: s.tema === "escuro" ? "claro" : "escuro" })), { icone: "tema", fantasma: true, dica: "tema claro ou escuro" });
  const btInspetor = botao("", () => app.classList.toggle("inspetor-aberto"), { icone: "painel", fantasma: true, dica: "mostrar ou esconder os resultados" });
  const btReceita = botao("Receita", () => app.classList.toggle("receita-aberta"), { icone: "menu", id: "bt-receita" });
  btReceita.classList.add("so-celular");
  const topo = h(
    "header",
    { class: "topo" },
    btReceita,
    h("div", { class: "marca" }, h("b", null, "gfetsim estúdio"), h("span", null, "GFET de porta local, LME e PSI da EPUSP")),
    btSimular,
    btAuto,
    h("span", { class: "grupo-botoes" }, btDesfazer, btRefazer),
    estadoEl,
    h("span", { class: "espaco" }),
    btProjeto,
    btExportar,
    btApresentar,
    btInspetor,
    btTema,
  );
  loja.observar((s) => s.tema, (t) => document.documentElement.setAttribute("data-theme", t === "escuro" ? "dark" : "light"));
  loja.observar((s) => s.tema, () => vistas.forEach((v) => v.ativar?.()), false);

  // abas e vistas
  const botoesAba = new Map<Aba, HTMLButtonElement>();
  for (const [id, rot] of ROTULOS) {
    const b = h("button", { type: "button", role: "tab", id: `aba-${id}`, "aria-selected": "false", "aria-controls": `vista-${id}` }, rot);
    b.addEventListener("click", () => irPara(id));
    botoesAba.set(id, b);
    abasEl.append(b);
  }
  abasEl.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const atual = ROTULOS.findIndex(([id]) => id === loja.get().aba);
    const prox = ROTULOS[(atual + (e.key === "ArrowRight" ? 1 : ROTULOS.length - 1)) % ROTULOS.length][0];
    irPara(prox);
    botoesAba.get(prox)?.focus();
  });
  let vistaAtual: Vista | null = null;
  function obterVista(id: Aba): Vista {
    let v = vistas.get(id);
    if (!v) {
      v = fabricas[id]();
      v.el.hidden = true;
      vistasEl.append(v.el);
      vistas.set(id, v);
    }
    return v;
  }
  function irPara(id: Aba, atualizarHash = true): void {
    if (vistaAtual && vistaAtual.id !== id) {
      vistaAtual.desativar?.();
      vistaAtual.el.hidden = true;
    }
    const v = obterVista(id);
    v.el.hidden = false;
    vistaAtual = v;
    botoesAba.forEach((b, k) => b.setAttribute("aria-selected", String(k === id)));
    loja.set({ aba: id });
    v.ativar?.();
    app.classList.remove("receita-aberta");
    if (atualizarHash) {
      try {
        history.replaceState(null, "", `#${id}`);
      } catch {
        /* moldura sem histórico */
      }
    }
  }
  window.addEventListener("hashchange", () => {
    const id = location.hash.slice(1) as Aba;
    if (ROTULOS.some(([a]) => a === id)) irPara(id, false);
  });

  // exportação
  function itensExportar(): ItemMenu[] {
    const itens: ItemMenu[] = [];
    const ex = vistaAtual?.exportaveis?.() ?? [];
    for (const e of ex) {
      if (e.png) itens.push({ texto: `${e.nome}`, detalhe: "PNG 3×", acao: () => void salvarPNG(nomeArquivo(e.nome, "png"), e.png!(3)) });
      if (e.svg) itens.push({ texto: `${e.nome}`, detalhe: "SVG", acao: () => void salvarArquivo(nomeArquivo(e.nome, "svg"), e.svg!()) });
      if (e.csv) itens.push({ texto: `${e.nome}`, detalhe: "CSV", acao: () => void salvarArquivo(nomeArquivo(e.nome, "csv"), e.csv!()) });
      itens.push({ texto: "", separador: true });
    }
    const tela = vistaAtual?.telaVideo?.();
    if (tela && videoDisponivel()) itens.push({ texto: "Vídeo desta vista, 12 s", detalhe: "WebM", acao: () => void gravar(tela) });
    itens.push({ texto: "Resultado completo da receita", detalhe: "JSON", acao: () => exportarResultado() });
    itens.push({ texto: "Relatório da receita", detalhe: "HTML", acao: () => irPara("relatorio") });
    return itens;
  }
  async function gravar(tela: HTMLCanvasElement): Promise<void> {
    aviso("gravando 12 s da vista atual");
    registrar("info", "gravação de vídeo iniciada");
    await gravarCanvas(tela, 12, nomeArquivo(`video ${vistaAtual?.titulo ?? ""}`, "webm"), () => document.dispatchEvent(new CustomEvent("gfetsim:gravar")));
    registrar("ok", "gravação de vídeo concluída");
  }
  function exportarResultado(): void {
    const r = melhorResultado();
    if (!r) return aviso("ainda não há resultado", "erro");
    const json = JSON.stringify(r, (_k, v) => (v instanceof Float64Array || v instanceof Uint8Array ? Array.from(v, (x) => Number(x.toPrecision(6))) : v));
    void salvarArquivo(nomeArquivo(`resultado ${r.receita.nome}`, "json"), json);
  }

  // projetos
  function itensProjeto(): ItemMenu[] {
    const lista = projetos.listar();
    return [
      { texto: "Salvar receita neste navegador", acao: () => salvarProjeto() },
      { texto: "Baixar receita", detalhe: "JSON", acao: () => void salvarArquivo(nomeArquivo(loja.get().receita.nome, "json"), JSON.stringify({ formato: "gfetsim-receita", versao: 1, receita: loja.get().receita }, null, 1)) },
      { texto: "Abrir arquivo de receita", acao: () => importarProjeto() },
      { texto: "Fixar como cenário de comparação", acao: () => fixarCenario() },
      { texto: "Limpar cenários fixados", acao: () => loja.set({ comparacao: [] }), desativado: loja.get().comparacao.length === 0 },
      ...(lista.length ? [{ texto: "", separador: true }] : []),
      ...lista.slice(0, 10).map((p) => ({ texto: p.nome, detalhe: new Date(p.quando).toLocaleDateString("pt-BR"), acao: () => { trocarReceita(p.receita); aviso(`receita ${p.nome} aberta`); } })),
    ];
  }
  function salvarProjeto(): void {
    const entrada = h("input", { class: "entrada-texto", value: loja.get().receita.nome, style: "width:100%", id: "nome-projeto" });
    abrirModal("Salvar receita", h("div", { class: "campo" }, h("label", { class: "campo-rotulo", for: "nome-projeto" }, "Nome"), entrada, h("p", { class: "nota" }, "Fica guardada só neste navegador. Para levar a outro computador, use Baixar receita.")), [
      { texto: "Cancelar" },
      { texto: "Salvar", primario: true, acao: () => {
        const nome = entrada.value.trim() || "receita sem nome";
        const r = { ...loja.get().receita, nome };
        trocarReceita(r, false);
        projetos.salvar(nome, r);
        aviso(`receita ${nome} salva`, "ok");
      } },
    ]);
  }
  function importarProjeto(): void {
    const arq = h("input", { type: "file", accept: ".json,application/json" });
    arq.addEventListener("change", async () => {
      const f = arq.files?.[0];
      if (!f) return;
      try {
        const d = JSON.parse(await f.text()) as { formato?: string; receita?: Receita };
        if (d.formato !== "gfetsim-receita" || !d.receita) throw new Error("o arquivo não é uma receita do gfetsim estúdio");
        trocarReceita(d.receita);
        aviso(`receita ${d.receita.nome} aberta`, "ok");
      } catch (e) {
        aviso((e as Error).message, "erro");
      }
    });
    arq.click();
  }
  const CORES = ["var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)"];
  function fixarCenario(): void {
    const r = melhorResultado();
    if (!r) return aviso("ainda não há resultado para fixar", "erro");
    const n = loja.get().comparacao.length;
    const nome = `${r.receita.recozimento.variante === "A_rta" ? "RTA" : `forno ${r.receita.recozimento.T_forno_C}`} · ${r.receita.oxidacao.ramoAceleracao} · ${r.receita.oxidacao.T_C} °C`;
    loja.set((s) => ({ comparacao: [...s.comparacao.slice(-4), { nome, resultado: r, cor: CORES[n % CORES.length] }] }));
    aviso(`cenário fixado para comparação: ${nome}`, "ok");
  }

  // atalhos
  window.addEventListener("keydown", (e) => {
    const emCampo = (e.target as HTMLElement).closest("input, select, textarea");
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      simular();
    } else if ((e.ctrlKey || e.metaKey) && !emCampo && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) refazer();
      else desfazer();
    } else if ((e.ctrlKey || e.metaKey) && !emCampo && e.key.toLowerCase() === "y") {
      e.preventDefault();
      refazer();
    } else if (e.altKey && /^[1-9]$/.test(e.key)) {
      e.preventDefault();
      irPara(ROTULOS[+e.key - 1][0]);
    }
  });

  app.append(topo, receitaEl, trabalho, inspetorEl, consoleEl);
  raiz.replaceChildren(app);
  montarReceita(receitaEl);
  // no celular a receita é uma gaveta: fecha pelo botão dela, pelo Esc ou tocando fora
  const fecharGaveta = botao("Fechar a receita", () => app.classList.remove("receita-aberta"), { id: "bt-fechar-receita" });
  fecharGaveta.classList.add("so-celular");
  receitaEl.prepend(h("div", { style: "padding:10px 12px 0", class: "so-celular-bloco" }, fecharGaveta));
  trabalho.addEventListener("pointerdown", () => app.classList.remove("receita-aberta"));
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") app.classList.remove("receita-aberta");
  });
  montarInspetor(inspetorEl);
  const hashIni = location.hash.slice(1) as Aba;
  irPara(ROTULOS.some(([a]) => a === hashIni) ? hashIni : loja.get().aba, false);
  registrar("info", `gfetsim estúdio iniciado; simulação em ${modoExecucao === "worker" ? "workers paralelos" : "thread principal"}`);
  void icone;
  simular();

  // laço de animação: só a vista visível desenha
  let tAnt = performance.now();
  const laco = (t: number) => {
    const dt = Math.min(0.05, (t - tAnt) / 1000);
    tAnt = t;
    if (!document.hidden && !loja.get().apresentacao) {
      try {
        vistaAtual?.quadro?.(dt);
      } catch (e) {
        console.error(e);
      }
    }
    requestAnimationFrame(laco);
  };
  requestAnimationFrame(laco);
  (window as unknown as { gfetsim: unknown }).gfetsim = { loja, irPara, simular, vistas };
}
