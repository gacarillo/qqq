"""Módulo 2, recozimento (SPE a 550 C, depois RTA ou forno, e etapas térmicas seguintes).

Estado do dopante
* C       P total
* ativo   P substitucional ionizável
* amorfo  intervalo ainda amorfo (some após a SPE)

Ramos de desativação (ver params.yaml, recozimento.desativacao)
* equilibrio    ao fim de cada etapa a ≥ 500 C o ativo cai para min(C, n_e(T)) (N24, R12)
* metaestavel   o ativo obtido na SPE é mantido em etapas curtas (RTA), e só as
                etapas longas de forno levam ao equilíbrio. Cobre o lado de R18.
"""
from __future__ import annotations

import copy
from dataclasses import dataclass, field

import numpy as np

from ..constantes import k_B_eV
from . import difusao, silicio


@dataclass
class Etapa:
    nome: str
    T_C: float
    t_s: float
    ambiente: str = "N2"
    rapida: bool = False  # RTA


@dataclass
class EstadoDopante:
    x_nm: np.ndarray
    C: np.ndarray
    ativo: np.ndarray
    amorfo_nm: tuple[float, float] | None
    historico: list[str] = field(default_factory=list)

    def copia(self) -> "EstadoDopante":
        return copy.deepcopy(self)

    @property
    def dose(self) -> float:
        return float(np.trapezoid(self.C, self.x_nm * 1e-7))

    @property
    def dose_ativa(self) -> float:
        return float(np.trapezoid(self.ativo, self.x_nm * 1e-7))

    @property
    def fracao_ativa(self) -> float:
        return self.dose_ativa / self.dose


def estado_inicial(perfil, profundidade_nm: float = 600.0) -> EstadoDopante:
    """Estende o perfil do módulo 1 até a profundidade de simulação; nada está ativo."""
    dx = perfil.x_nm[1] - perfil.x_nm[0]
    x = np.arange(perfil.x_nm[0], profundidade_nm, dx)
    C = np.interp(x, perfil.x_nm, perfil.C_cm3, right=0.0)
    return EstadoDopante(x, C, np.zeros_like(C), perfil.amorfo_nm, ["implantado"])


def velocidade_spe(params, T_C: float) -> float:
    """Velocidade de recrescimento em cm/s (prefator provisório [I], Ea de N9)."""
    v0 = params.valor("recozimento.spe_550C.prefator_velocidade")
    Ea = params.valor("recozimento.spe_550C.Ea_velocidade_spe")
    f = params.valor("recozimento.spe_550C.fator_aceleracao_P")
    return f * v0 * np.exp(-Ea / (k_B_eV * (T_C + 273.15)))


def aplicar(params, estado: EstadoDopante, etapa: Etapa, ramo_desativacao: str = "equilibrio",
            fluxo_superficie=None) -> EstadoDopante:
    e = estado.copia()
    # 1. recrescimento epitaxial da camada amorfa
    if e.amorfo_nm is not None:
        espessura = (e.amorfo_nm[1] - min(e.amorfo_nm[0], 0.0)) * 1e-7
        t_spe = espessura / velocidade_spe(params, etapa.T_C)
        if t_spe <= etapa.t_s:
            dentro = e.x_nm <= e.amorfo_nm[1]
            e.ativo[dentro] = e.C[dentro]  # incorporação substitucional metaestável [I], R14
            e.historico.append(f"{etapa.nome}: SPE completa em {t_spe:.0f} s")
            e.amorfo_nm = None
        else:
            e.historico.append(f"{etapa.nome}: SPE incompleta ({etapa.t_s:.0f} s de {t_spe:.0f} s)")
    # 2. difusão (só acima de onde ela é desprezível na escala de 0,5 nm)
    if etapa.T_C >= 700.0:
        ativo_antes = e.ativo / np.maximum(e.C, 1e-30)
        e.C = difusao.difundir(params, e.x_nm, e.C, etapa.T_C, etapa.t_s, fluxo_superficie=fluxo_superficie)
        e.ativo = np.clip(ativo_antes, 0, 1) * e.C
    # 3. ativação fora da região recrescida e desativação
    if etapa.T_C >= params.valor("recozimento.desativacao.inicio_P"):
        ne = silicio.n_e(params, etapa.T_C)
        if etapa.T_C >= 700.0:
            # dano cristalino da cauda recozido: P abaixo de n_e fica ativo [I]
            e.ativo = np.maximum(e.ativo, np.minimum(e.C, ne))
        if ramo_desativacao == "equilibrio" or (ramo_desativacao == "metaestavel" and not etapa.rapida):
            if etapa.t_s >= 1.0 and etapa.T_C >= 700.0:
                e.ativo = np.minimum(e.ativo, ne)
            elif etapa.T_C < 700.0 and ramo_desativacao == "equilibrio":
                e.historico.append(f"{etapa.nome}: cinética de desativação abaixo de 700 C desconhecida (R12b); ativo mantido")
    e.historico.append(f"{etapa.nome}: {etapa.T_C:.0f} C por {etapa.t_s:.0f} s, fração ativa {e.fracao_ativa:.3f}")
    return e


def receita_etapas(params, variante: str, T_forno_C: float | None = None) -> list[Etapa]:
    r = "receita.recozimento."
    etapas = [Etapa("SPE", params.valor(r + "spe.temperatura"), params.valor(r + "spe.tempo") * 60.0)]
    if variante == "A_rta":
        etapas.append(Etapa("RTA", params.valor(r + "variante_A_rta.temperatura"),
                            params.valor(r + "variante_A_rta.tempo"), rapida=True))
    elif variante == "B_forno":
        if T_forno_C is None:
            raise ValueError("variante B exige a temperatura do forno (varredura de 850 a 900 C)")
        etapas.append(Etapa("forno", T_forno_C, params.valor(r + "variante_B_forno.tempo") * 60.0))
    else:
        raise ValueError(f"variante desconhecida {variante}")
    return etapas


def simular(params, perfil, variante: str, T_forno_C: float | None = None,
            ramo_desativacao: str = "equilibrio") -> EstadoDopante:
    e = estado_inicial(perfil)
    for et in receita_etapas(params, variante, T_forno_C):
        e = aplicar(params, e, et, ramo_desativacao)
    return e
