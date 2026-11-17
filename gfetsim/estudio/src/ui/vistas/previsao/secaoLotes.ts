/**
 * Seção 2, o caderno de lotes: cada lote é uma receita que foi (ou vai) ao laboratório,
 * com as medidas feitas nele. Entra por formulário, por CSV, ou por um lote sintético
 * que a própria cadeia gera para testar o fluxo antes de existir medida.
 */
import { h } from "../../dom";
import { painel, botao, aviso, abrirModal, alternador } from "../../componentes";
import { br } from "../../formato";
import { registrar } from "@/estado/app";
import { salvarArquivo, nomeArquivo } from "@/exportar/salvar";
import { lerCSV, escreverCSV } from "@/previsao/caderno";
import { DEF_VAR, type NomeVarReceita, type ValoresReceita } from "@/previsao/espaco";
import { ehParametro, erroTipico, novoIdCurto, type Grandeza, type Lote, type Medida } from "@/previsao/tipos";
import { Aleatorio } from "@/nucleo/aleatorio";
import { ExecucaoPontos } from "@/trabalho/previsao";
import { TRANSFORMACAO } from "@/previsao/emulador";
import type { NomeSaida } from "@/fisica/incerteza/montecarlo";
import { lojaPrev, emuladorAtual, parametrosDe, receitaApp, rotuloGrandeza, unidadeGrandeza, fmtVar, fmtSaida, alvoCompleto, MEDIVEIS } from "./estado";

function grandezasDisponiveis(): Grandeza[] {
  const em = emuladorAtual();
  const saidas: Grandeza[] = MEDIVEIS.filter((s) => !em || em.tem(s));
  const params: Grandeza[] = (em?.espaco.calib ?? []).filter((c) => c.def.nome === "n_dop" || c.def.nome === "mu_grafeno" || c.def.nome === "Q_f").map((c) => `param:${c.def.nome}` as Grandeza);
  return [...saidas, ...params];
}

function campoTexto(rotulo: string, valor: string, o: { id: string; dica?: string; largura?: string } ): { el: HTMLElement; input: HTMLInputElement } {
  const input = h("input", { type: "text", id: o.id, value: valor, spellcheck: false, style: o.largura ? `width:${o.largura}` : undefined });
  return { el: h("label", { class: "campo", for: o.id }, h("span", { class: "campo-rotulo" }, h("span", { class: "nome", "data-dica": o.dica ?? null }, rotulo)), input), input };
}

const numero = (s: string) => Number(s.trim().replace(/\s/g, "").replace(",", "."));

/** Formulário de receita de um lote, com as variáveis que o emulador conhece. */
function formularioReceita(inicial: ValoresReceita): { el: HTMLElement; ler: () => ValoresReceita } {
  const em = emuladorAtual();
  const nomes = (em?.espaco.vars.map((a) => a.def.nome) ?? (Object.keys(inicial) as NomeVarReceita[]));
  const campos = nomes.map((nm) => {
    const d = DEF_VAR.get(nm)!;
    const v = inicial[nm];
    const txt = v === undefined ? "" : (d.cientifico ? v.toExponential(3).replace("e+", "e") : String(Number(v.toPrecision(6)))).replace(".", ",");
    return [nm, campoTexto(`${d.rotulo} (${d.unidade})`, txt, { id: `lote-${nm}` })] as const;
  });
  return {
    el: h("div", { class: "grade-2" }, ...campos.map(([, c]) => c.el)),
    ler: () => {
      const r: ValoresReceita = {};
      for (const [nm, c] of campos) {
        const x = numero(c.input.value);
        if (Number.isFinite(x)) r[nm] = x;
      }
      return r;
    },
  };
}

