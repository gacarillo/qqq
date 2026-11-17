"""Exporta params.yaml e docs/referencias.md para JSON lido pelo estúdio.

O params.yaml continua sendo a fonte única. Este script só muda o formato, sem
alterar nenhum valor, etiqueta ou incerteza.

    python3 scripts/exportar_params.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
sys.path.insert(0, str(RAIZ / "src"))

from gfetsim.params import ler_yaml  # noqa: E402

DESTINO = AQUI.parent / "src" / "dados"


def referencias(caminho: Path) -> dict:
    """Linhas da tabela de referências, indexadas pelo ID."""
    saida = {}
    secao = ""
    for linha in caminho.read_text(encoding="utf-8").splitlines():
        if linha.startswith("## "):
            secao = linha[3:].strip()
        if not linha.startswith("| ") or linha.startswith("| ID") or linha.startswith("|---"):
            continue
        cel = [c.strip() for c in linha.strip().strip("|").split("|")]
        if len(cel) < 4 or not re.match(r"^[A-Z][A-Za-z0-9]*$", cel[0]):
            continue
        saida[cel[0]] = {
            "id": cel[0], "texto": cel[1], "doi": cel[2] if cel[2] != "sem DOI" else None,
            "situacao": cel[3], "garante": cel[4] if len(cel) > 4 else "", "uso": cel[5] if len(cel) > 5 else "",
            "secao": secao,
        }
    return saida


def main() -> None:
    DESTINO.mkdir(parents=True, exist_ok=True)
    params = ler_yaml(RAIZ / "params.yaml")
    (DESTINO / "params.json").write_text(json.dumps(params, ensure_ascii=False, indent=1), encoding="utf-8")
    refs = referencias(RAIZ / "docs" / "referencias.md")
    (DESTINO / "referencias.json").write_text(json.dumps(refs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"params.json e referencias.json ({len(refs)} referências) em {DESTINO}")


if __name__ == "__main__":
    main()
