/**
 * Editor da receita: as etapas do processo em seções, cada campo com unidade, faixa,
 * etiqueta de origem e a fonte na dica. Muda a receita no estado; a simulação roda sozinha
 * quando o modo automático está ligado.
 */
import { h } from "../dom";
import { campoNumerico, seletor, alternador, botao } from "../componentes";
import { loja, mudarReceita, restaurarPadrao } from "@/estado/app";
import { carregar } from "@/parametros/parametros";
import { ESCOLHAS, NOMES_RAMO, campoReceita, type Receita } from "@/fisica/receita";

const P = carregar(true);

function fonte(chave: string): string {
  try {
    const m = P.metadados(chave);
    const refs = Array.isArray(m.ref) ? ` ${m.ref.join(", ")}` : "";
    return `<code>${chave}</code>${refs ? `<br>fonte${refs}` : ""}${m.nota ? `<br>${m.nota}` : ""}`;
  } catch {
    return "";
  }
}

function et(chave: string): string {
  try {
    return P.etiqueta(chave);
  } catch {
    return "?";
  }
}

type Def =
  | { tipo: "num"; caminho: string; rotulo: string; unidade?: string; min: number; max: number; passo?: number; log?: boolean; casas?: number; cientifico?: boolean; chave?: string; etiqueta?: string; dica?: string }
  | { tipo: "sel"; caminho: string; rotulo: string; opcoes: [string, string][]; chave?: string; etiqueta?: string; dica?: string }
  | { tipo: "bool"; caminho: string; rotulo: string; dica?: string };

interface SecaoDef {
  titulo: string;
  passo: string;
  aberta?: boolean;
  campos: Def[];
  visivel?: (r: Receita) => boolean;
}

const r = (s: string) => NOMES_RAMO[s] ?? s;

