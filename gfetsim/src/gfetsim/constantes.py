"""Constantes físicas (CODATA via scipy.constants) e conversões usadas no pacote."""
from scipy import constants as _c

q = _c.e                    # C
k_B = _c.k                  # J/K
k_B_eV = _c.k / _c.e        # eV/K
eps0 = _c.epsilon_0         # F/m
h = _c.h
hbar = _c.hbar
m0 = _c.m_e

NM_PARA_CM = 1e-7
CM_PARA_NM = 1e7


def kT_eV(T_C: float) -> float:
    """kT em eV para temperatura em graus Celsius."""
    return k_B_eV * (T_C + 273.15)
