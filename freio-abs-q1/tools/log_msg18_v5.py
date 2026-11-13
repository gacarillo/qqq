import sys
import time
import serial

N_AMOSTRAS = 50
BYTES_POR_AMOSTRA = 4   # 1 byte mr + 2 bytes rx + 1 byte st

porta = 'COM3'
baud = 9600

ser = serial.Serial(porta, baud)
# Aguarda para garantir que o buffer encha (opcional, dependendo da taxa de envio)
dados = ser.read(BYTES_POR_AMOSTRA * N_AMOSTRAS)
ser.close()

arquivo = time.strftime("log_msg18_%Y%m%d_%H%M%S.csv")
with open(arquivo, "w") as f:
    f.write("n,ar,err_cnt,mr,st\n") # Adicionado status (st) para debug
    for n in range(N_AMOSTRAS):
        i = BYTES_POR_AMOSTRA * n
        
        mr = dados[i]
        rx_hi = dados[i + 1]
        rx_lo = dados[i + 2]
        st = dados[i + 3]
        
        rx = (rx_hi << 8) | rx_lo
        ar = rx & 0xFF
        err_cnt = (rx >> 8) & 0x07
        
        f.write(f"{n},{ar},{err_cnt},{mr},{st}\n")

print(f"{N_AMOSTRAS} amostras salvas em {arquivo}")