export function abrirNovoLote(inicial?: Partial<Lote>, aoCriar?: (l: Lote) => void): void {
  const nome = campoTexto("Nome do lote", inicial?.nome ?? `lote ${lojaPrev.get().lotes.length + 1}`, { id: "lote-nome" });
  const nota = campoTexto("Nota", inicial?.nota ?? "", { id: "lote-nota" });
  const rec = formularioReceita(inicial?.receita ?? alvoCompleto());
  abrirModal("Novo lote", h("div", { class: "pilha", style: "min-width:min(560px, 86vw)" }, nome.el, h("h3", { class: "prev-sub" }, "Receita nominal"), rec.el, nota.el), [
    { texto: "Cancelar" },
    {
      texto: "Criar", primario: true, acao: () => {
        const l: Lote = { id: novoIdCurto("L"), nome: nome.input.value.trim() || "lote", receita: rec.ler(), medidas: [], usarNaCalibracao: true, criado: Date.now(), nota: nota.input.value.trim() || undefined, previsao: inicial?.previsao };
        lojaPrev.set((s) => ({ lotes: [...s.lotes, l] }));
        aoCriar?.(l);
      },
    },
  ]);
}

function abrirNovaMedida(lote: Lote): void {
  const p = parametrosDe(receitaApp());
  const gs = grandezasDisponiveis();
  let g: Grandeza = gs[0];
  const sel = h("select", { id: "med-grandeza" }, ...gs.map((x) => h("option", { value: x }, `${rotuloGrandeza(x)}${unidadeGrandeza(x) ? ` (${unidadeGrandeza(x)})` : ""}`)));
  const valor = campoTexto("Valor", "", { id: "med-valor" });
  const tip = erroTipico(p, g);
  const sigma = campoTexto("Desvio padrão", String(tip.sigma), { id: "med-sigma", dica: "da medida, não do lote; vem do params.yaml quando ninguém informa" });
  const rel = alternador("desvio relativo (fração)", tip.relativo, () => {});
  sel.addEventListener("change", () => {
    g = sel.value as Grandeza;
    const t = erroTipico(p, g);
    sigma.input.value = String(t.sigma);
    rel.caixa.checked = t.relativo;
  });
  abrirModal(`Medida em ${lote.nome}`, h("div", { class: "pilha", style: "min-width:min(440px, 86vw)" }, h("label", { class: "campo", for: "med-grandeza" }, h("span", { class: "campo-rotulo" }, h("span", { class: "nome" }, "Grandeza")), sel), valor.el, sigma.el, rel.el), [
    { texto: "Cancelar" },
    {
      texto: "Adicionar", primario: true, acao: () => {
        const v = numero(valor.input.value);
        const s = numero(sigma.input.value);
        if (!Number.isFinite(v)) {
          aviso("valor inválido", "erro");
          return false;
        }
        const m: Medida = { id: novoIdCurto("m"), grandeza: g, valor: v, sigma: Number.isFinite(s) && s > 0 ? s : tip.sigma, relativo: rel.caixa.checked };
        lojaPrev.set((st) => ({ lotes: st.lotes.map((l) => (l.id === lote.id ? { ...l, medidas: [...l.medidas, m] } : l)) }));
      },
    },
  ]);
}

