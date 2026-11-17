"""Converte dist/index.html em fragmento para publicação como página do claude.ai.

A publicação embrulha o conteúdo num esqueleto próprio, então o fragmento não leva
doctype, html, head nem body. As marcas só são removidas fora dos scripts, porque o
código embutido contém textos como "</body>" (o relatório monta um HTML).

    npm run build && python3 scripts/pagina_unica.py
"""
import re
from pathlib import Path

AQUI = Path(__file__).resolve().parent.parent
html = (AQUI / "dist" / "index.html").read_text(encoding="utf-8")

partes = re.split(r"(<script\b[^>]*>.*?</script>)", html, flags=re.S | re.I)
for i in range(0, len(partes), 2):  # só os trechos fora de <script>
    t = partes[i]
    t = re.sub(r"<!doctype html>", "", t, flags=re.I)
    t = re.sub(r"</?html[^>]*>|</?head>|</?body>", "", t, flags=re.I)
    t = re.sub(r'<meta charset="utf-8">\s*|<meta name="viewport"[^>]*>\s*', "", t, flags=re.I)
    partes[i] = t
saida = "".join(partes).strip()
titulo = re.search(r"<title>.*?</title>", saida, re.S).group(0)
saida = titulo + "\n" + saida.replace(titulo, "", 1).strip() + "\n"
destino = AQUI / "dist" / "gfetsim_estudio.html"
destino.write_text(saida, encoding="utf-8")
print(destino, f"{len(saida.encode()) / 1e6:.2f} MB", "| título nos primeiros 8 KB:", saida.find("<title>") < 8192,
      "| original", f"{len(html.encode()) / 1e6:.2f} MB")
