/**
 * Superfície de desenho comum ao canvas e ao SVG: o gráfico desenha uma vez por esta
 * interface e sai em pixels na tela ou em vetor na exportação.
 */
export interface EstiloTraco {
  cor: string;
  largura?: number;
  tracejado?: number[];
  alfa?: number;
}

export interface Pincel {
  readonly largura: number;
  readonly altura: number;
  linha(xs: ArrayLike<number>, ys: ArrayLike<number>, e: EstiloTraco): void;
  poligono(xs: ArrayLike<number>, ys: ArrayLike<number>, cor: string, alfa?: number): void;
  retangulo(x: number, y: number, w: number, h: number, cor: string, alfa?: number, borda?: string): void;
  circulo(x: number, y: number, r: number, cor: string, borda?: string, alfa?: number): void;
  texto(t: string, x: number, y: number, o: { cor: string; tamanho?: number; alinhar?: "left" | "center" | "right"; base?: "top" | "middle" | "bottom" | "alphabetic"; fonte?: string; rotacao?: number; peso?: number }): void;
  recortar(x: number, y: number, w: number, h: number): void;
  restaurar(): void;
  imagem?(img: CanvasImageSource, x: number, y: number, w: number, h: number, suave?: boolean): void;
  medir(t: string, tamanho: number, fonte?: string): number;
}

let ctxMedida: CanvasRenderingContext2D | null = null;
function medirTexto(t: string, tamanho: number, fonte: string): number {
  ctxMedida ??= document.createElement("canvas").getContext("2d");
  if (!ctxMedida) return t.length * tamanho * 0.6;
  ctxMedida.font = `${tamanho}px ${fonte}`;
  return ctxMedida.measureText(t).width;
}

export class PincelCanvas implements Pincel {
  constructor(readonly ctx: CanvasRenderingContext2D, readonly largura: number, readonly altura: number, readonly fontePadrao: string) {}

