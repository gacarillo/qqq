"""Difusão de P com o modelo de Fair e Tsai, por diferenças finitas implícitas.

Equação resolvida
    dC/dt = d/dx [ h(n) D_FT(n) d C_mov/dx ]
com C_mov = min(C, C_sat(T)) (P em solução, N24), D_FT = D0 + D- (n/ni) + D= (n/ni)^2
(R6) e o fator de campo h = 1 + C_a / sqrt(C_a^2 + 4 ni^2) [C], em que C_a é o P
ativo, limitado por n_e(T) (N24). O precipitado é imóvel e se dissolve quando
C_mov cai abaixo de C_sat. A superfície é refletora (recozimento em N2); a
oxidação troca essa condição pelo fluxo de segregação (módulo 3).

Limitações declaradas
* A cauda acelerada de Fair e Tsai (dissociação do par P-V=) não está incluída.
* TED não está incluída por falta do prefator de dissolução dos {311}.
"""
from __future__ import annotations

import numpy as np
from scipy.linalg import solve_banded

from ..constantes import k_B_eV
from . import silicio


def difusividade_ft(params, T_C: float, n_sobre_ni: np.ndarray) -> np.ndarray:
    kT = k_B_eV * (T_C + 273.15)
    b = "recozimento.difusao_P.fair_tsai."
    D0 = params.valor(b + "D0_neutro") * np.exp(-params.valor(b + "Ea_neutro") / kT)
    Dm = params.valor(b + "D0_menos") * np.exp(-params.valor(b + "Ea_menos") / kT)
    Dmm = params.valor(b + "D0_duplo") * np.exp(-params.valor(b + "Ea_duplo") / kT)
    return D0 + Dm * n_sobre_ni + Dmm * n_sobre_ni**2


def passo_temporal(params, x_nm, C, T_C, dt_s, fluxo_superficie=None):
    """Um passo implícito com iteração de Picard na não linearidade.

    fluxo_superficie(C0) -> (a, b) define o fluxo que sai pela superfície como
    J = a*C0 - b (cm^-2 s^-1, positivo saindo do Si); None é superfície refletora.
    """
    dx = (x_nm[1] - x_nm[0]) * 1e-7
    ni_ = silicio.ni(params, T_C)
    Cs = silicio.C_sat(params, T_C)
    ne = silicio.n_e(params, T_C)
    Cn = C.copy()
    for _ in range(30):
        Cmov = np.minimum(Cn, Cs)
        Ca = np.minimum(Cn, ne)
        n = silicio.eletrons(Ca, ni_)
        h = 1.0 + Ca / np.sqrt(Ca**2 + 4 * ni_**2)
        D = h * difusividade_ft(params, T_C, n / ni_)
        Df = 0.5 * (D[1:] + D[:-1])
        s = np.where(Cn > 0, Cmov / np.maximum(Cn, 1e-30), 1.0)  # C_mov = s C, linearizado
        r = dt_s / dx**2
        N = C.size
        ab = np.zeros((3, N))
        diag = np.ones(N)
        sup = np.zeros(N - 1)
        inf = np.zeros(N - 1)
        diag[:-1] += r * Df * s[:-1]
        diag[1:] += r * Df * s[1:]
        sup[:] = -r * Df * s[1:]
        inf[:] = -r * Df * s[:-1]
        rhs = C.copy()
        if fluxo_superficie is not None:
            a, b = fluxo_superficie(Cn[0])
            diag[0] += dt_s / dx * a
            rhs[0] += dt_s / dx * b
        ab[0, 1:] = sup
        ab[1] = diag
        ab[2, :-1] = inf
        novo = solve_banded((1, 1), ab, rhs)
        novo = np.maximum(novo, 0.0)
        if np.max(np.abs(novo - Cn) / (Cn + 1e15)) < 1e-6:
            Cn = novo
            break
        Cn = novo
    return Cn


def difundir(params, x_nm, C, T_C, t_s, n_passos=None, fluxo_superficie=None):
    if t_s <= 0:
        return C.copy()
    n_passos = n_passos or int(np.clip(t_s / 2.0, 50, 400))
    # passos crescentes geometricamente, porque o perfil muda mais no início
    razao = 1.03
    dts = razao ** np.arange(n_passos)
    dts *= t_s / dts.sum()
    for dt in dts:
        C = passo_temporal(params, x_nm, C, T_C, dt, fluxo_superficie)
    return C
