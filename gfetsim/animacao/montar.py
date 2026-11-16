"""Monta a página única da animação a partir do modelo e dos dados exportados.

    python animacao/exportar_dados.py   # gera dados_animacao.json (alguns minutos)
    python animacao/montar.py           # gera gfet_animacao.html
"""
from pathlib import Path

AQUI = Path(__file__).resolve().parent
dados = (AQUI / "dados_animacao.json").read_text().replace("</", "<\\/")
html = (AQUI / "modelo.html").read_text().replace("__DADOS__", dados)
(AQUI / "gfet_animacao.html").write_text(html)
print(AQUI / "gfet_animacao.html", f"{len(html) / 1e6:.2f} MB")
