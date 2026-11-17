/**
 * Seção 1, o emulador: escolha das variáveis de receita e dos parâmetros a calibrar,
 * plano de treino pela cadeia completa nos workers, ajuste dos processos gaussianos e a
 * qualidade de cada saída pela validação cruzada.
 */
import { h } from "../../dom";
import { painel, botao, campoNumerico, seletor, alternador, aviso, metrica } from "../../componentes";
import { br, num, tempo } from "../../formato";
import { melhorResultado, registrar } from "@/estado/app";
import { SAIDAS, type NomeSaida, type Saida } from "@/fisica/incerteza/montecarlo";
import { Grafico } from "@/visual/grafico/grafico";
import { CALIB, Espaco, VARS_RECEITA, type ConfigEspaco, type NomeCalib, type NomeVarReceita } from "@/previsao/espaco";
import { NOME_SAIDA, TRANSFORMACAO, dadosDeSaida, planoTreino, deT, type SerialEmulador } from "@/previsao/emulador";
import { ProcessoGaussiano } from "@/previsao/gp";
import { ExecucaoPontos } from "@/trabalho/previsao";
import { lojaPrev, fila, parametrosDe, emuladorAtual, COR } from "./estado";

const CALIB_PADRAO: NomeCalib[] = ["fator_taxa_ox", "fator_mu_si", "fator_ne", "Q_f", "n_dop", "mu_grafeno", "n_estrela"];
const VARS_PADRAO: NomeVarReceita[] = ["T_ox", "t_ox", "T_rta", "dose"];

