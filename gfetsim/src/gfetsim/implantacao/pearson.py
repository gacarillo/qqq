"""Distribuição de Pearson IV a partir dos quatro momentos.

Parametrização de Heinrich (CERN, "A guide to the Pearson type IV
distribution", 2004), que é a usada em simuladores de processo. A densidade é
normalizada numericamente na grade pedida. Se os momentos não caem na região
do tipo IV (critério kappa entre 0 e 1), a função levanta ValueError e quem
chama decide o fallback (histograma suavizado).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class Momentos:
    media: float
    desvio: float
    assimetria: float
    curtose: float  # beta2, não o excesso

    @classmethod
    def de_amostra(cls, x: np.ndarray) -> "Momentos":
        m = float(np.mean(x))
        d = x - m
        s = float(np.sqrt(np.mean(d**2)))
        return cls(m, s, float(np.mean(d**3) / s**3), float(np.mean(d**4) / s**4))


def kappa(g1: float, b2: float) -> float:
    den = 4.0 * (4.0 * b2 - 3.0 * g1**2) * (2.0 * b2 - 3.0 * g1**2 - 6.0)
    return g1**2 * (b2 + 3.0) ** 2 / den


def parametros(mo: Momentos) -> tuple[float, float, float, float]:
    g1, b2 = mo.assimetria, mo.curtose
    k = kappa(g1, b2)
    if not (0.0 < k < 1.0) or (2.0 * b2 - 3.0 * g1**2 - 6.0) <= 0:
        raise ValueError(f"momentos fora da região Pearson IV (kappa = {k:.3f})")
    r = 6.0 * (b2 - g1**2 - 1.0) / (2.0 * b2 - 3.0 * g1**2 - 6.0)
    m = 1.0 + r / 2.0
    raiz = 16.0 * (r - 1.0) - g1**2 * (r - 2.0) ** 2
    if raiz <= 0:
        raise ValueError("momentos fora da região Pearson IV")
    nu = -r * (r - 2.0) * g1 / np.sqrt(raiz)
    a = mo.desvio * np.sqrt(raiz) / 4.0
    lam = mo.media - (r - 2.0) * g1 * mo.desvio / 4.0
    return m, nu, a, lam


def densidade(x: np.ndarray, mo: Momentos) -> np.ndarray:
    m, nu, a, lam = parametros(mo)
    u = (x - lam) / a
    logf = -m * np.log1p(u**2) - nu * np.arctan(u)
    f = np.exp(logf - logf.max())
    area = np.trapezoid(f, x)
    return f / area


def densidade_tipo_I(x: np.ndarray, mo: Momentos) -> np.ndarray:
    """Pearson I (beta de quatro parâmetros) pelo método dos momentos.

    Usada quando a curtose fica abaixo da linha do tipo III, região em que o
    tipo IV não existe. Fórmulas clássicas de Pearson (Elderton e Johnson,
    Systems of Frequency Curves, cap. 4).
    """
    b1, b2 = mo.assimetria**2, mo.curtose
    den = 6.0 + 3.0 * b1 - 2.0 * b2
    if den <= 0:
        raise ValueError("momentos fora da região Pearson I")
    r = 6.0 * (b2 - b1 - 1.0) / den
    raiz = np.sqrt((r + 2.0) ** 2 * b1 + 16.0 * (r + 1.0))
    s = np.sign(mo.assimetria) * (r + 2.0) * np.sqrt(b1) / raiz
    alfa, beta = r / 2.0 * (1.0 - s), r / 2.0 * (1.0 + s)
    escala = mo.desvio * raiz / 2.0
    loc = mo.media - escala * alfa / (alfa + beta)
    u = (x - loc) / escala
    f = np.zeros_like(x, dtype=float)
    dentro = (u > 0) & (u < 1)
    f[dentro] = np.exp((alfa - 1) * np.log(u[dentro]) + (beta - 1) * np.log1p(-u[dentro]))
    return f / np.trapezoid(f, x)


def densidade_pearson(x: np.ndarray, mo: Momentos) -> tuple[np.ndarray, str]:
    """Tenta o tipo IV e cai para o tipo I quando os momentos exigem."""
    try:
        return densidade(x, mo), "IV"
    except ValueError:
        return densidade_tipo_I(x, mo), "I"
