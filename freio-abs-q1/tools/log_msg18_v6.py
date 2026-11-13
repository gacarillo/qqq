"""Registra os quadros de 4 bytes enviados pelo firmware a cada MR (msg 18).

Formato (SB800_DEBUG_UART em sb800.c): mr, resp_hi, resp_lo, st
  resp = resposta da msg 18: P | Fmsg | X | X | HD_lkg | ERR_CNT(3) | AR(8)
  st   = bits SB800_ST_*:
         0x01 FMSG  0x02 PARITY  0x04 ERRCNT  0x08 RSTB  0x10 LFSR
         0x20 HDLKG 0x40 HDOC    0x80 HDOK (Q1 aceito pelo CI)

Uso: python log_msg18_v6.py [PORTA] [N_AMOSTRAS]    ex.: python log_msg18_v6.py COM3 1500
"""
import sys
import time
import serial

porta = sys.argv[1] if len(sys.argv) > 1 else 'COM3'
n_amostras = int(sys.argv[2]) if len(sys.argv) > 2 else 750   # ~30 s a 40 ms/MR
baud = 9600
BYTES_POR_AMOSTRA = 4

ST_BITS = [(0x01, 'FMSG'), (0x02, 'PARITY'), (0x04, 'ERRCNT'), (0x08, 'RSTB'),
           (0x10, 'LFSR'), (0x20, 'HDLKG'), (0x40, 'HDOC'), (0x80, 'HDOK')]


def sincroniza(ser):
    """Descarta bytes ate achar um quadro coerente (paridade da resposta ok)."""
    buf = bytearray(ser.read(BYTES_POR_AMOSTRA * 8))
    for off in range(BYTES_POR_AMOSTRA):
        ok = True
        for k in range(off, len(buf) - 3, BYTES_POR_AMOSTRA):
            rx = (buf[k + 1] << 8) | buf[k + 2]
            if (bin(rx & 0x7FFF).count('1') & 1) != (rx >> 15):
                ok = False
                break
        if ok:
            resto = (len(buf) - off) % BYTES_POR_AMOSTRA
            if resto:
                ser.read(BYTES_POR_AMOSTRA - resto)
            return
    # sem sincronismo confiavel: segue assim mesmo


with serial.Serial(porta, baud, timeout=2) as ser:
    ser.reset_input_buffer()
    sincroniza(ser)
    dados = ser.read(BYTES_POR_AMOSTRA * n_amostras)

n_lidas = len(dados) // BYTES_POR_AMOSTRA
arquivo = time.strftime("log_msg18_%Y%m%d_%H%M%S.csv")
transicoes = []
ultimo_ok = None
with open(arquivo, "w") as f:
    f.write("n,t_ms,mr,resp_hex,ar,err_cnt,hd_lkg,st_hex,st_txt\n")
    for n in range(n_lidas):
        i = BYTES_POR_AMOSTRA * n
        mr, rx_hi, rx_lo, st = dados[i], dados[i + 1], dados[i + 2], dados[i + 3]
        rx = (rx_hi << 8) | rx_lo
        ar = rx & 0xFF
        err_cnt = (rx >> 8) & 0x07
        hd_lkg = (rx >> 11) & 0x01
        st_txt = '|'.join(nome for bit, nome in ST_BITS if st & bit)
        f.write(f"{n},{n * 40},{mr},0x{rx:04X},{ar},{err_cnt},{hd_lkg},0x{st:02X},{st_txt}\n")
        ok = bool(st & 0x80)
        if ok != ultimo_ok:
            transicoes.append((n, ok, hd_lkg))
            ultimo_ok = ok

print(f"{n_lidas} amostras salvas em {arquivo}")
for n, ok, lkg in transicoes:
    print(f"  amostra {n} (~{n * 40} ms): Q1 {'ACEITO' if ok else 'nao aceito'} (HD_lkg={lkg})")
