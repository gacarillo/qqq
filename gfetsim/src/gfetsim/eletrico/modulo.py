"""Módulo 4, elétrico: C-V da porta, curva de transferência e limites do óxido."""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.optimize import brentq

from ..constantes import eps0, q
from ..recozimento import silicio
from . import grafeno, oxido
from .poisson import SiPorta


@dataclass
class ResultadoEletrico:
    V: np.ndarray
    n_cm2: np.ndarray
    C_F_cm2: np.ndarray
    C_sem_si_F_cm2: np.ndarray
    C_ox_F_cm2: float
    E_ox_MVcm: np.ndarray
    V_ruptura: tuple[float, float]
    R_quadrado_ohm: np.ndarray        # resistência de folha do canal (Kim), sem contatos
    espessura_ox_nm: float
    V_D: float
    notas: list[str] = field(default_factory=list)

    @property
    def perda_si(self) -> np.ndarray:
        """Fração de capacitância perdida para o Si, comparada à mesma pilha com porta metálica."""
        return 1.0 - self.C_F_cm2 / self.C_sem_si_F_cm2


def dopagem_de_resistividade(params, rho_ohm_cm: float) -> float:
    """N_D do substrato a partir da resistividade, invertendo Masetti para P [I]."""
    f = lambda logN: np.log(1.0 / (q * silicio.mobilidade_masetti(params, np.array([10**logN]))[0] * 1e-4 * 10**logN * 1e6) * 100) - np.log(rho_ohm_cm)
    # rho (ohm cm) = 1/(q mu N), mu em cm2/Vs, N em cm^-3
    g = lambda logN: 1.0 / (q * silicio.mobilidade_masetti(params, np.array([10**logN]))[0] * 10**logN) - rho_ohm_cm
    return 10 ** brentq(g, 12.0, 21.5)


def tensao_dirac(pilha: grafeno.Pilha, n_dop_cm2: float) -> float:
    """V_D tal que n(V_G = 0) = n_dop (elétrons positivos)."""
    v0 = pilha.V_D
    pilha.V_D = 0.0
    vd = -pilha.tensao(n_dop_cm2 * 1e4)
    pilha.V_D = v0
    return float(vd)


def simular(params, x_nm, ativo_cm3, espessura_ox_nm, rho_substrato_ohm_cm=None, n_dop_cm2=0.0,
            Q_f_cm2=0.0, n_estrela_cm2=None, mu_grafeno=None, eps_r_ox=None, V=None) -> ResultadoEletrico:
    notas = []
    fundo = 0.0
    if rho_substrato_ohm_cm is not None:
        fundo = dopagem_de_resistividade(params, rho_substrato_ohm_cm)
        notas.append(f"substrato de {rho_substrato_ohm_cm:g} ohm cm -> {fundo:.2e} cm^-3 (Masetti para P, [I])")
    si = SiPorta(params, x_nm, ativo_cm3, fundo_cm3=fundo)
    pil = grafeno.pilha_de_params(params, espessura_ox_nm, si, Q_f_cm2=Q_f_cm2, n_estrela_cm2=n_estrela_cm2,
                                  eps_r_ox=eps_r_ox)
    pil.V_D = tensao_dirac(pil, n_dop_cm2)
    metal = grafeno.Pilha(pil.C_ox, pil.vF, pil.n_estrela, V_D=0.0)
    metal.V_D = tensao_dirac(metal, n_dop_cm2)
    eps_ox = pil.C_ox * espessura_ox_nm * 1e-9
    if V is None:
        V = np.linspace(pil.V_D - 8.0, pil.V_D + 8.0, 81)
    n = pil.densidade(V)
    C = pil.capacitancia(V)
    C_metal = metal.capacitancia(V - pil.V_D + metal.V_D)
    E = oxido.campo_oxido(n, Q_f_cm2 * 1e4, eps_ox) / 1e8
    rup = oxido.faixa_ruptura(params)
    Vr = tuple(float(e * 1e8 * eps_ox / pil.C_ox) for e in rup["adams_MVcm"])
    mu = mu_grafeno if mu_grafeno is not None else params.valor("eletrico.grafeno.kim_ajuste.mu")
    if mu_grafeno is None:
        notas.append("mobilidade do grafeno de R34 (esfoliado); o CVD do usuário deve ficar abaixo (R33)")
    n0 = (n_estrela_cm2 if n_estrela_cm2 is not None else params.valor("eletrico.grafeno.n_residual.ju_lee")) * 1e4
    Rsq = grafeno.resistencia_kim(n, mu * 1e-4, n0, 1.0)
    return ResultadoEletrico(V, n / 1e4, C * 1e-4, C_metal * 1e-4, pil.C_ox * 1e-4, E, Vr, Rsq,
                             espessura_ox_nm, pil.V_D, notas)