export function secaoEmulador(): { el: HTMLElement; atualizar: () => void } {
  const escolha = {
    vars: new Map<NomeVarReceita, { ativo: boolean; min: number; max: number }>(),
    calib: new Set<NomeCalib>(CALIB_PADRAO),
    n: 0,
    semente: 13,
    saidaParidade: "espessura_ox_nm" as NomeSaida,
  };
  let exec: ExecucaoPontos | null = null;
  const caixaVars = h("div", { class: "prev-lista" });
  const caixaCalib = h("div", { class: "prev-lista" });
  const qualidade = h("div", { class: "tabela-rolagem" });
  const resumo = h("div", { class: "metricas prev-metricas" });
  const barra = h("div", { class: "prev-barra" }, h("i"));
  const textoProg = h("span", { class: "nota" });
  const gP = h("div");
  const paridade = new Grafico(gP, { x: { rotulo: "valor da cadeia" }, y: { rotulo: "previsão sem o ponto" }, razao: 0.8, alturaMin: 240, alturaMax: 360, legenda: false });
  const selParidade = seletor<NomeSaida>({ rotulo: "Saída no gráfico", valor: escolha.saidaParidade, opcoes: SAIDAS.map(([k, r]) => [k, r]), aoMudar: (v) => { escolha.saidaParidade = v; desenharParidade(); }, id: "prev-paridade" });
  const cN = campoNumerico({ rotulo: "Simulações de treino", valor: 120, min: 20, max: 600, log: true, casas: 0, aoMudar: (v) => (escolha.n = Math.round(v)), id: "prev-n", dica: "cerca de 10 por dimensão do espaço dá um emulador bom para saídas lisas" });
  const btTreinar = botao("Treinar o emulador", () => treinar(), { primario: true, icone: "tocar", id: "prev-treinar" });
  const btParar = botao("Parar", () => parar(), { id: "prev-parar-treino" });
  const btApagar = botao("Descartar", () => { lojaPrev.set({ emulador: null, calibracao: null, previsao: null, plano: null, mapa: null }); aviso("emulador descartado"); }, { fantasma: true });

  function montarEscolhas(): void {
    const res = melhorResultado();
    if (!res) return;
    const base = res.receita;
    const tOx = res.oxidacao.t_min;
    const faixas = Espaco.faixasPadrao(base, tOx);
    const salvo = lojaPrev.get().emulador?.config;
    caixaVars.replaceChildren();
    for (const f of faixas) {
      const def = VARS_RECEITA.find((v) => v.nome === f.nome)!;
      const doSalvo = salvo?.receita.find((v) => v.nome === f.nome);
      const atual = escolha.vars.get(f.nome) ?? { ativo: salvo ? !!doSalvo : VARS_PADRAO.includes(f.nome), min: doSalvo?.min ?? f.min, max: doSalvo?.max ?? f.max };
      escolha.vars.set(f.nome, atual);
      const alt = alternador(`${def.rotulo} (${def.unidade})`, atual.ativo, (v) => { atual.ativo = v; estimar(); });
      const cmin = campoNumerico({ rotulo: "de", valor: atual.min, min: def.limites.min, max: def.limites.max, log: def.log, casas: def.casas, cientifico: def.cientifico, aoMudar: (v) => (atual.min = v), id: `prev-min-${f.nome}` });
      const cmax = campoNumerico({ rotulo: "até", valor: atual.max, min: def.limites.min, max: def.limites.max, log: def.log, casas: def.casas, cientifico: def.cientifico, aoMudar: (v) => (atual.max = v), id: `prev-max-${f.nome}` });
      caixaVars.append(h("div", { class: "prev-var" }, alt.el, h("div", { class: "prev-faixa" }, cmin.el, cmax.el)));
    }
    if (salvo) {
      escolha.calib = new Set(salvo.calib);
    }
    caixaCalib.replaceChildren();
    for (const c of CALIB) {
      const alt = alternador(c.rotulo, escolha.calib.has(c.nome), (v) => { if (v) escolha.calib.add(c.nome); else escolha.calib.delete(c.nome); estimar(); }, `priori de ${c.chave} no params.yaml`);
      caixaCalib.append(alt.el);
    }
    estimar();
  }

  function dimensao(): number {
    return [...escolha.vars.values()].filter((v) => v.ativo).length + escolha.calib.size;
  }

  function estimar(): void {
    const d = dimensao();
    const sugerido = Math.min(400, Math.max(40, 10 * d + 20));
    if (!escolha.n) {
      escolha.n = sugerido;
      cN.definir(sugerido);
    }
    const nw = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
    textoProg.textContent = `${d} dimensões; sugerido ${sugerido} simulações. A cadeia leva cerca de 0,2 s por ponto, então o treino deve levar perto de ${tempo((escolha.n * 0.25) / Math.min(6, nw) + 4)} com ${Math.min(6, nw)} workers.`;
  }

  function parar(): void {
    exec?.parar();
    exec = null;
    lojaPrev.set({ treino: null });
  }

  function treinar(): void {
    const res = melhorResultado();
    if (!res) return aviso("espere a cadeia nominal terminar", "erro");
    parar();
    const base = { ...res.receita, borda: { calcular: false } };
    const tOx = res.oxidacao.t_min;
    const config: ConfigEspaco = {
      receita: [...escolha.vars.entries()].filter(([, v]) => v.ativo).map(([nome, v]) => ({ nome, min: Math.min(v.min, v.max), max: Math.max(v.min, v.max) })),
      calib: CALIB.map((c) => c.nome).filter((n) => escolha.calib.has(n)),
    };
    let esp: Espaco;
    try {
      esp = new Espaco(parametrosDe(base), base, tOx, config);
    } catch (e) {
      return aviso((e as Error).message, "erro");
    }
    if (esp.d === 0) return aviso("escolha ao menos uma variável ou parâmetro", "erro");
    const n = Math.max(12, escolha.n || 10 * esp.d + 20);
    const Z = planoTreino(n, esp.d, escolha.semente);
    const pontos = Z.map((z) => esp.pontoFisico(z));
    const Y: (Saida | null)[] = new Array(n).fill(null);
    const inicio = performance.now();
    lojaPrev.set({ treino: { feitos: 0, total: n, falhas: 0, fase: "simulando", ajustados: 0, nSaidas: SAIDAS.length, inicio } });
    registrar("info", `treino do emulador: ${n} simulações em ${esp.d} dimensões`);
    let feitos = 0;
    let falhas = 0;
    exec = new ExecucaoPontos(base, pontos, (i, s, erro) => {
      Y[i] = s;
      feitos++;
      if (!s) {
        falhas++;
        if (falhas <= 3) registrar("aviso", `ponto ${i} do treino falhou: ${erro ?? "sem mensagem"}`);
      }
      const t = lojaPrev.get().treino;
      if (t && feitos % 2 === 0) lojaPrev.set({ treino: { ...t, feitos, falhas } });
    }, () => {
      exec = null;
      void ajustar(esp, base, tOx, config, Z, Y, inicio);
    });
  }

  async function ajustar(esp: Espaco, base: SerialEmulador["base"], tOx: number | null, config: ConfigEspaco, Z: number[][], Y: (Saida | null)[], inicio: number): Promise<void> {
    const t0 = lojaPrev.get().treino;
    if (!t0) return;
    lojaPrev.set({ treino: { ...t0, feitos: Z.length, fase: "ajustando" } });
    const serial: SerialEmulador = { versao: 1, chave: esp.chave(), base, tOxBase: tOx, config, saidas: [], gps: {}, Z, Y, qualidade: {}, ms: 0 };
    let ajustados = 0;
    const tarefas = SAIDAS.map(([s]) => s).map(async (s) => {
      const d = dadosDeSaida(Z, Y, s);
      if (d.y.length < Math.max(8, esp.d + 2)) {
        registrar("aviso", `${NOME_SAIDA.get(s)?.rotulo}: só ${d.y.length} pontos válidos, saída não emulada`);
        return;
      }
      try {
        const r = await fila.executar(base, { op: "ajustar", saida: s, Z: d.Z, y: d.y, semente: 7 });
        if (r.op !== "ajustar") return;
        serial.gps[s] = r.gp;
        serial.qualidade[s] = r.qualidade;
        serial.saidas.push(s);
      } catch (e) {
        registrar("erro", `ajuste de ${s}: ${(e as Error).message}`);
      }
      ajustados++;
      const t = lojaPrev.get().treino;
      if (t) lojaPrev.set({ treino: { ...t, ajustados } });
    });
    await Promise.all(tarefas);
    if (!lojaPrev.get().treino) return;
    serial.saidas = SAIDAS.map(([s]) => s).filter((s) => serial.gps[s]);
    serial.ms = performance.now() - inicio;
    lojaPrev.set({ emulador: serial, treino: null, calibracao: null, previsao: null, plano: null, mapa: null, conferencia: null });
    registrar("ok", `emulador pronto em ${tempo(serial.ms / 1000)}, ${serial.saidas.length} saídas`);
    aviso("emulador treinado", "ok");
  }

  function desenharQualidade(): void {
    const em = emuladorAtual();
    const s = lojaPrev.get().emulador;
    resumo.replaceChildren();
    if (!em || !s) {
      qualidade.replaceChildren(h("p", { class: "nota" }, "Sem emulador. Escolha as variáveis, os parâmetros e treine. O emulador fica guardado neste navegador e volta quando a página abrir de novo."));
      return;
    }
    const esp = em.espaco;
    const nomesDim = [...esp.vars.map((a) => a.def.rotulo), ...esp.calib.map((c) => c.def.rotulo)];
    const q2s = em.saidas.map((x) => em.qualidade.get(x)?.Q2 ?? 0);
    resumo.append(
      metrica("simulações de treino", String(s.Z.length)),
      metrica("dimensões", String(esp.d), { dica: nomesDim.join(", ") }),
      metrica("saídas emuladas", String(em.saidas.length)),
      metrica("Q² mediano", br(q2s.sort((a, b) => a - b)[Math.floor(q2s.length / 2)] ?? 0, 3), { dica: "1 − erro quadrático da validação cruzada sobre a variância; 1 é perfeito" }),
      metrica("tempo do treino", tempo(s.ms / 1000)),
      metrica("receita base", s.base.nome),
    );
    const linhas = em.saidas.map((x) => {
      const q = em.qualidade.get(x)!;
      const log = TRANSFORMACAO[x] === "log";
      const erro = log ? `${br(100 * (Math.exp(q.rmse) - 1), 1)} %` : `${num(q.rmse, 3)} ${NOME_SAIDA.get(x)?.unidade ?? ""}`;
      const ordem = q.comprimentos.map((l, i) => [l, i] as const).sort((a, b) => a[0] - b[0]).slice(0, 3).filter(([l]) => l < 3);
      const classe = q.Q2 > 0.95 ? "ok" : q.Q2 > 0.8 ? "aviso" : "erro";
      return h("tr", null,
        h("td", null, NOME_SAIDA.get(x)?.rotulo ?? x),
        h("td", null, h("span", { class: `chip ${classe}` }, br(q.Q2, 3))),
        h("td", null, erro),
        h("td", null, `${br(100 * q.dentro2s, 0)} %`),
        h("td", { class: "prev-fraco" }, ordem.map(([l, i]) => `${nomesDim[i]} (${br(l, 2)})`).join(", ") || "nenhuma dominante"),
      );
    });
    qualidade.replaceChildren(h("table", { class: "tabela" },
      h("thead", null, h("tr", null, h("th", null, "saída"), h("th", null, "Q²"), h("th", { "data-dica": "RMSE da validação cruzada; relativo nas saídas em log" }, "erro"), h("th", { "data-dica": "fração dos pontos dentro de 2σ da previsão sem eles; perto de 95 % quer dizer que a incerteza do emulador é honesta" }, "dentro de 2σ"), h("th", { "data-dica": "entradas com menor comprimento de correlação no cubo unitário, as que mais mexem na saída" }, "entradas que mais pesam"))),
      h("tbody", null, ...linhas)));
    desenharParidade();
  }

  function desenharParidade(): void {
    const em = emuladorAtual();
    const s = escolha.saidaParidade;
    if (!em || !em.tem(s)) {
      paridade.definir({ series: [] });
      return;
    }
    const g: ProcessoGaussiano = em.gp(s);
    const { media, desvio } = g.loo();
    const y = g.treino;
    const fis = (t: number) => deT(s, t);
    const xs = Array.from(y, fis);
    const ys = Array.from(media, fis);
    const ex: number[] = [];
    const ey: number[] = [];
    for (let i = 0; i < y.length; i++) {
      ex.push(xs[i], xs[i], NaN);
      ey.push(fis(media[i] - 2 * desvio[i]), fis(media[i] + 2 * desvio[i]), NaN);
    }
    let lo = Math.min(...xs, ...ys);
    let hi = Math.max(...xs, ...ys);
    if (!(hi > lo)) {
      lo -= 1;
      hi += 1;
    }
    const log = TRANSFORMACAO[s] === "log" && lo > 0;
    paridade.o.x.log = log;
    paridade.o.y.log = log;
    paridade.o.x.rotulo = `${NOME_SAIDA.get(s)?.rotulo} pela cadeia (${NOME_SAIDA.get(s)?.unidade || "adim."})`;
    paridade.o.y.rotulo = "previsão sem o ponto";
    paridade.definir({
      series: [
        { nome: "igualdade", x: [lo, hi], y: [lo, hi], cor: "var(--texto-3)", tracejado: [4, 4], largura: 1 },
        { nome: "±2σ", x: ex, y: ey, cor: COR.posteriori, alfa: 0.35, largura: 1 },
        { nome: "pontos", x: xs, y: ys, cor: COR.posteriori, tipo: "pontos", raio: 3 },
      ],
    });
  }

  const passoCaixa = h("div", { class: "prev-passo-progresso" }, barra, textoProg);
  const el = painel("1. Emulador da cadeia", h("div", { class: "pilha" },
    h("p", { class: "nota" }, "O emulador é um processo gaussiano por saída treinado com a cadeia completa. Ele responde em microssegundos o que a cadeia leva 0,2 s para calcular, e diz quanto erra. Sem ele a calibração e os mapas precisariam de centenas de milhares de simulações."),
    h("div", { class: "grade-2" },
      h("div", { class: "pilha" }, h("h3", { class: "prev-sub" }, "Variáveis de receita que o emulador aprende"), caixaVars, h("p", { class: "nota" }, "A faixa é onde a previsão vale; fora dela o emulador extrapola e a vista avisa.")),
      h("div", { class: "pilha" }, h("h3", { class: "prev-sub" }, "Parâmetros que as medidas vão calibrar"), caixaCalib, h("p", { class: "nota" }, "Cada um entra com a priori declarada no params.yaml. Os que ficam de fora seguem no valor da receita.")),
    ),
    h("div", { class: "barra-ferramentas" }, cN.el, btTreinar, btParar, btApagar),
    passoCaixa,
    resumo,
    h("div", { class: "grade-2" }, qualidade, h("div", { class: "pilha" }, selParidade.el, gP, h("p", { class: "nota" }, "Cada ponto é uma simulação de treino prevista pelo emulador sem ela. Na diagonal o emulador acerta; a barra é o intervalo de 2σ que ele declara."))),
  ), [], { id: "prev-emulador" });

  function atualizar(): void {
    const t = lojaPrev.get().treino;
    btParar.disabled = !t;
    btTreinar.disabled = !!t;
    if (t) {
      const f = t.fase === "simulando" ? t.feitos / t.total : 0.9 + (0.1 * t.ajustados) / t.nSaidas;
      (barra.firstChild as HTMLElement).style.width = `${100 * f}%`;
      const dt = (performance.now() - t.inicio) / 1000;
      textoProg.textContent = t.fase === "simulando"
        ? `simulando ${t.feitos} de ${t.total}${t.falhas ? `, ${t.falhas} falharam` : ""}; ${tempo(dt)} até aqui${t.feitos > 4 ? `, faltam cerca de ${tempo((dt / t.feitos) * (t.total - t.feitos))}` : ""}`
        : `ajustando os processos gaussianos, ${t.ajustados} de ${t.nSaidas}`;
    } else {
      (barra.firstChild as HTMLElement).style.width = lojaPrev.get().emulador ? "100%" : "0";
      estimar();
    }
    desenharQualidade();
  }

  lojaPrev.observar((s) => s.treino, () => atualizar(), false);
  lojaPrev.observar((s) => s.emulador, () => { montarEscolhas(); atualizar(); }, false);
  montarEscolhas();
  atualizar();
  return { el, atualizar: () => { if (!caixaVars.childElementCount) montarEscolhas(); atualizar(); } };
}

