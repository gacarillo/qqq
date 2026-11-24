/**
 * Converte a arte SVG em bitmaps no tamanho exato de tela (já multiplicado pela densidade de pixels), para
 * desenhar no canvas sem borrar e sem custo a cada quadro.
 */
import { ARTE_CADEADO, ARTE_ESPECIAL, ARTE_FRUTA, ARTE_SAQUINHO } from './arte';

const fontes: Record<string, string> = {
  ...ARTE_FRUTA,
  ...ARTE_ESPECIAL,
  saquinho: ARTE_SAQUINHO,
  cadeado: ARTE_CADEADO,
};

const imagens = new Map<string, HTMLImageElement>();
const cache = new Map<string, HTMLCanvasElement>();

export function urlArte(chave: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fontes[chave] ?? fontes.A)}`;
}

export async function carregarArtes(): Promise<void> {
  await Promise.all(
    Object.keys(fontes).map(async (chave) => {
      const img = new Image();
      img.src = urlArte(chave);
      try {
        await img.decode();
      } catch {
        await new Promise((ok) => {
          img.onload = ok;
          img.onerror = ok;
        });
      }
      imagens.set(chave, img);
    }),
  );
}

/** Bitmap quadrado de `lado` pixels de dispositivo, ou null se a arte ainda não carregou. */
export function bitmap(chave: string, lado: number): HTMLCanvasElement | null {
  const px = Math.max(8, Math.round(lado));
  const id = `${chave}@${px}`;
  const pronto = cache.get(id);
  if (pronto) return pronto;
  const img = imagens.get(chave);
  if (!img || !img.complete || img.naturalWidth === 0) return null;
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  const g = c.getContext('2d');
  if (!g) return null;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, px, px);
  cache.set(id, c);
  return c;
}

export function limparCache(): void {
  cache.clear();
}
