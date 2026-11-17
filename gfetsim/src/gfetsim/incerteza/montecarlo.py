"""Módulo 5, Monte Carlo da cadeia completa.

Regras
* Cada parâmetro com incerteza declarada no params.yaml é amostrado pela sua distribuição.
* Parâmetros de varredura (temperatura do forno B, T e t da oxidação, resistividade do
  substrato) não são amostrados; cada ponto da varredura é um Monte Carlo separado.
* Ramos (alternativas não resolvidas pela literatura) nunca são misturados: cada
  combinação de ramos gera sua própria distribuição.

Para caber em 1000 amostras, o RustBCA roda uma vez no valor nominal e duas vezes
em E (1 +- 5 %); o perfil de cada amostra vem do ajuste de Pearson com Rp e dRp
escalados pela lei de potência local [C]. O óxido nativo desloca o perfil pela
diferença de espessura [C].
"""
from __future__ import annotations

import multiprocessing as mp
import os
from dataclasses import dataclass

import numpy as np

from ..eletrico import modulo as eletrico
from ..implantacao import modulo as implantacao
from ..implantacao.pearson import Momentos, densidade_pearson
from ..oxidacao import cinetica
from ..oxidacao import modulo as oxidacao
from ..recozimento import modulo as recozimento
from ..recozimento import silicio
from ..recozimento.modulo import EstadoDopante, Etapa, aplicar

_ESTADO = {}


@dataclass
class Base:
    mo: Momentos
    retido: float
    a_Rp: float
    a_dRp: float
    E0: float
    ox0: float
    Fn_x: np.ndarray
    Fn: np.ndarray


def preparar_base(params, n_ions=20000, semente=1) -> Base:
    E0 = params.valor("receita.implantacao.energia")
    ox0 = params.valor("receita.implantacao.oxido_nativo")
    r0 = implantacao.simular(params, n_ions=n_ions, semente=semente)
    rm = implantacao.simular(params, energia_keV=0.95 * E0, n_ions=n_ions, semente=semente + 1)
    rp = implantacao.simular(params, energia_keV=1.05 * E0, n_ions=n_ions, semente=semente + 2)
    lnE = np.log(1.05 / 0.95)
    a = np.log(rp.momentos.media / rm.momentos.media) / lnE
    b = np.log(rp.momentos.desvio / rm.momentos.desvio) / lnE
    return Base(r0.momentos, r0.dose_si / params.valor("receita.implantacao.dose"), a, b, E0, ox0, r0.x_nm, r0.Fn_eV_cm)


def amostrar(params, rec: dict, n: int, rng: np.random.Generator) -> list[dict]:
    """Sorteia as entradas incertas. Devolve uma lista de dicionários (uma amostra cada)."""
    P = params
    am = {
        "energia": P.amostrar("receita.implantacao.energia", rng, n),
        "dose": P.amostrar("receita.implantacao.dose", rng, n),
        "oxido_nativo": P.amostrar("receita.implantacao.oxido_nativo", rng, n),
        "dose_limiar": P.amostrar("implantacao.amorfizacao.limiar_TA.dose_limiar", rng, n),
        "fator_ne": rng.normal(1.0, P.incerteza("recozimento.solubilidade_P.incerteza_ne")["sigma_rel"], n),
        "fator_spe": P.amostrar("recozimento.spe_550C.fator_aceleracao_P", rng, n),
        "T_rta": P.amostrar("receita.recozimento.variante_A_rta.temperatura", rng, n),
        "T_spe": P.amostrar("receita.recozimento.spe.temperatura", rng, n),
        "Q_f": P.amostrar("eletrico.oxido.carga_fixa_Qf", rng, n),
        "n_estrela": P.amostrar("eletrico.grafeno.n_residual.faixa_calibracao", rng, n),
        "n_dop": P.amostrar("eletrico.grafeno.dopagem_residual_prior", rng, n),
        "vF": P.amostrar("eletrico.grafeno.vF", rng, n),
        "mu_grafeno": P.amostrar("eletrico.grafeno.mobilidade.prior_calibracao", rng, n),
    }
    if rec.get("oxidacao", {}).get("metodo", "termico") == "sputtering":
        s = P.valor("receita.oxidacao_porta.sputtering.eps_r_sigma_rel_extra")
        am["fator_eps_ox"] = rng.normal(1.0, s, n)
        ip = P.no("receita.oxidacao_porta.sputtering.tempo_20nm_50W")
        t_nom, (lo, hi) = ip["valor"], ip["ip95"]
        # espessura = 20 nm * t_nom / t_real, com t_real no intervalo de previsão (dist. log-normal aproximada) [C]
        sig = (np.log(hi) - np.log(lo)) / (2 * 1.96)
        am["espessura_sputter"] = 20.0 * t_nom / np.exp(rng.normal(np.log(t_nom), sig, n))
    else:
        am["fator_eps_ox"] = np.ones(n)
    return [{k: float(v[i]) for k, v in am.items()} for i in range(n)]


