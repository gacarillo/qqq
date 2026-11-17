/**
 * Etapas do processo na cena 3D e o estado físico de cada instante, tirados do resultado
 * da cadeia: perfis do implante, quadros do recozimento e da oxidação, espessuras sobre a
 * porta e fora dela. As receitas da CVD e da transferência são as da seção 2.4 do artigo [B].
 */
import type { ResultadoCadeia } from "@/fisica/cadeia";
import { interp } from "@/nucleo/numerico";

export interface Etapa3D {
  id: string;
  nome: string;
  dur: number;
  ini: number;
}

export const ETAPAS_3D: Etapa3D[] = [
  { id: "lamina", nome: "Lâmina", dur: 3, ini: 0 },
  { id: "mascara", nome: "Máscara", dur: 4, ini: 0 },
  { id: "implante", nome: "Implantação", dur: 8, ini: 0 },
  { id: "remocao", nome: "Remoção da máscara", dur: 3, ini: 0 },
  { id: "recozimento", nome: "Recozimento", dur: 8, ini: 0 },
  { id: "oxidacao", nome: "Óxido de porta", dur: 8, ini: 0 },
  { id: "janela", nome: "Janela da porta", dur: 4, ini: 0 },
  { id: "cvd", nome: "CVD sobre Cu", dur: 10, ini: 0 },
  { id: "transferencia", nome: "Transferência", dur: 16, ini: 0 },
  { id: "canal", nome: "Canal", dur: 4, ini: 0 },
  { id: "contatos", nome: "Contatos", dur: 4, ini: 0 },
  { id: "operacao", nome: "Operação", dur: 6, ini: 0 },
];
(() => {
  let t = 0;
  for (const e of ETAPAS_3D) {
    e.ini = t;
    t += e.dur;
  }
})();
export const DURACAO_3D = ETAPAS_3D.reduce((s, e) => s + e.dur, 0);

export interface SubEtapa {
  ate: number;
  nome: string;
  txt: string;
  T: [number, number];
}

export const SUB_CVD: SubEtapa[] = [
  { ate: 0.14, nome: "aquecimento", txt: "A folha de cobre aquece até 1000 °C em 410 sccm de Ar, à pressão atmosférica.", T: [25, 1000] },
  { ate: 0.34, nome: "recozimento do Cu", txt: "Recozimento de 1 h a 1000 °C em 15 sccm de H₂ e 150 sccm de Ar. Os grãos do cobre crescem e a superfície perde o óxido.", T: [1000, 1000] },
  { ate: 0.82, nome: "crescimento", txt: "Crescimento de 20 min a 1000 °C com 5 sccm de CH₄, 5 sccm de H₂ e 150 sccm de Ar. O metano se decompõe no cobre, os domínios hexagonais nucleiam, crescem e se fecham num filme contínuo. Parte dos núcleos ganha uma segunda camada por baixo, origem das ilhas que o Raman mostrou.", T: [1000, 1000] },
  { ate: 1, nome: "resfriamento", txt: "Resfriamento em 410 sccm de Ar até 500 °C e, abaixo disso, sob purga de N₂. Na amostra SC o cobre ficou descoberto e deu o filme contínuo de 7 × 5 mm.", T: [1000, 25] },
];

export const SUB_TRANSFERENCIA: SubEtapa[] = [
  { ate: 0.08, nome: "PMMA", txt: "Três gotas de PMMA a 4,9 % em massa em acetona (0,5 g em 9,8 g) sobre o grafeno no cobre, curadas a 40 °C por 20 min e a 50 °C por 10 min. O spin coating foi testado e o PMMA solidificou antes do esperado.", T: [45, 45] },
  { ate: 0.26, nome: "corrosão do Cu", txt: "A amostra flutua durante a noite sobre o reagente de Marble, com cerca de 20 g de CuSO₄ anidro, 100 mL de HCl concentrado e 100 mL de água, perto de 0,6 mol/L de CuSO₄. O cobre se dissolve e sobra o filme de PMMA e grafeno.", T: [25, 25] },
  { ate: 0.42, nome: "quatro banhos de água", txt: "Quatro banhos de água deionizada de 30 a 40 min. Pelo registro do protocolo é a etapa mais crítica, porque o filme que encosta na parede do recipiente deforma ou rasga.", T: [25, 25] },
  { ate: 0.56, nome: "pescagem", txt: "O filme é pescado sobre a lâmina, que sobe por baixo dele e o recolhe da água.", T: [25, 25] },
  { ate: 0.68, nome: "secagem e adesão", txt: "Secagem ao ar por 1 a 2 h e aquecimento a 60 °C por 5 min e a 130 °C por 10 min para melhorar a adesão. A água presa entre o filme e o óxido sai aos poucos.", T: [130, 130] },
  { ate: 0.86, nome: "acetona", txt: "Quatro banhos de acetona de 30 min dissolvem o PMMA. Fica um resíduo fino, que espalha portadores como as impurezas carregadas.", T: [25, 25] },
  { ate: 0.92, nome: "álcool e N₂", txt: "Enxágue em álcool isopropílico e secagem com N₂.", T: [25, 25] },
  { ate: 1, nome: "170 °C", txt: "Recozimento em chapa aquecedora a 170 °C por pelo menos 30 min, que tira parte do resíduo e da água adsorvida.", T: [170, 170] },
];

