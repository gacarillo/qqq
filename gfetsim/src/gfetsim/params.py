"""Leitura do params.yaml com as regras de honestidade do projeto.

Regras
* Um valor null bloqueia o modelo que depende dele (ParametroAusente).
* Se o usuario aceitar os provisorios, o valor_provisorio [I] e usado e a chave
  fica registrada em ``Parametros.provisorios_usados`` para o relatorio.
* O usuario pode sobrescrever qualquer chave; o valor passa a ser [B].
"""
from __future__ import annotations

import copy
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import yaml

RAIZ = Path(__file__).resolve().parents[2]
PARAMS_PADRAO = RAIZ / "params.yaml"


class _Carregador(yaml.SafeLoader):
    """SafeLoader que aceita 3.0e15 e 1e-7 como float (o YAML 1.1 exige ponto e sinal)."""


_Carregador.add_implicit_resolver(
    "tag:yaml.org,2002:float",
    __import__("re").compile(
        r"""^(?:[-+]?(?:[0-9][0-9_]*)\.[0-9_]*(?:[eE][-+]?[0-9]+)?
        |[-+]?(?:[0-9][0-9_]*)(?:[eE][-+]?[0-9]+)
        |\.[0-9_]+(?:[eE][-+]?[0-9]+)?
        |[-+]?\.(?:inf|Inf|INF)
        |\.(?:nan|NaN|NAN))$""",
        __import__("re").X,
    ),
    list("-+0123456789."),
)


def ler_yaml(caminho) -> Any:
    with open(caminho, encoding="utf-8") as f:
        return yaml.load(f, Loader=_Carregador)


class ParametroAusente(KeyError):
    """Valor null sem provisorio aceito."""

    def __init__(self, chave: str, nota: str | None = None):
        msg = f"parametro '{chave}' e null no params.yaml"
        if nota:
            msg += f" ({nota})"
        msg += ". Forneca o valor ou rode com aceitar_provisorios=True se houver valor_provisorio [I]."
        super().__init__(msg)
        self.chave = chave


@dataclass
class Uso:
    chave: str
    valor: Any
    etiqueta: str
    origem: str  # "valor", "provisorio", "usuario"


@dataclass
class Parametros:
    caminho: Path = PARAMS_PADRAO
    aceitar_provisorios: bool = False
    sobrescrever: dict = field(default_factory=dict)

    def __post_init__(self):
        self.dados = ler_yaml(self.caminho)
        self.usos: dict[str, Uso] = {}

    # ------------------------------------------------------------------ acesso
    def no(self, chave: str) -> Any:
        atual = self.dados
        for parte in chave.split("."):
            if not isinstance(atual, dict) or parte not in atual:
                raise KeyError(f"chave inexistente no params.yaml: {chave}")
            atual = atual[parte]
        return atual

    def existe(self, chave: str) -> bool:
        try:
            self.no(chave)
            return True
        except KeyError:
            return False

    def valor(self, chave: str) -> Any:
        if chave in self.sobrescrever:
            v = self.sobrescrever[chave]
            self.usos[chave] = Uso(chave, v, "B", "usuario")
            return v
        n = self.no(chave)
        if not isinstance(n, dict):
            return n
        if n.get("valor") is not None:
            self.usos[chave] = Uso(chave, n["valor"], str(n.get("etiqueta", "?")), "valor")
            return n["valor"]
        if self.aceitar_provisorios and n.get("valor_provisorio") is not None:
            self.usos[chave] = Uso(chave, n["valor_provisorio"], "I", "provisorio")
            return n["valor_provisorio"]
        raise ParametroAusente(chave, n.get("nota"))

    def etiqueta(self, chave: str) -> str:
        if chave in self.sobrescrever:
            return "B"
        n = self.no(chave)
        if isinstance(n, dict) and n.get("valor") is None and n.get("valor_provisorio") is not None:
            return "I"
        return str(n.get("etiqueta", "?")) if isinstance(n, dict) else "?"

    def incerteza(self, chave: str) -> dict | None:
        n = self.no(chave)
        return n.get("incerteza") if isinstance(n, dict) else None

    @property
    def provisorios_usados(self) -> list[str]:
        return sorted(k for k, u in self.usos.items() if u.origem == "provisorio")

    def tabela_usos(self) -> list[Uso]:
        return [self.usos[k] for k in sorted(self.usos)]

    def copia(self, **sobrescrever) -> "Parametros":
        novo = copy.copy(self)
        novo.dados = self.dados
        novo.sobrescrever = {**self.sobrescrever, **sobrescrever}
        novo.usos = {}
        return novo

    # ------------------------------------------------------------- amostragem
    def amostrar(self, chave: str, rng: np.random.Generator, n: int, centro: float | None = None) -> np.ndarray:
        """Amostra n valores conforme a incerteza declarada.

        Tipos normal e normal_rel centram no valor (ou no provisorio aceito).
        Tipos uniforme e loguniforme ignoram o centro. Varredura nao e
        amostrada (erro). Sem incerteza, devolve o valor repetido.
        """
        inc = self.incerteza(chave)
        if inc is None:
            return np.full(n, float(self.valor(chave)))
        tipo = inc["tipo"]
        if tipo == "varredura":
            raise ValueError(f"{chave} e uma varredura e nao entra no Monte Carlo")
        if tipo in ("uniforme",):
            return rng.uniform(inc["min"], inc["max"], n)
        if tipo == "loguniforme":
            return np.exp(rng.uniform(np.log(inc["min"]), np.log(inc["max"]), n))
        c = float(self.valor(chave)) if centro is None else centro
        if tipo == "normal":
            return rng.normal(c, inc["sigma"], n)
        if tipo == "normal_rel":
            return rng.normal(c, abs(c) * inc["sigma_rel"], n)
        raise ValueError(f"tipo de incerteza desconhecido em {chave}: {tipo}")


def carregar(caminho: str | os.PathLike | None = None, **kw) -> Parametros:
    return Parametros(Path(caminho) if caminho else PARAMS_PADRAO, **kw)