/** Simula um lote com um θ sorteado da priori e mede quatro saídas com ruído típico. */
function loteSintetico(): void {
  const em = emuladorAtual();
  if (!em) return aviso("treine o emulador primeiro", "erro");
  const esp = em.espaco;
  const p = parametrosDe(esp.base);
  const rng = new Aleatorio(Date.now() % 100000);
  // os parâmetros físicos são os mesmos em todos os lotes: os sintéticos compartilham uma verdade
  const existente = lojaPrev.get().lotes.find((l) => l.sintetico)?.sintetico?.verdade;
  const uc = existente && esp.calib.every((c) => existente[c.def.nome] !== undefined)
    ? Float64Array.from(esp.calib, (c, j) => esp.uCalib(j, existente[c.def.nome]!))
    : esp.amostrarPriori(rng);
  const alvo = alvoCompleto();
  // a receita do lote varia um pouco em torno do alvo, como um lote de teste faria
  const receita: ValoresReceita = {};
  esp.vars.forEach((a, i) => {
    const u = Math.min(0.9, Math.max(0.1, esp.uVar(i, alvo[a.def.nome] ?? a.def.ler(esp.base, esp.tOxBase)) + rng.normal(0, 0.15)));
    receita[a.def.nome] = Number(esp.vVar(i, u).toPrecision(4));
  });
  const z = esp.juntar(esp.unidadeReceita(receita), uc);
  const pt = esp.pontoFisico(z);
  aviso("simulando o lote sintético pela cadeia completa");
  new ExecucaoPontos(esp.base, [pt], (_i, s, erro) => {
    if (!s) return aviso(`a cadeia falhou no lote sintético: ${erro ?? ""}`, "erro");
    const medidas: Medida[] = [];
    for (const g of ["espessura_ox_nm", "Rs_final", "V_D", "C_min_sobre_Cox"] as NomeSaida[]) {
      if (!em.tem(g)) continue;
      const t = erroTipico(p, g);
      const v0 = s[g];
      const sd = t.relativo ? (TRANSFORMACAO[g] === "log" ? t.sigma : t.sigma * Math.abs(v0)) : t.sigma;
      const v = TRANSFORMACAO[g] === "log" ? v0 * Math.exp(rng.normal(0, sd)) : v0 + rng.normal(0, sd);
      medidas.push({ id: novoIdCurto("m"), grandeza: g, valor: Number(v.toPrecision(4)), sigma: t.sigma, relativo: t.relativo, nota: "sintética" });
    }
    const n = lojaPrev.get().lotes.filter((l) => l.sintetico).length + 1;
    const l: Lote = { id: novoIdCurto("L"), nome: `sintético ${n}`, receita, medidas, usarNaCalibracao: true, criado: Date.now(), sintetico: { verdade: esp.calibFisico(uc) }, nota: "gerado pela cadeia para testar o fluxo; não é medida" };
    lojaPrev.set((st) => ({ lotes: [...st.lotes, l] }));
    registrar("info", existente ? "lote sintético criado com a mesma verdade dos anteriores" : "lote sintético criado com θ verdadeiro sorteado da priori");
  }, () => {});
}

