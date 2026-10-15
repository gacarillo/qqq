"""Cadeia completa: receita YAML -> módulos 1 a 4."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from .eletrico import modulo as eletrico
from .implantacao import modulo as implantacao
from .oxidacao import cinetica
from .oxidacao import modulo as oxidacao
from .params import carregar, ler_yaml
from .recozimento import modulo as recozimento
from .recozimento import silicio


@dataclass
class ResultadoCadeia:
    receita: dict
    implante: object
    recozido: object
    oxidado: object | None
    espessura_ox_nm: float
    t_ox_min: float | None
    Rs_pos_recozimento: float
    Rs_final: float
    eletrico: dict = field(default_factory=dict)
    provisorios: list[str] = field(default_factory=list)


def ler_receita(caminho) -> dict:
    return ler_yaml(caminho)


def parametros_da_receita(rec: dict):
    return carregar(rec.get("params"), aceitar_provisorios=bool(rec.get("aceitar_provisorios", False)),
                    sobrescrever=rec.get("sobrescrever", {}) or {})


def simular(rec: dict, params=None, verbose: bool = False) -> ResultadoCadeia:
    p = params or parametros_da_receita(rec)
    ri = rec.get("implantacao", {})
    perf = implantacao.simular(p, variante=ri.get("variante", "B_lamina"), n_ions=ri.get("n_ions"),
                               semente=ri.get("semente", 1), dose=ri.get("dose"), energia_keV=ri.get("energia_keV"))
    rr = rec.get("recozimento", {})
    e = recozimento.simular(p, perf, rr.get("variante", "A_rta"), rr.get("T_forno_C"),
                            rr.get("ramo_desativacao", "equilibrio"))
    Rs1 = silicio.resistencia_folha(p, e.x_nm, e.ativo)
    ro = rec.get("oxidacao", {})
    metodo = ro.get("metodo", "termico")
    alvo = ro.get("alvo_nm", p.valor("receita.oxidacao_porta.espessura_alvo"))
    ox = None
    t_ox = None
    if metodo == "termico":
        T = ro["T_C"]
        if ro.get("t_min"):
            t_ox = ro["t_min"]
            ox = oxidacao.oxidar(p, e, T, t_ox, ro.get("x0_nm", 0.0), ro.get("ramo_aceleracao", "ho_plummer"),
                                 ro.get("ramo_interface", "acumulo_classico"))
        else:
            t_ox, ox = oxidacao.tempo_para_alvo(p, e, T, alvo, ro.get("ramo_aceleracao", "ho_plummer"),
                                                ro.get("ramo_interface", "acumulo_classico"), ro.get("x0_nm", 0.0))
        e_final, esp = ox.estado, ox.espessura_nm
    else:
        e_final, esp = e, float(alvo)  # óxido depositado: não consome Si nem segrega
    Rs2 = silicio.resistencia_folha(p, e_final.x_nm, e_final.ativo)
    res_el = {}
    rel = rec.get("eletrico", {})
    for rho in rel.get("rho_substrato_ohm_cm", [None]):
        res_el[rho] = eletrico.simular(p, e_final.x_nm, e_final.ativo, esp, rho, rel.get("n_dop_cm2", 0.0),
                                       rel.get("Q_f_cm2", 0.0), rel.get("n_estrela_cm2"), rel.get("mu_grafeno"))
    return ResultadoCadeia(rec, perf, e, ox, esp, t_ox, Rs1, Rs2, res_el, p.provisorios_usados)


def mapa_espessura(params, T_C: np.ndarray, t_min: np.ndarray, F: float = 1.0, modelo: str = "massoud"):
    """Espessura (nm) em grade T x t, com fator de aceleração constante."""
    return np.array([cinetica.espessura(params, T, t_min, modelo=modelo, F=F) for T in T_C])