  linha(xs: ArrayLike<number>, ys: ArrayLike<number>, e: EstiloTraco): void {
    const c = this.ctx;
    c.save();
    c.strokeStyle = e.cor;
    c.lineWidth = e.largura ?? 1.5;
    c.globalAlpha = e.alfa ?? 1;
    c.lineJoin = "round";
    c.lineCap = "round";
    c.setLineDash(e.tracejado ?? []);
    c.beginPath();
    let ini = false;
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i], y = ys[i];
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        ini = false;
        continue;
      }
      if (!ini) {
        c.moveTo(x, y);
        ini = true;
      } else c.lineTo(x, y);
    }
    c.stroke();
    c.restore();
  }

  poligono(xs: ArrayLike<number>, ys: ArrayLike<number>, cor: string, alfa = 1): void {
    const c = this.ctx;
    c.save();
    c.fillStyle = cor;
    c.globalAlpha = alfa;
    c.beginPath();
    for (let i = 0; i < xs.length; i++) {
      if (i) c.lineTo(xs[i], ys[i]);
      else c.moveTo(xs[i], ys[i]);
    }
    c.closePath();
    c.fill();
    c.restore();
  }

  retangulo(x: number, y: number, w: number, h: number, cor: string, alfa = 1, borda?: string): void {
    const c = this.ctx;
    c.save();
    c.globalAlpha = alfa;
    if (cor !== "none") {
      c.fillStyle = cor;
      c.fillRect(x, y, w, h);
    }
    if (borda) {
      c.globalAlpha = 1;
      c.strokeStyle = borda;
      c.lineWidth = 1;
      c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    c.restore();
  }

  circulo(x: number, y: number, r: number, cor: string, borda?: string, alfa = 1): void {
    const c = this.ctx;
    c.save();
    c.globalAlpha = alfa;
    c.beginPath();
    c.arc(x, y, r, 0, 2 * Math.PI);
    c.fillStyle = cor;
    c.fill();
    if (borda) {
      c.strokeStyle = borda;
      c.lineWidth = 1.5;
      c.stroke();
    }
    c.restore();
  }

  texto(t: string, x: number, y: number, o: Parameters<Pincel["texto"]>[3]): void {
    const c = this.ctx;
    c.save();
    c.fillStyle = o.cor;
    c.font = `${o.peso ?? 400} ${o.tamanho ?? 11}px ${o.fonte ?? this.fontePadrao}`;
    c.textAlign = o.alinhar ?? "left";
    c.textBaseline = o.base ?? "alphabetic";
    if (o.rotacao) {
      c.translate(x, y);
      c.rotate(o.rotacao);
      c.fillText(t, 0, 0);
    } else c.fillText(t, x, y);
    c.restore();
  }

  recortar(x: number, y: number, w: number, h: number): void {
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(x, y, w, h);
    this.ctx.clip();
  }

  restaurar(): void {
    this.ctx.restore();
  }

  imagem(img: CanvasImageSource, x: number, y: number, w: number, h: number, suave = true): void {
    const c = this.ctx;
    c.save();
    c.imageSmoothingEnabled = suave;
    c.drawImage(img, x, y, w, h);
    c.restore();
  }

  medir(t: string, tamanho: number, fonte?: string): number {
    this.ctx.save();
    this.ctx.font = `${tamanho}px ${fonte ?? this.fontePadrao}`;
    const w = this.ctx.measureText(t).width;
    this.ctx.restore();
    return w;
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f = (v: number) => (Number.isFinite(v) ? Number(v.toFixed(2)) : 0);

export class PincelSVG implements Pincel {
  private partes: string[] = [];
  private nivelRecorte = 0;
  private idRecorte = 0;

  constructor(readonly largura: number, readonly altura: number, readonly fontePadrao: string, fundo?: string) {
    if (fundo) this.partes.push(`<rect width="${largura}" height="${altura}" fill="${esc(fundo)}"/>`);
  }

  linha(xs: ArrayLike<number>, ys: ArrayLike<number>, e: EstiloTraco): void {
    const segs: string[] = [];
    let atual: string[] = [];
    for (let i = 0; i < xs.length; i++) {
      if (!Number.isFinite(xs[i]) || !Number.isFinite(ys[i])) {
        if (atual.length) segs.push(atual.join(" "));
        atual = [];
        continue;
      }
      atual.push(`${atual.length ? "L" : "M"}${f(xs[i])},${f(ys[i])}`);
    }
    if (atual.length) segs.push(atual.join(" "));
    if (!segs.length) return;
    this.partes.push(`<path d="${segs.join(" ")}" fill="none" stroke="${esc(e.cor)}" stroke-width="${e.largura ?? 1.5}"${e.tracejado?.length ? ` stroke-dasharray="${e.tracejado.join(" ")}"` : ""}${e.alfa !== undefined && e.alfa < 1 ? ` stroke-opacity="${e.alfa}"` : ""} stroke-linejoin="round" stroke-linecap="round"/>`);
  }

  poligono(xs: ArrayLike<number>, ys: ArrayLike<number>, cor: string, alfa = 1): void {
    const pts: string[] = [];
    for (let i = 0; i < xs.length; i++) pts.push(`${f(xs[i])},${f(ys[i])}`);
    this.partes.push(`<polygon points="${pts.join(" ")}" fill="${esc(cor)}"${alfa < 1 ? ` fill-opacity="${alfa}"` : ""}/>`);
  }

  retangulo(x: number, y: number, w: number, h: number, cor: string, alfa = 1, borda?: string): void {
    this.partes.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${cor === "none" ? "none" : esc(cor)}"${alfa < 1 ? ` fill-opacity="${alfa}"` : ""}${borda ? ` stroke="${esc(borda)}"` : ""}/>`);
  }

  circulo(x: number, y: number, r: number, cor: string, borda?: string, alfa = 1): void {
    this.partes.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${esc(cor)}"${alfa < 1 ? ` fill-opacity="${alfa}"` : ""}${borda ? ` stroke="${esc(borda)}" stroke-width="1.5"` : ""}/>`);
  }

  texto(t: string, x: number, y: number, o: Parameters<Pincel["texto"]>[3]): void {
    const anc = o.alinhar === "center" ? "middle" : o.alinhar === "right" ? "end" : "start";
    const base = o.base === "top" ? "hanging" : o.base === "middle" ? "central" : o.base === "bottom" ? "text-after-edge" : "auto";
    const rot = o.rotacao ? ` transform="rotate(${(o.rotacao * 180) / Math.PI} ${f(x)} ${f(y)})"` : "";
    this.partes.push(`<text x="${f(x)}" y="${f(y)}" fill="${esc(o.cor)}" font-size="${o.tamanho ?? 11}" font-family="${esc(o.fonte ?? this.fontePadrao)}" font-weight="${o.peso ?? 400}" text-anchor="${anc}" dominant-baseline="${base}"${rot}>${esc(t)}</text>`);
  }

  recortar(x: number, y: number, w: number, h: number): void {
    const id = `r${++this.idRecorte}`;
    this.partes.push(`<clipPath id="${id}"><rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"/></clipPath><g clip-path="url(#${id})">`);
    this.nivelRecorte++;
  }

  restaurar(): void {
    if (this.nivelRecorte > 0) {
      this.partes.push("</g>");
      this.nivelRecorte--;
    }
  }

  imagem(img: CanvasImageSource, x: number, y: number, w: number, h: number): void {
    if (img instanceof HTMLCanvasElement) this.partes.push(`<image x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" preserveAspectRatio="none" href="${img.toDataURL("image/png")}"/>`);
  }

  medir(t: string, tamanho: number, fonte?: string): number {
    return medirTexto(t, tamanho, fonte ?? this.fontePadrao);
  }

  resultado(): string {
    while (this.nivelRecorte > 0) this.restaurar();
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.largura}" height="${this.altura}" viewBox="0 0 ${this.largura} ${this.altura}">${this.partes.join("")}</svg>`;
  }
}
