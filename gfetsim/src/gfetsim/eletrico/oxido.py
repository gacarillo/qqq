"""Limites do óxido de porta: ruptura (B1, B2) e tunelamento Fowler-Nordheim (R45, R46)."""
from __future__ import annotations

import numpy as np

from ..constantes import h, m0, q


def campo_oxido(n_m2, Q_f_m2, eps_ox):
    """Campo no óxido (V/m) a partir da carga do grafeno; a carga fixa fica do lado do Si."""
    return np.abs(q * n_m2) / eps_ox


def faixa_ruptura(params):
    a = params.no("eletrico.oxido.ruptura.adams")["faixa"]
    o = params.no("eletrico.oxido.ruptura.oshea")
    return {"adams_MVcm": (a["min"], a["max"]), "oshea_MVcm": (o["valor"], o["incerteza"]["sigma"])}


RAMOS_FN = ("williams", "fukuda")


def barreira_e_massa(params, ramo: str = "williams"):
    """Par (barreira em eV, massa relativa) de cada ramo.

    williams usa a barreira de L9 menos o gap de L7 com a massa de R45, que foi
    tirada no regime de Fowler-Nordheim. fukuda usa o par de L11, tirado no
    regime direto. Os dois pares vêm cada um de uma fonte e não se misturam.
    """
    r = "eletrico.oxido.fowler_nordheim."
    if ramo == "williams":
        return params.valor(r + "barreira_Si_SiO2"), params.valor(r + "massa_efetiva_rel")
    if ramo == "fukuda":
        return params.valor(r + "ramo_fukuda.barreira_Si_SiO2"), params.valor(r + "ramo_fukuda.massa_efetiva_rel")
    raise ValueError(f"ramo de Fowler-Nordheim desconhecido: {ramo}")


def corrente_fn(params, E_V_m, barreira_eV=None, fator_reducao=None, ramo: str = "williams"):
    """J = A E^2 exp(-B/E) (A/m2); prefator teórico dividido pelo fator medido (R45)."""
    phi_ramo, mrel = barreira_e_massa(params, ramo)
    phi = barreira_eV if barreira_eV is not None else phi_ramo
    if fator_reducao is None:
        f = params.no("eletrico.oxido.fowler_nordheim.corrente_medida_abaixo_teoria")["faixa"]
        fator_reducao = np.sqrt(f["min"] * f["max"])
    A = q**3 / (8 * np.pi * h * phi * q) * (1.0 / mrel)
    B = 8 * np.pi * np.sqrt(2 * mrel * m0) * (phi * q) ** 1.5 / (3 * q * h)
    E = np.maximum(np.abs(E_V_m), 1.0)
    return A * E**2 * np.exp(-B / E) / fator_reducao