const SECOES: SecaoDef[] = [
  {
    titulo: "Implantação", passo: "etapa 1", aberta: true,
    campos: [
      { tipo: "sel", caminho: "implante.variante", rotulo: "Variante", opcoes: [["A_mascara", "A, máscara de SiO₂ e janela"], ["B_lamina", "B, lâmina inteira"]], chave: "receita.implantacao.variantes.A_mascara", etiqueta: "B" },
      { tipo: "num", caminho: "implante.energia_keV", rotulo: "Energia do P⁺", unidade: "keV", min: 5, max: 100, passo: 0.5, casas: 1, chave: "receita.implantacao.energia" },
      { tipo: "num", caminho: "implante.dose_cm2", rotulo: "Dose", unidade: "cm⁻²", min: 1e13, max: 1e16, log: true, cientifico: true, chave: "receita.implantacao.dose" },
      { tipo: "num", caminho: "implante.inclinacao", rotulo: "Inclinação", unidade: "°", min: 0, max: 15, passo: 0.5, casas: 1, chave: "receita.implantacao.inclinacao" },
      { tipo: "num", caminho: "implante.oxido_nativo_nm", rotulo: "Óxido nativo", unidade: "nm", min: 0, max: 5, passo: 0.1, casas: 1, chave: "receita.implantacao.oxido_nativo" },
      { tipo: "num", caminho: "implante.mascara_nm", rotulo: "Espessura da máscara", unidade: "nm", min: 20, max: 400, passo: 5, casas: 0, etiqueta: "B", dica: "variante A do params.yaml, 150 nm" },
      { tipo: "num", caminho: "implante.dose_limiar_cm2", rotulo: "Dose limiar de amorfização", unidade: "cm⁻²", min: 1e15, max: 3e15, log: true, cientifico: true, chave: "implantacao.amorfizacao.limiar_TA.dose_limiar", etiqueta: "P", dica: "faixa de A2 a 300 K; o padrão é o centro da faixa" },
      { tipo: "sel", caminho: "implante.ramoSombra", rotulo: "Inclinação e borda", opcoes: [["sombra", r("sombra")], ["sem_sombra", r("sem_sombra")]], etiqueta: "C", dica: "a rotação (twist) não foi informada; os dois ramos ficam separados" },
    ],
  },
  {
    titulo: "Recozimento", passo: "etapa 2", aberta: true,
    campos: [
      { tipo: "sel", caminho: "recozimento.variante", rotulo: "Variante", opcoes: [["A_rta", "A, RTA depois da SPE"], ["B_forno", "B, forno depois da SPE"]], etiqueta: "B" },
      { tipo: "num", caminho: "recozimento.T_spe_C", rotulo: "SPE, temperatura", unidade: "°C", min: 450, max: 700, passo: 5, casas: 0, chave: "receita.recozimento.spe.temperatura" },
      { tipo: "num", caminho: "recozimento.t_spe_min", rotulo: "SPE, tempo", unidade: "min", min: 1, max: 180, passo: 1, casas: 0, chave: "receita.recozimento.spe.tempo" },
      { tipo: "num", caminho: "recozimento.T_rta_C", rotulo: "RTA, temperatura", unidade: "°C", min: 900, max: 1150, passo: 5, casas: 0, chave: "receita.recozimento.variante_A_rta.temperatura" },
      { tipo: "num", caminho: "recozimento.t_rta_s", rotulo: "RTA, tempo", unidade: "s", min: 1, max: 120, passo: 1, casas: 0, chave: "receita.recozimento.variante_A_rta.tempo" },
      { tipo: "num", caminho: "recozimento.T_forno_C", rotulo: "Forno, temperatura", unidade: "°C", min: 750, max: 1000, passo: 5, casas: 0, chave: "receita.recozimento.variante_B_forno.temperatura", dica: ESCOLHAS["recozimento.T_forno_C"] },
      { tipo: "num", caminho: "recozimento.t_forno_min", rotulo: "Forno, tempo", unidade: "min", min: 1, max: 240, passo: 1, casas: 0, chave: "receita.recozimento.variante_B_forno.tempo" },
      { tipo: "sel", caminho: "recozimento.ramoDesativacao", rotulo: "Desativação", opcoes: [["equilibrio", r("equilibrio")], ["metaestavel", r("metaestavel")]], etiqueta: "C", dica: "R18 mede mais elétrons que a solubilidade de N24; os dois lados ficam como ramos" },
    ],
  },
  {
    titulo: "Óxido de porta", passo: "etapa 3", aberta: true,
    campos: [
      { tipo: "sel", caminho: "oxidacao.metodo", rotulo: "Método", opcoes: [["termico", "oxidação térmica seca"], ["sputtering", "SiO₂ por sputtering reativo (artigo)"]], chave: "receita.oxidacao_porta.metodo" },
      { tipo: "num", caminho: "oxidacao.alvo_nm", rotulo: "Espessura alvo", unidade: "nm", min: 5, max: 60, passo: 0.5, casas: 1, chave: "receita.oxidacao_porta.espessura_alvo" },
      { tipo: "num", caminho: "oxidacao.T_C", rotulo: "Temperatura", unidade: "°C", min: 800, max: 1000, passo: 5, casas: 0, chave: "receita.oxidacao_porta.temperatura", dica: ESCOLHAS["oxidacao.T_C"] },
      { tipo: "sel", caminho: "oxidacao.ramoAceleracao", rotulo: "Aceleração pela dopagem", opcoes: [["ho_plummer", r("ho_plummer")], ["nomura", r("nomura")], ["sem_aceleracao", r("sem_aceleracao")]], etiqueta: "C", dica: "três leituras da literatura sem decisão; cada uma é um ramo" },
      { tipo: "sel", caminho: "oxidacao.ramoInterface", rotulo: "P na interface", opcoes: [["acumulo_classico", r("acumulo_classico")], ["lado_oxido", r("lado_oxido")], ["silicio_inativo", r("silicio_inativo")]], etiqueta: "C" },
      { tipo: "sel", caminho: "oxidacao.modelo", rotulo: "Cinética", opcoes: [["massoud", r("massoud")], ["deal_grove", r("deal_grove")]], etiqueta: "P" },
    ],
  },
  {
    titulo: "Elétrico", passo: "etapa 4",
    campos: [
      { tipo: "num", caminho: "eletrico.rho_ohm_cm", rotulo: "Resistividade do substrato", unidade: "Ω·cm", min: 0.001, max: 10, log: true, chave: "receita.substrato.resistividade", dica: ESCOLHAS["eletrico.rho_ohm_cm"] },
      { tipo: "num", caminho: "eletrico.nDop_cm2", rotulo: "Dopagem residual do grafeno", unidade: "cm⁻²", min: 1e11, max: 2e13, log: true, cientifico: true, chave: "eletrico.grafeno.dopagem_residual_prior", dica: ESCOLHAS["eletrico.nDop_cm2"] },
      { tipo: "sel", caminho: "eletrico.sinalDop", rotulo: "Tipo da dopagem residual", opcoes: [["-1", "p, lacunas"], ["1", "n, elétrons"]], etiqueta: "C", dica: "o sinal é desconhecido; o 2D do Raman não decide" },
      { tipo: "num", caminho: "eletrico.nEstrela_cm2", rotulo: "n* das poças", unidade: "cm⁻²", min: 1e10, max: 2e12, log: true, cientifico: true, chave: "eletrico.grafeno.n_residual.ju_lee" },
      { tipo: "num", caminho: "eletrico.Q_f_cm2", rotulo: "Carga fixa no óxido", unidade: "cm⁻²", min: 0, max: 2e12, passo: 1e10, cientifico: true, chave: "eletrico.oxido.carga_fixa_Qf" },
      { tipo: "num", caminho: "eletrico.D_it_cm2_eV", rotulo: "Densidade de armadilhas", unidade: "cm⁻²eV⁻¹", min: 0, max: 2e12, passo: 1e10, cientifico: true, chave: "eletrico.oxido.Dit" },
    ],
  },
  {
    titulo: "Transistor", passo: "operação",
    campos: [
      { tipo: "num", caminho: "dispositivo.L_um", rotulo: "Comprimento do canal L", unidade: "µm", min: 0.5, max: 100, log: true, etiqueta: "B", dica: ESCOLHAS["dispositivo.L_um"] },
      { tipo: "num", caminho: "dispositivo.mu_cm2Vs", rotulo: "Mobilidade do grafeno", unidade: "cm²/V·s", min: 100, max: 10000, log: true, chave: "eletrico.grafeno.mobilidade.prior_calibracao", dica: ESCOLHAS["dispositivo.mu_cm2Vs"] },
      { tipo: "num", caminho: "dispositivo.RcW_ohm_um", rotulo: "Resistência de contato Rc·W", unidade: "Ω·µm", min: 10, max: 10000, log: true, chave: "eletrico.grafeno.resistencia_contato", dica: ESCOLHAS["dispositivo.RcW_ohm_um"] },
      { tipo: "num", caminho: "dispositivo.hbarOmega_meV", rotulo: "ħΩ da saturação", unidade: "meV", min: 15, max: 100, passo: 1, casas: 0, chave: "eletrico.grafeno.hbar_Omega_prior", dica: ESCOLHAS["dispositivo.hbarOmega_meV"] },
      { tipo: "num", caminho: "dispositivo.VDS_V", rotulo: "V_DS", unidade: "V", min: 0.01, max: 3, passo: 0.01, casas: 2, etiqueta: "B" },
      { tipo: "num", caminho: "dispositivo.alfaHist", rotulo: "Histerese α", unidade: "", min: 0, max: 0.5, passo: 0.01, casas: 2, etiqueta: "B", dica: ESCOLHAS["dispositivo.alfaHist"] },
      { tipo: "num", caminho: "dispositivo.tauHist_s", rotulo: "Histerese τ", unidade: "s", min: 0.1, max: 1000, log: true, etiqueta: "B", dica: ESCOLHAS["dispositivo.alfaHist"] },
      { tipo: "bool", caminho: "dispositivo.vsat", rotulo: "saturação de velocidade (R42)" },
    ],
  },
  {
    titulo: "Cálculo", passo: "opções",
    campos: [
      { tipo: "bool", caminho: "borda.calcular", rotulo: "calcular a borda 2D (alguns segundos)" },
      { tipo: "bool", caminho: "aceitarProvisorios", rotulo: "aceitar os valores provisórios [I]", dica: "sem eles o gfetsim recusa os modelos que dependem de valores null; quase todos os módulos param" },
    ],
  },
];

