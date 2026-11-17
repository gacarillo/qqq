"""Propriedades do Si usadas no recozimento e na resistência de folha."""
from __future__ import annotations

import numpy as np

from ..constantes import k_B_eV, q


def ni(params, T_C: float) -> float:
    """Concentração intrínseca em temperatura de processo (forma A T^1,5 exp(-Eg/2kT), provisória [I])."""
    T = T_C + 273.15
    A = params.valor("recozimento.silicio.ni_T.A")
    Eg = params.valor("recozimento.silicio.ni_T.Eg_eff")
    return A * T**1.5 * np.exp(-Eg / (2 * k_B_eV * T))


def eletrons(Nd: np.ndarray, ni_: float) -> np.ndarray:
    """Neutralidade de carga com doadores totalmente ionizados (alta temperatura)."""
    return 0.5 * Nd + np.sqrt(0.25 * Nd**2 + ni_**2)


def n_e(params, T_C: float) -> float:
    """Concentração ativa em equilíbrio com o precipitado SiP (N24)."""
    A = params.valor("recozimento.solubilidade_P.A_ne")
    Ea = params.valor("recozimento.solubilidade_P.Ea_ne")
    return A * np.exp(-Ea / (k_B_eV * (T_C + 273.15)))


def C_sat(params, T_C: float) -> float:
    """P total (ativo + inativo móvel) em equilíbrio com o SiP (N24)."""
    A = params.valor("recozimento.solubilidade_P.A_sat")
    Ea = params.valor("recozimento.solubilidade_P.Ea_sat")
    return A * np.exp(-Ea / (k_B_eV * (T_C + 273.15)))


def mobilidade_masetti(params, N: np.ndarray) -> np.ndarray:
    """Mobilidade de elétrons em Si:P a 300 K (Masetti, R22; parâmetros provisórios [I])."""
    b = "recozimento.mobilidade_si.masetti_eletrons_P."
    v = {k: params.valor(b + k) for k in ("mu_min1", "mu_min2", "mu1", "mu_max", "Cr", "Cs", "alpha", "beta", "Pc")}
    N = np.maximum(np.asarray(N, dtype=float), 1.0)
    termo_pc = np.exp(-v["Pc"] / N) if v["Pc"] > 0 else 1.0
    return (v["mu_min1"] * termo_pc
            + (v["mu_max"] - v["mu_min2"]) / (1 + (N / v["Cr"]) ** v["alpha"])
            - v["mu1"] / (1 + (v["Cs"] / N) ** v["beta"]))


def mobilidade(params, N: np.ndarray, ramo: str = "masetti") -> np.ndarray:
    mu = mobilidade_masetti(params, N)
    if ramo == "limite_inferior_qin":
        lim = params.valor("recozimento.mobilidade_si.qin_limite_inferior.mu_acima_1e21")
        acima = params.valor("recozimento.mobilidade_si.qin_limite_inferior.abaixo_dos_modelos_acima_de")
        # interpola em log entre o modelo em 1e20 e o valor de R24 em 1e21 [C]
        f = np.clip(np.log10(np.maximum(N, 1.0) / acima), 0.0, 1.0)
        mu = np.where(N > acima, (1 - f) * mu + f * np.minimum(mu, lim), mu)
    return mu


def resistencia_folha(params, x_nm: np.ndarray, n_ativo: np.ndarray, ramo: str = "masetti",
                      fundo_cm3: float = 0.0) -> float:
    """Rs em ohm/quadrado da camada n+ (ionização completa, R35 a 300 K muito acima de Mott)."""
    n = n_ativo + fundo_cm3
    sigma = q * mobilidade(params, n, ramo) * n_ativo  # S/cm, só a contribuição da camada
    return 1.0 / np.trapezoid(sigma, x_nm * 1e-7)
