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


def corrente_fn(params, E_V_m, barreira_eV=None, fator_reducao=None):
    """J = A E^2 exp(-B/E) (A/m2); m* de R45 no expoente, prefator teórico dividido pelo fator medido (R45)."""
    mrel = params.valor("eletrico.oxido.fowler_nordheim.massa_efetiva_rel")
    phi = barreira_eV if barreira_eV is not None else params.valor("eletrico.oxido.fowler_nordheim.barreira_Si_SiO2")
    if fator_reducao is None:
        f = params.no("eletrico.oxido.fowler_nordheim.corrente_medida_abaixo_teoria")["faixa"]
        fator_reducao = np.sqrt(f["min"] * f["max"])
    A = q**3 / (8 * np.pi * h * phi * q) * (1.0 / mrel)
    B = 8 * np.pi * np.sqrt(2 * mrel * m0) * (phi * q) ** 1.5 / (3 * q * h)
    E = np.maximum(np.abs(E_V_m), 1.0)
    return A * E**2 * np.exp(-B / E) / fator_reducao
