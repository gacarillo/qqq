/** Inspetor de resultados: os números da receita atual, com etiqueta, e os avisos da cadeia. */
import { h } from "../dom";
import { metrica, etiqueta } from "../componentes";
import { br, sci, num } from "../formato";
import { loja, melhorResultado } from "@/estado/app";
import { resumo } from "@/fisica/cadeia";

export function montarInspetor(alvo: HTMLElement): void {
  const corpo = h("div");
  alvo.replaceChildren(corpo);
  const render = () => {
    const s = loja.get();
    const res = melhorResultado(s);
    if (!res) {
      corpo.replaceChildren(h("div", { class: "insp-secao" }, h("h3", null, "Resultados"), h("p", { class: "nota" }, "Calculando a cadeia da receita do params.yaml.")));
      return;
    }
    const R = resumo(res);
    const im = res.implante, rz = res.recozimento, ox = res.oxidacao, el = res.eletrico;
    const termico = ox.metodo === "termico";
    const borda = res.borda;
    let avanco = 0;
    if (borda) {
      const g = borda.grade;
      for (let j = 0; j < g.y.length; j++) if (g.y[j] < 0 && borda.juncao.z1e18[j] > 0) avanco = Math.max(avanco, -g.y[j]);
    }
    const secoes = [
      h("div", { class: "insp-secao" }, h("h3", null, "Implantação"), h("div", { class: "metricas" },
        metrica("Rp", `${br(im.momentos.media, 1)} nm`, { etiqueta: "C", dica: "média da profundidade final no Si, da tabela do RustBCA" }),
        metrica("ΔRp", `${br(im.momentos.desvio, 1)} nm`, { etiqueta: "C" }),
        metrica("pico", `${sci(im.pico_cm3, 2)} cm⁻³`, { etiqueta: "C" }),
        metrica("camada amorfa", im.amorfo_nm ? `${br(im.amorfo_nm[0], 1)} a ${br(im.amorfo_nm[1], 1)} nm` : "não amorfiza", { etiqueta: "C", dica: "limiar de dose medido a 300 K (A2)" }),
        metrica("dose retida no Si", `${br((100 * im.dose_si) / im.dose_cm2, 1)} %`, { etiqueta: "C" }),
        metrica("Pearson", `tipo ${im.tipoPearson}`, { etiqueta: "C" }),
      )),
      h("div", { class: "insp-secao" }, h("h3", null, "Recozimento"), h("div", { class: "metricas" },
        metrica("fração ativa", `${br(100 * R.fracaoAtiva, 1)} %`, { etiqueta: "C" }),
        metrica("Rs", `${br(rz.Rs_ohm_sq, 1)} Ω/□`, { etiqueta: "I", dica: "mobilidade de Masetti com parâmetros provisórios" }),
        metrica("n_e(T)", `${sci(rz.n_e, 2)} cm⁻³`, { etiqueta: "P", dica: "N24" }),
        metrica("C_sat(T)", `${sci(rz.C_sat, 2)} cm⁻³`, { etiqueta: "P", dica: "N24" }),
        metrica("SPE completa em", rz.t_spe_s ? `${br(rz.t_spe_s / 60, 1)} min` : "sem amorfo", { etiqueta: "I" }),
        metrica("avanço sob a máscara", borda ? `${br(avanco, 0)} nm` : s.rodando.completo ? "calculando" : "sem borda 2D", { etiqueta: "C", dica: "maior distância sob a máscara em que o P ativo passa de 10¹⁸ cm⁻³" }),
      )),
      h("div", { class: "insp-secao" }, h("h3", null, "Óxido de porta"), h("div", { class: "metricas" },
        metrica("sobre a porta n⁺", `${br(ox.espessura_nm, 2)} nm`, { etiqueta: termico ? "C" : "B" }),
        metrica("fora da porta", `${br(ox.espessuraCampo_nm, 2)} nm`, { etiqueta: termico ? "C" : "B", dica: "mesmo tempo, substrato com a dopagem da resistividade escolhida" }),
        metrica("tempo", termico && ox.t_min ? `${br(ox.t_min, 1)} min` : "depositado", { etiqueta: "C" }),
        metrica("Si consumido", `${br(ox.siConsumido_nm, 1)} nm`, { etiqueta: "B" }),
        metrica("P ativo na interface", `${sci(R.ativoSuperficie_cm3, 2)} cm⁻³`, { etiqueta: "C" }),
        metrica("Rs final", `${br(ox.Rs_ohm_sq, 1)} Ω/□`, { etiqueta: "I" }),
      )),
      h("div", { class: "insp-secao" }, h("h3", null, "Porta e grafeno"), h("div", { class: "metricas" },
        metrica("V_Dirac", `${br(el.V_D, 3)} V`, { etiqueta: "C" }),
        metrica("C mínima / Cox", br(R.Cmin_sobre_Cox, 3), { etiqueta: "C" }),
        metrica("perda no Si em 5×10¹²", `${br(100 * R.perdaSi_5e12, 2)} %`, { etiqueta: "C", dica: "comparada à mesma pilha com porta metálica" }),
        metrica("E_ox em V_D + 5 V", `${br(R.E_ox_VD5, 2)} MV/cm`, { etiqueta: "C", alerta: R.E_ox_VD5 > 8 }),
        metrica("carga por volt", `${sci(R.carga_por_volt_cm2, 2)} cm⁻²/V`, { etiqueta: "C" }),
        metrica("ruptura", `${br(el.V_ruptura[0], 1)} a ${br(el.V_ruptura[1], 1)} V`, { etiqueta: "P", dica: "10 a 13 MV/cm (B1), relativo a V_D" }),
      )),
    ];
    const prov = res.provisorios;
    const avisos = res.notas.filter((n) => /pendente|desconhecid|extrapola|incomplet|nenhum|recusa|fora/.test(n));
    secoes.push(
      h("div", { class: "insp-secao" }, h("h3", null, "Origem dos valores"),
        h("p", { class: "nota" }, `${prov.length} valores provisórios [I] entraram neste cálculo, de ${res.usos.length} parâmetros lidos.`),
        h("details", null, h("summary", { class: "nota", style: "cursor:pointer" }, "ver a lista"), h("ul", { class: "lista-notas" }, ...prov.map((k) => h("li", null, etiqueta("I"), " ", h("code", { style: "font-size:11px" }, k))))),
      ),
      h("div", { class: "insp-secao" }, h("h3", null, "Avisos da cadeia"), avisos.length ? h("ul", { class: "lista-notas" }, ...avisos.map((n) => h("li", null, n))) : h("p", { class: "nota" }, "Nenhum aviso para esta receita.")),
      h("div", { class: "insp-secao" }, h("h3", null, "Tempo de cálculo"), h("p", { class: "nota dado" }, Object.entries(res.tempos_ms).map(([k, v]) => `${k} ${num(v, 3)} ms`).join("  "))),
    );
    corpo.replaceChildren(...secoes);
  };
  render();
  loja.assinar((n, a) => {
    if (n.resultado !== a.resultado || n.resultadoBorda !== a.resultadoBorda || n.rodando !== a.rodando) render();
  });
}