export function secaoLotes(): { el: HTMLElement; atualizar: () => void } {
  const corpo = h("div", { class: "pilha" });
  const arquivo = h("input", { type: "file", accept: ".csv,.txt,.tsv,text/csv,text/plain", hidden: true });
  arquivo.addEventListener("change", async () => {
    const f = arquivo.files?.[0];
    if (!f) return;
    const txt = await f.text();
    const p = parametrosDe(receitaApp());
    const r = lerCSV(txt, lojaPrev.get().lotes, (g) => erroTipico(p, g));
    lojaPrev.set({ lotes: r.lotes });
    aviso(`${r.nMedidas} medidas importadas`, r.nMedidas ? "ok" : "erro");
    r.avisos.slice(0, 5).forEach((a) => registrar("aviso", a));
    arquivo.value = "";
  });
  const ferramentas = h("div", { class: "barra-ferramentas" },
    botao("Novo lote", () => abrirNovoLote(), { primario: true, icone: "mais" }),
    botao("Lote sintético", () => loteSintetico(), { dica: "sorteia um θ verdadeiro da priori (o mesmo para todos os lotes sintéticos), roda a cadeia completa numa receita perto do alvo e mede quatro saídas com o erro típico; serve para ver a calibração achar o θ verdadeiro" }),
    botao("Importar CSV", () => arquivo.click(), { dica: "colunas lote, grandeza, valor e, se quiser, sigma, relativo e as variáveis de receita (T_ox, t_ox …)" }),
    botao("Exportar CSV", () => void salvarArquivo(nomeArquivo("medidas", "csv"), escreverCSV(lojaPrev.get().lotes))),
    botao("Modelo de CSV", () => void salvarArquivo("modelo_medidas.csv", "lote;grandeza;valor;sigma;relativo;T_ox;t_ox\nlote 1;espessura_ox_nm;20,4;0,3;não;900;13,6\nlote 1;Rs_final;36;0,03;sim;900;13,6\nlote 1;V_D;2,4;0,2;não;900;13,6\n")),
    arquivo,
  );

  function atualizar(): void {
    const lotes = lojaPrev.get().lotes;
    const em = emuladorAtual();
    if (!lotes.length) {
      corpo.replaceChildren(h("p", { class: "nota" }, "Nenhum lote ainda. Crie um com a receita que foi ao forno e as medidas dele (elipsometria, quatro pontas, transferência, C-V), importe um CSV, ou gere um lote sintético para ver o fluxo funcionando."));
      return;
    }
    const linhas = lotes.map((l) => {
      const rec = Object.entries(l.receita).map(([k, v]) => `${DEF_VAR.get(k as NomeVarReceita)?.rotulo ?? k} ${fmtVar(k as NomeVarReceita, v as number)} ${DEF_VAR.get(k as NomeVarReceita)?.unidade ?? ""}`).join(", ");
      const usar = alternador("calibrar", l.usarNaCalibracao, (v) => lojaPrev.set((s) => ({ lotes: s.lotes.map((x) => (x.id === l.id ? { ...x, usarNaCalibracao: v } : x)) })));
      const medidas = h("ul", { class: "prev-medidas" }, ...l.medidas.map((m) => h("li", null,
        h("span", null, `${rotuloGrandeza(m.grandeza)} `, h("b", null, ehParametro(m.grandeza) ? String(m.valor) : fmtSaida(m.grandeza as NomeSaida, m.valor)), ` ${unidadeGrandeza(m.grandeza)} ± ${m.relativo ? `${br(100 * m.sigma, 1)} %` : String(m.sigma)}`),
        botao("remover", () => lojaPrev.set((s) => ({ lotes: s.lotes.map((x) => (x.id === l.id ? { ...x, medidas: x.medidas.filter((y) => y.id !== m.id) } : x)) })), { fantasma: true }),
      )));
      const fora = em ? em.espaco.vars.filter((_a, i) => { const u = em.espaco.unidadeReceita(l.receita)[i]; return u < -0.02 || u > 1.02; }).map((a) => a.def.rotulo) : [];
      return h("div", { class: "prev-lote" },
        h("div", { class: "prev-lote-cab" },
          h("b", null, l.nome),
          l.sintetico ? h("span", { class: "chip aviso", "data-dica": "gerado pela cadeia; a calibração deveria recuperar o θ guardado" }, "sintético") : null,
          l.previsao ? h("span", { class: "chip ok", "data-dica": "tem previsão guardada antes da medida; entra no placar de acertos" }, "previsto antes") : null,
          fora.length ? h("span", { class: "chip erro", "data-dica": "fora da faixa de treino do emulador" }, `fora da faixa: ${fora.join(", ")}`) : null,
          h("span", { class: "espaco" }),
          usar.el,
          botao("medida", () => abrirNovaMedida(l), { icone: "mais", fantasma: true }),
          botao("apagar", () => lojaPrev.set((s) => ({ lotes: s.lotes.filter((x) => x.id !== l.id) })), { fantasma: true }),
        ),
        h("div", { class: "prev-fraco" }, rec || "receita base do emulador"),
        l.nota ? h("div", { class: "prev-fraco" }, l.nota) : null,
        l.medidas.length ? medidas : h("p", { class: "nota" }, "sem medidas ainda"),
      );
    });
    const nMed = lotes.reduce((a, l) => a + (l.usarNaCalibracao ? l.medidas.length : 0), 0);
    corpo.replaceChildren(h("p", { class: "nota" }, `${lotes.length} lotes, ${nMed} medidas marcadas para a calibração. O caderno fica guardado neste navegador; exporte o CSV para guardar fora dele.`), ...linhas);
  }

  lojaPrev.observar((s) => s.lotes, () => atualizar(), false);
  lojaPrev.observar((s) => s.emulador, () => atualizar(), false);
  atualizar();
  const el = painel("2. Lotes e medidas", h("div", { class: "pilha" }, ferramentas, corpo), [], { id: "prev-lotes" });
  return { el, atualizar };
}
