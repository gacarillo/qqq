"""Eletrostática e transporte do grafeno sobre a porta local.

Eletrostática (convenções de poisson.py)
    V_G - V_D = q n/C_ox + mu_g(n)/q - [phi_s(q n - Q_f) - phi_s(-Q_f)]
com n a densidade de elétrons no grafeno (negativa para lacunas), mu_g = sgn(n)
hbar vF sqrt(pi |n|) (R34, R42) e phi_s do Poisson do Si. V_D é a tensão de Dirac.

Capacitância quântica com poças de carga [C]: densidade efetiva
n_ef = sqrt(n^2 + n*^2), como em R34 para o transporte; isso dá Cq mínimo
não nulo no ponto de Dirac, como R39 mede.

Transporte
* kim       R = 2 Rc + (L/W) / (q mu sqrt(n0^2 + n^2))  (R34), baixa tensão de dreno
* jimenez   Ids = q W mu int rho dV / (L + mu |int dV/vsat|), vsat = Omega/sqrt(pi rho)  (R42)
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.interpolate import interp1d
from scipy.optimize import brentq

from ..constantes import eps0, hbar, q


def potencial_quimico(n_m2, vF):
    """Sem desordem e a 0 K: mu = sgn(n) hbar vF sqrt(pi |n|) (J)."""
    return np.sign(n_m2) * hbar * vF * np.sqrt(np.pi * np.abs(n_m2))


def sigma_de_n_estrela(n_estrela_m2, vF):
    """Largura (J) da flutuação gaussiana de potencial equivalente a n* [C]: sigma = hbar vF sqrt(pi n*)."""
    return hbar * vF * np.sqrt(np.pi * n_estrela_m2)


def tabela_n_mu(vF, sigma_J, T=300.0, mu_max_eV=1.5, n=1201):
    """n(mu) (m^-2) com DOS 2|E|/(pi (hbar vF)^2), Fermi-Dirac a T e alargamento gaussiano sigma.

    A flutuação de potencial (R40, ordem de 100 meV) entra como convolução da DOS com
    uma gaussiana; daí sai Cq mínimo não nulo no ponto de Dirac (R39).
    """
    from ..constantes import k_B
    kT = k_B * T
    E = np.linspace(-mu_max_eV * 1.6, mu_max_eV * 1.6, 6401) * q
    dos = 2 * np.abs(E) / (np.pi * (hbar * vF) ** 2)
    if sigma_J > 0:
        dE = E[1] - E[0]
        k = np.arange(-int(5 * sigma_J / dE), int(5 * sigma_J / dE) + 1) * dE
        g = np.exp(-0.5 * (k / sigma_J) ** 2)
        g /= g.sum()
        dos = np.convolve(dos, g, mode="same")
    mus = np.linspace(-mu_max_eV, mu_max_eV, n) * q
    ns = np.empty(n)
    for i, mu in enumerate(mus):
        f = 1.0 / (1.0 + np.exp(np.clip((E - mu) / kT, -700, 700)))
        ocup = np.where(E > 0, f, f - 1.0)  # elétrons acima de 0, lacunas abaixo (negativo)
        ns[i] = np.trapezoid(dos * ocup, E)
    return mus, ns


@dataclass
class Pilha:
    C_ox: float            # F/m2
    vF: float              # m/s
    n_estrela: float       # m^-2, poças
    Q_f: float = 0.0       # C/m2, carga fixa na interface Si/SiO2
    V_D: float = 0.0       # V, tensão de Dirac
    tabela_Q: np.ndarray | None = None
    tabela_phi: np.ndarray | None = None
    D_it: float = 0.0      # m^-2 V^-1 [I], em paralelo com o Si
    T: float = 300.0

    def __post_init__(self):
        mus, ns = _tabela_cache(round(self.vF, 3), round(self.n_estrela, -10), self.T)
        self._mu_de_n = interp1d(ns, mus, kind="cubic", fill_value="extrapolate")
        self._phi = None
        if self.tabela_Q is not None:
            self._phi = interp1d(self.tabela_Q, self.tabela_phi, kind="cubic", fill_value="extrapolate")
            self._phi_ref = float(self._phi(-self.Q_f))

    def mu(self, n_m2):
        n_m2 = np.asarray(n_m2, dtype=float)
        lim = 1e18
        return np.where(np.abs(n_m2) < lim, self._mu_de_n(np.clip(n_m2, -lim, lim)), potencial_quimico(n_m2, self.vF))

    def phi_s(self, Q_si):
        if self._phi is None:
            return 0.0 * Q_si
        return self._phi(Q_si)

    def tensao(self, n_m2):
        """V_G para uma densidade n (m^-2), descontando a carga de interface D_it [C]."""
        mu = self.mu(n_m2) / q
        Q_si = q * n_m2 - self.Q_f
        phi = self.phi_s(Q_si) - self.phi_s(-self.Q_f)
        if self.D_it > 0:
            # D_it absorve parte da carga do Si: resolve phi com Q_si - q^2 D_it phi = Q_total
            for _ in range(30):
                phi = self.phi_s(Q_si + q * self.D_it * phi) - self.phi_s(-self.Q_f)
        return self.V_D + q * n_m2 / self.C_ox + mu - phi

    def densidade(self, V_G):
        V_G = np.atleast_1d(V_G)
        out = np.empty_like(V_G, dtype=float)
        lim = 5e17  # m^-2 (5e13 cm^-2)
        for i, v in enumerate(V_G):
            out[i] = brentq(lambda n: self.tensao(n) - v, -lim, lim, xtol=1e6)
        return out

    def capacitancia(self, V_G):
        """C total por área (F/m2) por diferença finita de q n(V)."""
        dV = 1e-3
        return q * (self.densidade(V_G + dV) - self.densidade(V_G - dV)) / (2 * dV)


from functools import lru_cache


@lru_cache(maxsize=64)
def _tabela_cache(vF, n_estrela, T):
    return tabela_n_mu(vF, sigma_de_n_estrela(n_estrela, vF), T)


def capacitancia_quantica(n_m2, vF, n_estrela):
    """Cq = q^2 dn/dmu com n_ef = sqrt(n^2 + n*^2) [C]: Cq = (2 q^2 / (hbar vF sqrt(pi))) sqrt(n_ef)."""
    n_ef = np.sqrt(n_m2**2 + n_estrela**2)
    return 2 * q**2 * np.sqrt(n_ef) / (hbar * vF * np.sqrt(np.pi))


def resistencia_kim(n_m2, mu_m2, n0_m2, L_sobre_W, Rc_W_ohm_m=0.0, W_m=None):
    """Resistência total (ohm) para W dado, ou resistência normalizada (ohm) por quadrado se W é None."""
    canal = L_sobre_W / (q * mu_m2 * np.sqrt(n0_m2**2 + n_m2**2))
    contato = 0.0 if W_m is None else 2 * Rc_W_ohm_m / W_m
    return canal + contato


def corrente_jimenez(pilha: Pilha, V_GS, V_DS, mu_m2, L_m, W_m, hbar_Omega_eV, rho0_m2, n_pontos=201):
    """Integração numérica de (2) de R42, sem resistência de contato (V_DS interno).

    Em cada ponto do canal a densidade vem da eletrostática com V_G - V(x).
    """
    Omega = hbar_Omega_eV * q / hbar
    V = np.linspace(0.0, V_DS, n_pontos)
    n = pilha.densidade(V_GS - V)
    rho = np.abs(n) + rho0_m2
    vsat = Omega / np.sqrt(np.pi * rho)
    num = q * W_m * mu_m2 * np.trapezoid(rho, V)
    den = L_m + mu_m2 * abs(np.trapezoid(1.0 / vsat, V))
    return num / den


def pilha_de_params(params, espessura_ox_nm, si_porta=None, V_D=0.0, Q_f_cm2=0.0, n_estrela_cm2=None,
                    eps_r_ox=None, Q_max=0.04):
    eps_ox = (eps_r_ox or params.valor("eletrico.materiais.eps_r_SiO2")) * eps0
    C_ox = eps_ox / (espessura_ox_nm * 1e-9)
    vF = params.valor("eletrico.grafeno.vF")
    ne = n_estrela_cm2 if n_estrela_cm2 is not None else params.valor("eletrico.grafeno.n_residual.ju_lee")
    tQ = tphi = None
    if si_porta is not None:
        tQ, tphi = si_porta.tabela(Q_max, 61)
    return Pilha(C_ox, vF, ne * 1e4, Q_f_cm2 * q * 1e4, V_D, tQ, tphi)