export function montarReceita(alvo: HTMLElement): void {
  const atualizadores: ((rc: Receita) => void)[] = [];
  const secoes = SECOES.map((sd) => {
    const corpo = h("div", { class: "secao-corpo" });
    for (const c of sd.campos) {
      const valor = campoReceita(loja.get().receita, c.caminho);
      if (c.tipo === "num") {
        const tag = c.etiqueta ?? (c.chave ? et(c.chave) : "B");
        const campo = campoNumerico({
          rotulo: c.rotulo, unidade: c.unidade, valor: Number(valor), min: c.min, max: c.max, passo: c.passo, log: c.log, casas: c.casas, cientifico: c.cientifico,
          etiqueta: tag, dica: [c.dica, c.chave ? fonte(c.chave) : ""].filter(Boolean).join("<br>"), id: `rc-${c.caminho.replace(/\./g, "-")}`,
          aoMudar: (v) => mudarReceita(c.caminho, v),
        });
        atualizadores.push((rc) => campo.definir(Number(campoReceita(rc, c.caminho))));
        corpo.append(campo.el);
      } else if (c.tipo === "sel") {
        const s = seletor({ rotulo: c.rotulo, valor: String(valor), opcoes: c.opcoes, etiqueta: c.etiqueta ?? (c.chave ? et(c.chave) : undefined), dica: [c.dica, c.chave ? fonte(c.chave) : ""].filter(Boolean).join("<br>"), id: `rc-${c.caminho.replace(/\./g, "-")}`,
          aoMudar: (v) => mudarReceita(c.caminho, c.caminho === "eletrico.sinalDop" ? Number(v) : v) });
        atualizadores.push((rc) => s.definir(String(campoReceita(rc, c.caminho))));
        corpo.append(s.el);
      } else {
        const a = alternador(c.rotulo, Boolean(valor), (v) => mudarReceita(c.caminho, v), c.dica);
        atualizadores.push((rc) => (a.caixa.checked = Boolean(campoReceita(rc, c.caminho))));
        corpo.append(a.el);
      }
    }
    const det = h("details", { class: "secao", open: sd.aberta ?? false }, h("summary", null, sd.titulo, h("span", { class: "passo" }, sd.passo)), corpo);
    return { det, sd, corpo };
  });
  // campos que só valem para uma variante ficam esmaecidos
  const relevancia = (rc: Receita) => {
    const marcar = (caminho: string, ativo: boolean) => {
      const el = alvo.querySelector<HTMLElement>(`#rc-${caminho.replace(/\./g, "-")}`)?.closest<HTMLElement>(".campo");
      if (el) el.style.opacity = ativo ? "1" : "0.45";
    };
    marcar("implante.mascara_nm", rc.implante.variante === "A_mascara");
    marcar("implante.ramoSombra", rc.implante.variante === "A_mascara");
    marcar("recozimento.T_rta_C", rc.recozimento.variante === "A_rta");
    marcar("recozimento.t_rta_s", rc.recozimento.variante === "A_rta");
    marcar("recozimento.T_forno_C", rc.recozimento.variante === "B_forno");
    marcar("recozimento.t_forno_min", rc.recozimento.variante === "B_forno");
    const term = rc.oxidacao.metodo === "termico";
    ["oxidacao.T_C", "oxidacao.ramoAceleracao", "oxidacao.ramoInterface", "oxidacao.modelo"].forEach((c) => marcar(c, term));
  };
  const cabecalho = h(
    "div",
    { class: "insp-secao", style: "border-bottom:1px solid var(--borda)" },
    h("h3", null, "Receita de processo"),
    h("p", { class: "nota" }, "Cada campo mostra a etiqueta de origem. Passe o cursor no nome para ver a chave do params.yaml, a fonte e a nota."),
    h("div", { class: "barra-ferramentas" }, botao("Restaurar o params.yaml", () => restaurarPadrao(), { fantasma: true, icone: "reiniciar" })),
  );
  alvo.replaceChildren(cabecalho, ...secoes.map((s) => s.det));
  loja.observar((s) => s.receita, (rc) => {
    atualizadores.forEach((f) => f(rc));
    relevancia(rc);
  });
}