def avaliar(th: dict) -> dict:
    """Cadeia para uma amostra. Usa o estado global do processo (params, receita, base)."""
    P, rec, base, ramos = _ESTADO["params"], _ESTADO["rec"], _ESTADO["base"], _ESTADO["ramos"]
    E = th["energia"]
    fRp = ramos.get("fator_alcance", 1.0)
    mo = Momentos(base.mo.media * (E / base.E0) ** base.a_Rp * fRp - (th["oxido_nativo"] - base.ox0),
                  base.mo.desvio * (E / base.E0) ** base.a_dRp * fRp, base.mo.assimetria, base.mo.curtose)
    x = np.arange(0.5, 450.0, 1.0)
    f, _ = densidade_pearson(x, mo)
    C = th["dose"] * base.retido * f * 1e7
    Fn = np.interp(x, base.Fn_x - (th["oxido_nativo"] - base.ox0), base.Fn, left=0.0, right=0.0)
    amorfo = implantacao.camada_amorfa(x, Fn, th["dose"], th["dose_limiar"])
    e = EstadoDopante(x, C, np.zeros_like(C), amorfo)
    Pm = P.copia(**{
        "recozimento.solubilidade_P.A_ne": P.valor("recozimento.solubilidade_P.A_ne") * th["fator_ne"],
        "recozimento.spe_550C.fator_aceleracao_P": th["fator_spe"],
    })
    rr = rec.get("recozimento", {})
    etapas = [Etapa("SPE", th["T_spe"], P.valor("receita.recozimento.spe.tempo") * 60.0)]
    if rr.get("variante", "A_rta") == "A_rta":
        etapas.append(Etapa("RTA", th["T_rta"], P.valor("receita.recozimento.variante_A_rta.tempo"), rapida=True))
    else:
        etapas.append(Etapa("forno", rr["T_forno_C"], P.valor("receita.recozimento.variante_B_forno.tempo") * 60.0))
    for et in etapas:
        e = aplicar(Pm, e, et, rr.get("ramo_desativacao", "equilibrio"))
    out = {"fracao_ativa": e.fracao_ativa, "Rs_recozido": silicio.resistencia_folha(Pm, e.x_nm, e.ativo),
           "amorfo_nm": amorfo[1] if amorfo else 0.0}
    ro = rec.get("oxidacao", {})
    if ro.get("metodo", "termico") == "termico":
        ox = oxidacao.oxidar(Pm, e, ro["T_C"], ro["t_min"], 0.0, ramos.get("aceleracao", "ho_plummer"),
                             ramos.get("interface", "acumulo_classico"), n_passos=40)
        e, esp = ox.estado, ox.espessura_nm
        out["espessura_ox_nm"] = esp
    else:
        esp = th["espessura_sputter"]
        out["espessura_ox_nm"] = esp
    out["Rs_final"] = silicio.resistencia_folha(Pm, e.x_nm, e.ativo)
    out["ativo_superficie"] = float(e.ativo[0])
    sinal = ramos.get("sinal_dopagem", +1)
    el = eletrico.simular(Pm.copia(**{"eletrico.grafeno.vF": th["vF"]}), e.x_nm, e.ativo, esp, None,
                          sinal * th["n_dop"], th["Q_f"], th["n_estrela"], th["mu_grafeno"],
                          eps_r_ox=P.valor("eletrico.materiais.eps_r_SiO2") * th["fator_eps_ox"])
    out["V_D"] = el.V_D
    i5 = np.argmin(np.abs(el.n_cm2 - 5e12))
    out["perda_si_5e12"] = float(el.perda_si[i5])
    out["C_min_sobre_Cox"] = float(el.C_F_cm2.min() / el.C_ox_F_cm2)
    out["Rsq_grafeno_5e12"] = float(el.R_quadrado_ohm[i5])
    out["E_ox_em_VD_mais_5V"] = float(np.interp(el.V_D + 5.0, el.V, el.E_ox_MVcm))
    return out


def _init(params, rec, base, ramos):
    _ESTADO.update(params=params, rec=rec, base=base, ramos=ramos)


