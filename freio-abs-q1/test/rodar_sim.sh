#!/bin/sh
# Roda a simulacao no PC (Linux, MSYS2/MinGW ou WSL). Executar a partir da pasta raiz do projeto:
#   sh test/rodar_sim.sh
# Copia os fontes para test/build_sim/ junto com os stubs (hidef.h, derivative.h, MCUinit.h),
# para que os registradores reais do MC9S12XEP100 nao sejam usados.
set -e
B=test/build_sim
rm -rf "$B"; mkdir -p "$B"
cp test/stub/*.h "$B"/
for f in config.h delay.h spi.h; do [ -f "Sources/$f" ] && cp "Sources/$f" "$B"/; done
cp Sources/sb800.c Sources/sb800.h test/sim_sb800.c "$B"/
gcc -std=c99 -I"$B" -o "$B/sim" "$B/sim_sb800.c" "$B/sb800.c"
"$B/sim"
