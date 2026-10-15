"""Histerese da tensão de Dirac por cargas e dipolos de água adsorvida (R47, R48, R49).

Modelo de relaxação de primeira ordem [C], na linha de R47
    dV_t/dt = (alfa (V_G - V_D0) - V_t) / tau
O deslocamento V_t soma-se à tensão de Dirac. Com varredura rápida (tempo de
varredura << tau) a histerese some, como R47 observa em SiO2. alfa e tau não têm
valor publicado para este dispositivo e são parâmetros de calibração [B], ajustados
às curvas de ida e volta do usuário (dados abertos de R49 servem de teste).
"""
from __future__ import annotations

import numpy as np


def varrer(V_ida: np.ndarray, taxa_V_s: float, alfa: float, tau_s: float, V_D0: float = 0.0):
    """Tensão de Dirac efetiva ao longo de uma varredura de ida e volta."""
    V = np.concatenate([V_ida, V_ida[::-1]])
    dt = np.abs(np.diff(V, prepend=V[0])) / taxa_V_s
    Vt = np.zeros_like(V)
    for i in range(1, V.size):
        alvo = alfa * (V[i] - V_D0)
        Vt[i] = alvo + (Vt[i - 1] - alvo) * np.exp(-dt[i] / tau_s)
    return V, V_D0 + Vt


def largura(V_ida, taxa_V_s, alfa, tau_s, V_D0=0.0):
    """Diferença entre o deslocamento na volta e na ida, no meio da varredura (V)."""
    V, VD = varrer(V_ida, taxa_V_s, alfa, tau_s, V_D0)
    n = V_ida.size
    meio = n // 2
    return float(VD[2 * n - 1 - meio] - VD[meio])