def rodar(rec: dict, n: int = 1000, semente: int = 7, processos: int | None = None, ramos: dict | None = None,
          params=None, base=None):
    from ..cadeia import parametros_da_receita
    P = params or parametros_da_receita(rec)
    base = base or preparar_base(P)
    ramos = ramos or {}
    rng = np.random.default_rng(semente)
    entradas = amostrar(P, rec, n, rng)
    processos = processos or os.cpu_count() or 1
    if processos > 1:
        with mp.get_context("fork").Pool(processos, initializer=_init, initargs=(P, rec, base, ramos)) as pool:
            saidas = pool.map(avaliar, entradas, chunksize=max(1, n // (4 * processos)))
    else:
        _init(P, rec, base, ramos)
        saidas = [avaliar(t) for t in entradas]
    chaves_e = list(entradas[0])
    chaves_s = list(saidas[0])
    return {"entradas": {k: np.array([t[k] for t in entradas]) for k in chaves_e},
            "saidas": {k: np.array([s[k] for s in saidas]) for k in chaves_s},
            "ramos": ramos, "n": n, "semente": semente}


def resumir(res: dict) -> dict:
    out = {"n": res["n"], "ramos": res["ramos"]}
    for k, v in res["saidas"].items():
        q = np.percentile(v, [2.5, 50, 97.5])
        out[k] = {"p2.5": q[0], "mediana": q[1], "p97.5": q[2]}
    return out


ENTRADAS_SOBOL = [
    # nome, dist SALib, limites/parametros, transformação
    ("energia", "norm", ("receita.implantacao.energia",), None),
    ("dose", "norm", ("receita.implantacao.dose",), None),
    ("oxido_nativo", "unif", ("receita.implantacao.oxido_nativo",), None),
    ("dose_limiar", "unif", ("implantacao.amorfizacao.limiar_TA.dose_limiar",), None),
    ("fator_ne", "norm", ("recozimento.solubilidade_P.incerteza_ne",), None),
    ("fator_spe", "unif", ("recozimento.spe_550C.fator_aceleracao_P",), "log"),
    ("T_rta", "norm", ("receita.recozimento.variante_A_rta.temperatura",), None),
    ("T_spe", "norm", ("receita.recozimento.spe.temperatura",), None),
    ("Q_f", "unif", ("eletrico.oxido.carga_fixa_Qf",), "log"),
    ("n_estrela", "unif", ("eletrico.grafeno.n_residual.faixa_calibracao",), "log"),
    ("n_dop", "unif", ("eletrico.grafeno.dopagem_residual_prior",), "log"),
    ("vF", "norm", ("eletrico.grafeno.vF",), None),
    ("mu_grafeno", "unif", ("eletrico.grafeno.mobilidade.prior_calibracao",), "log"),
]


def problema_sobol(params) -> tuple[dict, list]:
    nomes, limites, dists, transf = [], [], [], []
    for nome, d, (chave,), t in ENTRADAS_SOBOL:
        inc = params.incerteza(chave)
        if inc["tipo"] == "normal":
            b = [float(params.valor(chave)), inc["sigma"]]
        elif inc["tipo"] == "normal_rel":
            v = float(params.valor(chave)) if params.no(chave).get("valor") is not None else 1.0
            b = [v, abs(v) * inc["sigma_rel"]]
        elif t == "log":
            b = [np.log10(inc["min"]), np.log10(inc["max"])]
        else:
            b = [inc["min"], inc["max"]]
        nomes.append(nome), limites.append(b), dists.append(d), transf.append(t)
    return {"num_vars": len(nomes), "names": nomes, "bounds": limites, "dists": dists}, transf


def sobol_cadeia(rec: dict, N: int = 64, semente: int = 11, processos: int | None = None, ramos=None,
                 params=None, base=None, saidas=("espessura_ox_nm", "Rs_final", "V_D", "perda_si_5e12",
                                                 "Rsq_grafeno_5e12", "C_min_sobre_Cox")):
    from SALib.analyze import sobol as an
    from SALib.sample import sobol as sa
    from ..cadeia import parametros_da_receita
    P = params or parametros_da_receita(rec)
    base = base or preparar_base(P)
    prob, transf = problema_sobol(P)
    X = sa.sample(prob, N, calc_second_order=False, seed=semente)
    fixos = {"fator_eps_ox": 1.0}
    entradas = []
    for x in X:
        th = dict(fixos)
        for nome, v, t in zip(prob["names"], x, transf):
            th[nome] = float(10**v if t == "log" else v)
        entradas.append(th)
    processos = processos or os.cpu_count() or 1
    with mp.get_context("fork").Pool(processos, initializer=_init, initargs=(P, rec, base, ramos or {})) as pool:
        Y = pool.map(avaliar, entradas, chunksize=max(1, len(entradas) // (4 * processos)))
    out = {}
    for s in saidas:
        y = np.array([d[s] for d in Y])
        Si = an.analyze(prob, y, calc_second_order=False, seed=semente)
        out[s] = {"S1": Si["S1"], "S1_ic": Si["S1_conf"], "ST": Si["ST"], "ST_ic": Si["ST_conf"], "nomes": prob["names"]}
    return out
