"""Monta a página única da animação a partir do modelo, dos scripts e dos dados exportados.

    python animacao/exportar_dados.py   # gera dados_animacao.json (alguns minutos)
    python animacao/montar.py           # gera gfet_animacao.html
"""
from pathlib import Path

AQUI = Path(__file__).resolve().parent
dados = (AQUI / "dados_animacao.json").read_text().replace("</", "<\\/")
js = "\n".join(p.read_text() for p in sorted((AQUI / "js").glob("*.js"))).replace("</script", "<\\/script")
html = (AQUI / "modelo.html").read_text().replace("__DADOS__", dados).replace("__JS__", js)
(AQUI / "gfet_animacao.html").write_text(html)
print(AQUI / "gfet_animacao.html", f"{len(html) / 1e6:.2f} MB")
