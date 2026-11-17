"""Cinética de oxidação seca de Si(100): Deal e Grove, regime fino de Massoud e
aceleração por dopagem de Ho e Plummer.

Unidades internas: nm e min.
"""
from __future__ import annotations

import numpy as np
from scipy.integrate import solve_ivp

from ..constantes import k_B_eV
from ..recozimento import difusao, silicio


def _kT(T_C):
    return k_B_eV * (T_C + 273.15)


def deal_grove_100(params, T_C: float) -> tuple[float, float]:
    """B (nm^2/min) e B/A (nm/min) para Si(100) seco, tabela 2.2 de S1."""
    b = "oxidacao.deal_grove."
    kT = _kT(T_C)
    B = params.valor(b + "B_seco.C") * np.exp(-params.valor(b + "B_seco.Ea") / kT) * 1e6 / 60.0
    BA111 = params.valor(b + "B_sobre_A_seco_111.C") * np.exp(-params.valor(b + "B_sobre_A_seco_111.Ea") / kT) * 1e3 / 60.0
    return B, BA111 / params.valor(b + "razao_111_100")


def massoud_100(params, T_C: float) -> dict:
    """Constantes de Massoud para Si(100), T < 1000 C (tabelas 2.3 e 2.4 de S1)."""
    b = "oxidacao.massoud_regime_fino.Si100_T_menor_1000C."
    kT = _kT(T_C)
    v = lambda k: params.valor(b + k)
    sinal = 1.0 if params.valor("oxidacao.massoud_regime_fino.sinal_tau") == "+" else -1.0
    return {
        "B": v("C_B") * np.exp(-v("E_B") / kT),
        "BA": v("C_BA") * np.exp(-v("E_BA") / kT),
        "K1": v("K1_0") * np.exp(-v("E_K1") / kT),
        "K2": v("K2_0") * np.exp(-v("E_K2") / kT),
        "tau1": v("tau1_0") * np.exp(sinal * v("E_tau1") / kT),
        "tau2": v("tau2_0") * np.exp(sinal * v("E_tau2") / kT),
    }


def fator_ho_plummer(params, T_C: float, n_superficie: float) -> float:
    """F = (B/A)/(B/A)i = 1 + gamma (CV/CVi - 1) (S2). Razões de vacâncias provisórias [I]."""
    if not params.aceitar_provisorios and params.no(
            "oxidacao.oxidacao_acelerada_dopagem.ho_plummer.razoes_vacancias_intrinsecas").get("valor") is None:
        from ..params import ParametroAusente
        raise ParametroAusente("oxidacao.oxidacao_acelerada_dopagem.ho_plummer.razoes_vacancias_intrinsecas",
                               "provisório usa as razões D-/D0 e D=/D0 de Fair-Tsai")
    hp = "oxidacao.oxidacao_acelerada_dopagem.ho_plummer."
    kT = _kT(T_C)
    gamma = params.valor(hp + "gamma0") * np.exp(-params.valor(hp + "gammaE") / kT)
    ni_ = silicio.ni(params, T_C)
    D0 = difusao.difusividade_ft(params, T_C, np.array([0.0]))[0]
    r1 = (difusao.difusividade_ft(params, T_C, np.array([1.0]))[0] - D0) / D0
    # separa D- e D=: D(1) = D0 + D- + D=, D(2) = D0 + 2D- + 4D=
    d2 = (difusao.difusividade_ft(params, T_C, np.array([2.0]))[0] - D0) / D0
    r_mm = (d2 - 2 * r1) / 2.0
    r_m = r1 - r_mm
    u = n_superficie / ni_
    cv = (1 + r_m * u + r_mm * u**2) / (1 + r_m + r_mm)
    return float(1.0 + gamma * (cv - 1.0))


def taxa(params, T_C: float, x_nm: float, t_min: float, modelo: str = "massoud", F: float = 1.0) -> float:
    """dx/dt em nm/min. F multiplica só B/A (R23: B não muda com a dopagem)."""
    if modelo == "deal_grove":
        B, BA = deal_grove_100(params, T_C)
        return B / (2 * x_nm + B / (F * BA))
    m = massoud_100(params, T_C)
    A = m["B"] / (F * m["BA"])
    num = m["B"] + m["K1"] * np.exp(-t_min / m["tau1"]) + m["K2"] * np.exp(-t_min / m["tau2"])
    return num / (2 * x_nm + A)


def espessura(params, T_C: float, t_min, x0_nm: float = 0.0, modelo: str = "massoud", F: float = 1.0):
    """Espessura (nm) nos tempos pedidos, com fator de aceleração constante."""
    t = np.atleast_1d(np.asarray(t_min, dtype=float))
    sol = solve_ivp(lambda tt, x: [taxa(params, T_C, x[0], tt, modelo, F)], (0.0, t.max()), [x0_nm],
                    t_eval=t, rtol=1e-8, atol=1e-6, method="LSODA")
    return sol.y[0] if np.ndim(t_min) else float(sol.y[0][0])


def tempo_para(params, T_C: float, alvo_nm: float, x0_nm: float = 0.0, modelo: str = "massoud",
               F: float = 1.0, t_max_min: float = 6000.0) -> float:
    ev = lambda tt, x: x[0] - alvo_nm
    ev.terminal, ev.direction = True, 1
    sol = solve_ivp(lambda tt, x: [taxa(params, T_C, x[0], tt, modelo, F)], (0.0, t_max_min), [x0_nm],
                    events=ev, rtol=1e-8, atol=1e-6, method="LSODA")
    return float(sol.t_events[0][0]) if sol.t_events[0].size else np.inf