export function subEtapa(lista: SubEtapa[], u: number): { s: SubEtapa; i: number; v: number } {
  let a = 0;
  for (let i = 0; i < lista.length; i++) {
    if (u < lista[i].ate || i === lista.length - 1) return { s: lista[i], i, v: Math.min(1, Math.max(0, (u - a) / (lista[i].ate - a))) };
    a = lista[i].ate;
  }
  return { s: lista[0], i: 0, v: 0 };
}

export interface Estado3D {
  e: Etapa3D;
  u: number;
  ord: number;
  mascara: number;
  dose: number;
  x: ArrayLike<number> | null;
  C: ArrayLike<number> | null;
  A: ArrayLike<number> | null;
  amorfo: number; // espessura amorfa (nm)
  T: number;
  xoxN: number;
  xoxF: number;
  siN: number;
  siF: number;
  janela: number;
  grafeno: number;
  canal: number;
  metal: number;
  cu: number;
  sub: { s: SubEtapa; i: number; v: number } | null;
  tReal: string;
  taxaOx: number;
  jun: number; // profundidade a 1e18 (nm)
}

export function profundidadeNivel(x: ArrayLike<number>, C: ArrayLike<number>, lim: number): number {
  let k0 = 0;
  for (let k = 1; k < C.length; k++) if (C[k] > C[k0]) k0 = k;
  for (let k = k0; k < C.length; k++) if (C[k] < lim) return k === 0 ? 0 : interp(lim, [C[k], C[k - 1]], [x[k], x[k - 1]]);
  return x[x.length - 1];
}

