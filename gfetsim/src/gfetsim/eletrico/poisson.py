"""Poisson 1D no Si da porta com estatística de Fermi-Dirac para elétrons.

Convenções
* x = 0 na interface Si/SiO2, crescendo para dentro do Si (nm na entrada, m no cálculo).
* psi é o potencial eletrostático (V); n = Nc F_1/2((psi - psi_c)/Vt) com o nível de
  Fermi em zero. Lacunas por Boltzmann, desprezíveis no n+.
* Q_si é a carga do Si por área (C/m2): positiva em depleção (doadores expostos),
  negativa em acumulação.
* phi_s(Q) = psi(0; Q) - psi(0; 0) é a curvatura de bandas causada pela carga Q
  (negativa em depleção).

Ionização completa: R35 diz que a fração não ionizada é desprezível muito acima
da transição de Mott; a camada n+ fica acima de 1e19 cm-3 perto da interface.
Sem estreitamento de banda (params.yaml, eletrico.silicio_300K.bgn).
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np
from scipy.integrate import quad
from scipy.linalg import solve_banded

from ..constantes import eps0, k_B, q

T_AMB = 300.0


@lru_cache(maxsize=1)
def _tabela_fermi():
    eta = np.linspace(-40.0, 120.0, 3201)
    f = np.array([quad(lambda e, h=h: np.sqrt(e) / (1 + np.exp(np.clip(e - h, -700, 700))), 0, max(h, 0) + 60,
                       limit=200)[0] for h in eta]) * 2 / np.sqrt(np.pi)
    return eta, f


def F12(eta):
    """Integral de Fermi-Dirac de ordem 1/2 normalizada (-> exp(eta) no limite não degenerado)."""
    e, f = _tabela_fermi()
    eta = np.asarray(eta, dtype=float)
    out = np.interp(eta, e, f)
    baixo = eta < e[0]
    if np.any(baixo):
        out = np.where(baixo, np.exp(eta), out)
    return out


def dF12(eta):
    e, f = _tabela_fermi()
    d = np.gradient(f, e)
    return np.interp(eta, e, d)


class SiPorta:
    """Solver de Poisson para um perfil de doadores N_D(x) (cm^-3)."""

    def __init__(self, params, x_nm, Nd_cm3, fundo_cm3: float = 0.0, profundidade_nm: float = 300.0,
                 n_pontos: int = 801):
        self.Vt = k_B * T_AMB / q
        self.eps = params.valor("eletrico.materiais.eps_r_Si") * eps0
        self.Nc = params.valor("eletrico.silicio_300K.Nc") * 1e6
        self.ni = params.valor("recozimento.silicio.ni_300K") * 1e6
        # grade não uniforme: fina perto da interface
        u = np.linspace(0, 1, n_pontos)
        self.x = profundidade_nm * 1e-9 * u**2.5
        Nd = np.interp(self.x * 1e9, x_nm, Nd_cm3, right=Nd_cm3[-1]) + fundo_cm3
        self.Nd = np.maximum(Nd, 1e10) * 1e6
        self.psi_eq = self._equilibrio_local()
        self.psi0 = self.resolver(0.0, chute=self.psi_eq)

    def _n(self, psi):
        return self.Nc * F12(psi / self.Vt)

    def _p(self, psi):
        return self.ni**2 / self.Nc * np.exp(np.clip(-psi / self.Vt, -700, 700))

    def _equilibrio_local(self):
        # n = Nd ponto a ponto, por bissecção em eta
        lo, hi = np.full_like(self.Nd, -40.0), np.full_like(self.Nd, 120.0)
        for _ in range(80):
            m = 0.5 * (lo + hi)
            maior = self.Nc * F12(m) > self.Nd
            hi = np.where(maior, m, hi)
            lo = np.where(maior, lo, m)
        return 0.5 * (lo + hi) * self.Vt

    def resolver(self, Q_si: float, chute=None, iter_max: int = 200):
        """psi(x) para carga Q_si (C/m2) no Si; Neumann em x=0 e Dirichlet no fundo."""
        x = self.x
        N = x.size
        h = np.diff(x)
        psi = (self.psi0 if chute is None and hasattr(self, "psi0") else (chute if chute is not None else self.psi_eq)).copy()
        dQ = Q_si
        for it in range(iter_max):
            rho = q * (self.Nd - self._n(psi) + self._p(psi))
            drho = -q * (self.Nc * dF12(psi / self.Vt) / self.Vt + self._p(psi) / self.Vt)
            # volumes de controle
            vol = np.zeros(N)
            vol[:-1] += 0.5 * h
            vol[1:] += 0.5 * h
            F = np.zeros(N)
            fl = self.eps * np.diff(psi) / h  # fluxo eps dpsi/dx nas faces
            F[1:-1] = fl[1:] - fl[:-1] + rho[1:-1] * vol[1:-1]
            # x = 0: eps dpsi/dx(0) = Q_si (Gauss: carga positiva no Si eleva o campo para dentro)
            F[0] = fl[0] - dQ + rho[0] * vol[0]
            F[-1] = 0.0
            ab = np.zeros((3, N))
            ab[1, 1:-1] = -self.eps / h[1:] - self.eps / h[:-1] + drho[1:-1] * vol[1:-1]
            ab[0, 2:] = self.eps / h[1:]
            ab[2, :-2] = self.eps / h[:-1]
            ab[1, 0] = -self.eps / h[0] + drho[0] * vol[0]
            ab[0, 1] = self.eps / h[0]
            ab[1, -1] = 1.0
            d = solve_banded((1, 1), ab, -F)
            d = np.clip(d, -0.2, 0.2)
            psi = psi + d
            if np.max(np.abs(d)) < 1e-10:
                break
        else:
            raise RuntimeError(f"Poisson não convergiu para Q = {Q_si:.3e} C/m2")
        return psi

    def curvatura(self, Q_si: float) -> float:
        return float(self.resolver(Q_si)[0] - self.psi0[0])

    def tabela(self, Q_max: float, n: int = 81):
        """phi_s(Q) numa grade de Q, continuando o chute de Newton a partir de Q = 0."""
        Qs = np.linspace(-Q_max, Q_max, n)
        phis = np.empty(n)
        meio = n // 2
        psi = self.psi0
        for i in range(meio, n):
            psi = self.resolver(Qs[i], chute=psi)
            phis[i] = psi[0] - self.psi0[0]
        psi = self.psi0
        for i in range(meio, -1, -1):
            psi = self.resolver(Qs[i], chute=psi)
            phis[i] = psi[0] - self.psi0[0]
        return Qs, phis


def capacitancia_deplecao(params, N_cm3, psi_V, eps_r_si=None):
    """Aproximação de depleção, C = eps/W com W = sqrt(2 eps psi / q N) (F/m2)."""
    eps = (eps_r_si or params.valor("eletrico.materiais.eps_r_Si")) * eps0
    W = np.sqrt(2 * eps * psi_V / (q * N_cm3 * 1e6))
    return eps / W
