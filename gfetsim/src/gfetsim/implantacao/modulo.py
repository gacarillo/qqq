"""Módulo 1, implantação de P.

Encadeia o RustBCA, o ajuste de Pearson aos momentos, a camada amorfa e a
transmissão pela máscara. A saída é um PerfilImplantado com profundidade
medida a partir da superfície do Si (o óxido nativo fica à esquerda de zero).
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from . import rustbca as rb
from .pearson import Momentos, densidade_pearson


@dataclass
class PerfilImplantado:
    x_nm: np.ndarray
    C_cm3: np.ndarray
    dose_si: float
    dose_oxido: float
    dose_refletida: float
    momentos: Momentos
    tipo_pearson: str
    erro_Rp_nm: float
    Fn_eV_cm: np.ndarray          # energia nuclear por íon e por cm, na grade x_nm
    amorfo_nm: tuple[float, float] | None
    dose_limiar: float
    transmissao_mascara: float | None = None
    oxido_nativo_nm: float = 0.0
    hist_x_nm: np.ndarray = field(default_factory=lambda: np.empty(0))
    hist_C_cm3: np.ndarray = field(default_factory=lambda: np.empty(0))
    notas: list[str] = field(default_factory=list)

    @property
    def pico_cm3(self) -> float:
        return float(self.C_cm3.max())


def energia_nuclear(res: rb.ResultadoBCA, x_nm: np.ndarray, deslocamento_nm: float) -> np.ndarray:
    """Densidade de perda nuclear do íon por unidade de profundidade (eV/cm por íon)."""
    dx = x_nm[1] - x_nm[0]
    bordas = np.concatenate([x_nm - dx / 2, [x_nm[-1] + dx / 2]])
    h, _ = np.histogram(res.perda_nuclear_x_nm - deslocamento_nm, bins=bordas, weights=res.perda_nuclear_eV)
    return h / res.n_ions / (dx * 1e-7)


def camada_amorfa(x_nm: np.ndarray, Fn: np.ndarray, dose: float, dose_limiar: float) -> tuple[float, float] | None:
    """Região onde Fn(x) * dose >= Fn_max * dose_limiar (ramo limiar_TA).

    Devolve (início, fim) da maior região contígua que contém o máximo de Fn.
    """
    lim = Fn.max() * dose_limiar / dose
    dentro = Fn >= lim
    if not dentro.any():
        return None
    i0 = int(np.argmax(Fn))
    a = i0
    while a > 0 and dentro[a - 1]:
        a -= 1
    b = i0
    while b < len(x_nm) - 1 and dentro[b + 1]:
        b += 1
    return float(x_nm[a]), float(x_nm[b])


def simular(params, energia_keV: float | None = None, dose: float | None = None, inclinacao: float | None = None,
            oxido_nativo_nm: float | None = None, n_ions: int | None = None, semente: int = 1,
            variante: str = "B_lamina", dose_limiar: float | None = None,
            x_max_nm: float = 300.0, dx_nm: float = 0.5) -> PerfilImplantado:
    E = energia_keV if energia_keV is not None else params.valor("receita.implantacao.energia")
    D = dose if dose is not None else params.valor("receita.implantacao.dose")
    th = inclinacao if inclinacao is not None else params.valor("receita.implantacao.inclinacao")
    ox = oxido_nativo_nm if oxido_nativo_nm is not None else params.valor("receita.implantacao.oxido_nativo")
    N = n_ions or int(params.valor("implantacao.rustbca.n_ions_minimo"))
    notas = []

    res = rb.rodar(E, th, rb.camadas_receita(params, ox), n_ions=N, semente=semente, params=params)
    x_si = res.x_nm - ox
    no_si = x_si[x_si > 0]
    mo = Momentos.de_amostra(no_si)
    grade = np.arange(dx_nm / 2, x_max_nm, dx_nm)
    f, tipo = densidade_pearson(grade, mo)
    dose_si = D * no_si.size / N
    C = dose_si * f * 1e7  # f em 1/nm -> 1/cm
    if tipo != "IV":
        notas.append(f"momentos fora da região Pearson IV; usado Pearson {tipo}")

    bordas = np.concatenate([grade - dx_nm / 2, [grade[-1] + dx_nm / 2]])
    hist, _ = np.histogram(no_si, bins=bordas)
    hist_C = D * hist / N / (dx_nm * 1e-7)

    Fn = energia_nuclear(res, grade, ox)
    if dose_limiar is None:
        inc = params.incerteza("implantacao.amorfizacao.limiar_TA.dose_limiar")
        dose_limiar = 0.5 * (inc["min"] + inc["max"])
        notas.append("dose limiar no centro da faixa de A2; o Monte Carlo amostra a faixa inteira")
    amorfo = camada_amorfa(grade, Fn, D, dose_limiar)

    trans = None
    if variante == "A_mascara":
        esp = params.no("receita.implantacao.variantes.A_mascara")["oxido_mascara_nm"]
        rm = rb.rodar(E, th, rb.camadas_receita(params, esp), n_ions=N, semente=semente + 1, params=params)
        trans = float(np.sum(rm.x_nm > esp)) / N
        if trans == 0:
            notas.append(f"nenhum de {N} íons atravessou {esp:.0f} nm de SiO2; transmissão < {1 / N:.0e}")

    return PerfilImplantado(
        x_nm=grade, C_cm3=C, dose_si=dose_si, dose_oxido=D * np.sum((x_si <= 0)) / N,
        dose_refletida=D * res.refletidos / N, momentos=mo, tipo_pearson=tipo,
        erro_Rp_nm=mo.desvio / np.sqrt(no_si.size), Fn_eV_cm=Fn, amorfo_nm=amorfo,
        dose_limiar=dose_limiar, transmissao_mascara=trans, oxido_nativo_nm=ox,
        hist_x_nm=grade, hist_C_cm3=hist_C, notas=notas,
    )