export function estadoProcesso(res: ResultadoCadeia, t: number): Estado3D {
  const e = ETAPAS_3D.find((x) => t < x.ini + x.dur) ?? ETAPAS_3D[ETAPAS_3D.length - 1];
  const u = Math.min(1, Math.max(0, (t - e.ini) / e.dur));
  const ord = ETAPAS_3D.indexOf(e);
  const idx = (id: string) => ETAPAS_3D.findIndex((x) => x.id === id);
  const comMasc = res.receita.implante.variante === "A_mascara";
  const S: Estado3D = { e, u, ord, mascara: 0, dose: 0, x: null, C: null, A: null, amorfo: 0, T: 25, xoxN: 0, xoxF: 0, siN: 0, siF: 0, janela: 0, grafeno: 0, canal: 0, metal: 0, cu: 0, sub: null, tReal: "", taxaOx: 0, jun: 0 };
  if (comMasc && ord >= idx("mascara")) S.mascara = ord === idx("mascara") ? Math.min(1, u * 1.5) : ord === idx("remocao") ? 1 - u : ord < idx("remocao") ? 1 : 0;
  const im = res.implante, rz = res.recozimento, ox = res.oxidacao;
  const espAmorfo = im.amorfo_nm ? im.amorfo_nm[1] - Math.min(0, im.amorfo_nm[0]) : 0;
  if (ord === idx("implante")) {
    S.dose = Math.min(1, u * 1.08);
    S.x = im.x_nm;
    S.C = Float64Array.from(im.C_cm3, (c) => c * S.dose);
    S.A = new Float64Array(im.C_cm3.length);
    const dl = im.dose_limiar / im.dose_cm2;
    S.amorfo = S.dose > dl ? espAmorfo * Math.sqrt(Math.min(1, (S.dose - dl) / Math.max(1e-6, 1 - dl))) : 0;
    S.tReal = `${Math.round(S.dose * 100)} % da dose`;
  } else if (ord > idx("implante") && ord <= idx("remocao")) {
    S.dose = 1;
    S.x = im.x_nm;
    S.C = im.C_cm3;
    S.A = new Float64Array(im.C_cm3.length);
    S.amorfo = espAmorfo;
  } else if (ord === idx("recozimento")) {
    const fr = rz.quadros;
    if (fr.length) {
      const s = u * (fr.length - 1), i0 = Math.floor(s), i1 = Math.min(fr.length - 1, i0 + 1), w = s - i0;
      S.x = rz.estado.x_nm;
      S.C = Float64Array.from(fr[i0].C, (c, k) => c * (1 - w) + fr[i1].C[k] * w);
      S.A = Float64Array.from(fr[i0].ativo, (c, k) => c * (1 - w) + fr[i1].ativo[k] * w);
      S.T = fr[i0].T_C * (1 - w) + fr[i1].T_C * w;
      const fa = (q: (typeof fr)[number]) => (q.frenteAmorfa_nm === null ? 0 : Math.max(0, q.frenteAmorfa_nm - Math.min(0, im.amorfo_nm?.[0] ?? 0)));
      S.amorfo = fa(fr[i0]) * (1 - w) + fa(fr[i1]) * w;
      S.tReal = `${fr[i0].etapa}, ${fr[i0].t_s > 120 ? `${(fr[i0].t_s / 60).toFixed(1).replace(".", ",")} min` : `${fr[i0].t_s.toFixed(1).replace(".", ",")} s`}`;
    }
    S.dose = 1;
  } else if (ord > idx("recozimento")) {
    S.dose = 1;
    const qs = ox.quadros;
    const fimCampo = ox.espessuraCampo_nm, fimN = ox.espessura_nm;
    if (ord === idx("oxidacao") && qs.length > 1) {
      const s = u * (qs.length - 1), i0 = Math.floor(s), i1 = Math.min(qs.length - 1, i0 + 1), w = s - i0;
      S.x = rz.estado.x_nm;
      S.C = Float64Array.from(qs[i0].C, (c, k) => c * (1 - w) + qs[i1].C[k] * w);
      S.A = Float64Array.from(qs[i0].ativo, (c, k) => c * (1 - w) + qs[i1].ativo[k] * w);
      const tm = qs[i0].t_min * (1 - w) + qs[i1].t_min * w;
      S.xoxN = interp(tm, ox.curva.t, ox.curva.x);
      S.taxaOx = (interp(tm + 0.2, ox.curva.t, ox.curva.x) - S.xoxN) / 0.2;
      S.xoxF = fimN > 0 ? (S.xoxN * fimCampo) / fimN : 0;
      S.T = res.receita.oxidacao.T_C;
      S.tReal = `${tm.toFixed(1).replace(".", ",")} min`;
    } else {
      S.x = ox.estado.x_nm;
      S.C = ox.estado.C;
      S.A = ox.estado.ativo;
      S.xoxN = ord >= idx("oxidacao") ? fimN : 0;
      S.xoxF = ord >= idx("oxidacao") ? fimCampo : 0;
    }
    if (ord >= idx("janela")) S.janela = ord === idx("janela") ? Math.min(1, Math.max(0, u * 1.4 - 0.2)) : 1;
    if (ord === idx("cvd")) {
      S.cu = 1;
      S.sub = subEtapa(SUB_CVD, u);
      S.T = S.sub.s.T[0] + (S.sub.s.T[1] - S.sub.s.T[0]) * S.sub.v;
    }
    if (ord === idx("transferencia")) {
      S.sub = subEtapa(SUB_TRANSFERENCIA, u);
      S.T = S.sub.s.T[0];
      S.cu = S.sub.i === 0 ? 1 : S.sub.i === 1 ? 1 - S.sub.v : 0;
      S.grafeno = S.sub.i >= 3 ? 1 : 0;
    }
    if (ord > idx("transferencia")) S.grafeno = 1;
    if (ord >= idx("canal")) S.canal = ord === idx("canal") ? Math.min(1, u * 1.3) : 1;
    if (ord >= idx("contatos")) S.metal = ord === idx("contatos") ? Math.min(1, u * 1.3) : 1;
  }
  const consumo = res.oxidacao.metodo === "termico" ? 0.44 : 0;
  S.siN = consumo * S.xoxN;
  S.siF = consumo * S.xoxF;
  S.jun = S.x && S.C ? profundidadeNivel(S.x, S.C, 1e18) : 0;
  return S;
}
