"""Gera todos os resultados, tabelas e figuras usados no notebook e no relatório.

    python exemplos/gerar_resultados.py [--n 1000] [--rapido]

Saída em resultados/ (figuras PNG, resumo.json e as amostras do Monte Carlo em .npz).
"""
import argparse
import json
import time
from pathlib import Path

import numpy as np

from gfetsim import carregar, figuras
from gfetsim.calibracao import ajuste
from gfetsim.cadeia import mapa_espessura
from gfetsim.constantes import eps0, q
from gfetsim.eletrico import grafeno, oxido
from gfetsim.eletrico import modulo as eletrico
from gfetsim.eletrico.poisson import SiPorta, capacitancia_deplecao
from gfetsim.implantacao import modulo as implantacao
from gfetsim.incerteza import montecarlo as mc
from gfetsim.oxidacao import cinetica
from gfetsim.oxidacao import modulo as oxidacao
from gfetsim.recozimento import modulo as recozimento
from gfetsim.recozimento import silicio

RAIZ = Path(__file__).resolve().parents[1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=1000)
    ap.add_argument("--sobol", type=int, default=64)
    ap.add_argument("--saida", default=str(RAIZ / "resultados"))
    a = ap.parse_args()
    out = Path(a.saida)
    out.mkdir(parents=True, exist_ok=True)
    p = carregar(aceitar_provisorios=True)
    R = {}
    t0 = time.time()

    # 1 implantação ------------------------------------------------------------
    perf = implantacao.simular(p, variante="A_mascara", n_ions=100000)
    figuras.implantacao(perf, out / "fig_implantacao.png")
    R["implantacao"] = {"Rp_nm": perf.momentos.media, "dRp_nm": perf.momentos.desvio,
                        "assimetria": perf.momentos.assimetria, "curtose": perf.momentos.curtose,
                        "tipo_pearson": perf.tipo_pearson, "erro_Rp_nm": perf.erro_Rp_nm,
                        "pico_cm3": perf.pico_cm3, "dose_si": perf.dose_si, "dose_oxido_nativo": perf.dose_oxido,
                        "dose_refletida": perf.dose_refletida, "amorfo_nm_limiar_central": perf.amorfo_nm,
                        "transmissao_mascara_150nm": perf.transmissao_mascara, "n_ions": 100000}
    inc = p.incerteza("implantacao.amorfizacao.limiar_TA.dose_limiar")
    R["implantacao"]["amorfo_faixa_A2"] = [implantacao.camada_amorfa(perf.x_nm, perf.Fn_eV_cm, 3e15, d)
                                            for d in (inc["min"], inc["max"])]

    # 2 recozimento ------------------------------------------------------------
    est = {}
    est["A (RTA)"] = recozimento.simular(p, perf, "A_rta")
    est["A metaestável"] = recozimento.simular(p, perf, "A_rta", ramo_desativacao="metaestavel")
    est["B 850 C"] = recozimento.simular(p, perf, "B_forno", 850.0)
    est["B 900 C"] = recozimento.simular(p, perf, "B_forno", 900.0)
    figuras.recozimento({k: v for k, v in est.items() if k != "A metaestável"}, out / "fig_recozimento.png")
    lihan = p.valor("recozimento.ativacao_dados_validacao.li_han_850C")
    R["recozimento"] = {k: {"fracao_ativa": e.fracao_ativa, "Rs_ohm_sq": silicio.resistencia_folha(p, e.x_nm, e.ativo),
                            "Rs_limite_Li_Han": silicio.resistencia_folha(p, e.x_nm, e.ativo * lihan / e.fracao_ativa),
                            "ativo_superficie_cm3": float(e.ativo[0]), "pico_ativo_cm3": float(e.ativo.max()),
                            "xj_1e17_nm": float(e.x_nm[np.argmax(e.C < 1e17)]), "historico": e.historico}
                        for k, e in est.items()}

    # 3 oxidação ---------------------------------------------------------------
    T = np.linspace(800, 1000, 21)
    t = np.geomspace(1, 600, 120)
    F_n = p.valor("oxidacao.oxidacao_acelerada_dopagem.nomura_fator_max_implantado")
    mapas = {"Massoud, F = 1": mapa_espessura(p, T, t, 1.0),
             "Massoud, F = 2,1 (R23)": mapa_espessura(p, T, t, F_n),
             "Deal e Grove, F = 1": mapa_espessura(p, T, t, 1.0, "deal_grove")}
    Ts = [800.0, 850.0, 900.0, 950.0, 1000.0]
    t20 = {}
    for var, e in (("A", est["A (RTA)"]), ("B900", est["B 900 C"])):
        for ra in ("sem_aceleracao", "ho_plummer", "nomura"):
            for ri in ("acumulo_classico", "lado_oxido", "silicio_inativo"):
                linha = []
                for TT in Ts:
                    tt, res = oxidacao.tempo_para_alvo(p, e, TT, 20.0, ra, ri)
                    linha.append({"T_C": TT, "t_min": tt, "espessura_nm": res.espessura_nm,
                                  "si_consumido_nm": res.si_consumido_nm, "dose_no_oxido": res.dose_no_oxido,
                                  "ativo_interface_cm3": float(res.estado.ativo[0]),
                                  "Rs_ohm_sq": silicio.resistencia_folha(p, res.estado.x_nm, res.estado.ativo)})
                t20[f"{var}|{ra}|{ri}"] = linha
    acoplado = {f"Ho e Plummer acoplado ({v})": (Ts, [d["t_min"] for d in t20[f"{v}|ho_plummer|acumulo_classico"]])
                for v in ("A", "B900")}
    figuras.mapa_oxido(T, t, mapas, acoplado, out / "fig_mapa_oxido.png")
    R["oxidacao"] = {"t20": t20,
                     "t20_cinetica_pura": {m: {str(TT): cinetica.tempo_para(p, TT, 20.0, modelo=m) for TT in Ts}
                                           for m in ("massoud", "deal_grove")}}

    # 4 elétrico ---------------------------------------------------------------
    ox_ref = oxidacao.tempo_para_alvo(p, est["A (RTA)"], 900.0, 20.0)[1]
    x, ativo = ox_ref.estado.x_nm, ox_ref.estado.ativo
    V = np.linspace(-8, 8, 81)
    curvas, perdas = {}, {}
    perfis = {"perfil simulado (A, 900 C)": ativo}
    for N in (1e19, 1e20, 3e20):
        perfis[f"uniforme {N:.0e}"] = np.full_like(x, N)
    for nome, Nd in perfis.items():
        el = eletrico.simular(p, x, Nd, 20.0, None, 0.0, 0.0, V=V)
        curvas[nome] = (el.V - el.V_D, el.C_F_cm2 / el.C_ox_F_cm2)
        perdas[nome] = {f"{nn:.0e}": float(np.interp(nn, el.n_cm2, el.perda_si)) for nn in (2e12, 5e12, 1e13, -5e12, -1e13)}
    ant = {N: p.valor(f"eletrico.calculo_anterior_usuario.perda_capacitancia.n_{k}") for N, k in
           ((1e19, "1e19"), (1e20, "1e20"), (3e20, "3e20"))}
    figuras.cv(curvas, out / "fig_cv.png", ant)
    Cox = p.valor("eletrico.materiais.eps_r_SiO2") * eps0 / 20e-9
    deplecao = {f"{N:.0e}": float(Cox / (Cox + capacitancia_deplecao(p, N, 1.1))) for N in (1e19, 1e20, 3e20)}
    # carga e campo necessários para 1,1 V de curvatura no Si
    curv = {}
    for N in (1e19, 1e20, 3e20):
        s = SiPorta(p, x, np.full_like(x, N))
        Qs, ph = s.tabela(0.12, 81)
        Q11 = float(np.interp(-1.1, ph[::-1], Qs[::-1])) if ph.min() < -1.1 else None
        curv[f"{N:.0e}"] = {"Q_C_m2": Q11, "n_grafeno_cm2": Q11 / q / 1e4 if Q11 else None,
                            "E_ox_MVcm": Q11 / (p.valor("eletrico.materiais.eps_r_SiO2") * eps0) / 1e8 if Q11 else None}
    # tensão de Dirac contra dopagem residual
    pil = grafeno.pilha_de_params(p, 20.0, SiPorta(p, x, ativo))
    vd = {f"{s * nd:.1e}": eletrico.tensao_dirac(pil, s * nd) for nd in (1.4e12, 3e12, 1e13) for s in (1, -1)}
    # ruptura e FN
    eps_ox = p.valor("eletrico.materiais.eps_r_SiO2") * eps0
    rup = oxido.faixa_ruptura(p)
    E = np.array([2, 4, 6, 8, 10]) * 1e8
    fn = {f"{e / 1e8:.0f} MV/cm": float(oxido.corrente_fn(p, e) / 1e4) for e in E}
    # região fora do n+ (substrato sob o óxido de 20 nm)
    parasita = {}
    for rho in (0.001, 0.01, 0.1, 1.0, 10.0):
        Nsub = eletrico.dopagem_de_resistividade(p, rho)
        el = eletrico.simular(p, x, np.full_like(x, Nsub), 20.0, None, 0.0, 0.0, V=V)
        parasita[str(rho)] = {"N_sub_cm3": Nsub, "C_min_sobre_Cox": float(el.C_F_cm2.min() / el.C_ox_F_cm2),
                              "C_em_mais8V": float(el.C_F_cm2[-1] / el.C_ox_F_cm2), "C_em_menos8V": float(el.C_F_cm2[0] / el.C_ox_F_cm2)}
    R["eletrico"] = {"perdas_si": perdas, "deplecao_1p1V": deplecao, "anterior_usuario": {f"{k:.0e}": v for k, v in ant.items()},
                     "curvatura_1p1V": curv, "V_D": vd, "ruptura_MVcm": rup,
                     "V_ruptura_20nm": [e * 1e8 * 20e-9 for e in rup["adams_MVcm"]], "FN_A_cm2": fn,
                     "parasita_fora_do_n+": parasita}

    # 6 calibração com os dados do artigo ----------------------------------------
    d, _ = ajuste.ler_csv(RAIZ / "dados" / "sputtering_calibracao.csv")
    R["sputtering"] = ajuste.calibrar_sputtering(d)
    taxa = d["espessura_nm"] / d["tempo_min"]
    pots = np.unique(d["potencia_W"])
    medias = np.array([taxa[d["potencia_W"] == pw].mean() for pw in pots])
    figuras.sputtering(pots, medias, ajuste.regressao_linear(pots, medias), out / "fig_sputtering.png")
    print(f"etapas determinísticas em {time.time() - t0:.0f} s", flush=True)

    # 5 Monte Carlo por ramo ---------------------------------------------------
    base = mc.preparar_base(p)
    rec_A = {"aceitar_provisorios": True, "recozimento": {"variante": "A_rta"}}
    combos = {}
    for ra in ("sem_aceleracao", "ho_plummer", "nomura"):
        tt = t20[f"A|{ra}|acumulo_classico"][2]["t_min"]  # 900 C
        for sinal in (+1, -1):
            combos[f"A|{ra}|acumulo|{'n' if sinal > 0 else 'p'}"] = (
                rec_A | {"oxidacao": {"metodo": "termico", "T_C": 900.0, "t_min": tt}},
                {"aceleracao": ra, "interface": "acumulo_classico", "sinal_dopagem": sinal})
    tt = t20["A|ho_plummer|acumulo_classico"][2]["t_min"]
    for ri in ("lado_oxido", "silicio_inativo"):
        combos[f"A|ho_plummer|{ri}|p"] = (rec_A | {"oxidacao": {"metodo": "termico", "T_C": 900.0, "t_min": tt}},
                                          {"aceleracao": "ho_plummer", "interface": ri, "sinal_dopagem": -1})
    for TB in (850.0, 900.0):
        ttb = t20["B900|ho_plummer|acumulo_classico"][2]["t_min"]
        combos[f"B{TB:.0f}|ho_plummer|acumulo|p"] = (
            {"aceitar_provisorios": True, "recozimento": {"variante": "B_forno", "T_forno_C": TB},
             "oxidacao": {"metodo": "termico", "T_C": 900.0, "t_min": ttb}},
            {"aceleracao": "ho_plummer", "interface": "acumulo_classico", "sinal_dopagem": -1})
    combos["A|sputtering|p"] = (rec_A | {"oxidacao": {"metodo": "sputtering"}}, {"sinal_dopagem": -1})
    mcres = {}
    for nome, (rec, ramos) in combos.items():
        t1 = time.time()
        r = mc.rodar(rec, n=a.n, semente=7, ramos=ramos, params=p, base=base)
        mcres[nome] = r
        np.savez_compressed(out / f"mc_{nome.replace('|', '_')}.npz",
                            **{f"e_{k}": v for k, v in r["entradas"].items()}, **{f"s_{k}": v for k, v in r["saidas"].items()})
        print(f"MC {nome}: {time.time() - t1:.0f} s", flush=True)
    R["montecarlo"] = {k: mc.resumir(v) for k, v in mcres.items()}
    sel = {k: v for k, v in mcres.items() if k.endswith("acumulo|p") and k.startswith("A")} | {"A|sputtering|p": mcres["A|sputtering|p"]}
    figuras.histogramas(sel, "espessura_ox_nm", out / "fig_mc_espessura.png", "espessura do óxido (nm)")
    figuras.histogramas({k: v for k, v in mcres.items() if k.startswith("A|ho_plummer|acumulo")}, "V_D",
                        out / "fig_mc_VD.png", "tensão de Dirac (V)")
    figuras.histogramas({k: v for k, v in mcres.items() if "|p" in k}, "Rs_final", out / "fig_mc_Rs.png",
                        "Rs da porta n+ (ohm/quadrado)")

    # 5b Sobol -----------------------------------------------------------------
    rec_s, ramos_s = combos["A|ho_plummer|acumulo|p"]
    t1 = time.time()
    sob = mc.sobol_cadeia(rec_s, N=a.sobol, ramos=ramos_s, params=p, base=base)
    print(f"Sobol: {time.time() - t1:.0f} s", flush=True)
    for s, v in sob.items():
        figuras.sobol(v, out / f"fig_sobol_{s}.png", s)
    R["sobol"] = {s: {"nomes": v["nomes"], "S1": v["S1"].tolist(), "ST": v["ST"].tolist(),
                      "S1_ic": v["S1_ic"].tolist(), "ST_ic": v["ST_ic"].tolist()} for s, v in sob.items()}

    R["provisorios_usados"] = sorted(set(p.provisorios_usados))
    (out / "resumo.json").write_text(json.dumps(R, indent=1, ensure_ascii=False, default=lambda o: o.tolist() if hasattr(o, "tolist") else str(o)))
    print(f"total {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
