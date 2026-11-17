/** Canvas que se redesenha pelo Pincel, com densidade de pixels, redimensionamento e exportação. */
import { h, aoRedimensionar, cssVar } from "@/ui/dom";
import { PincelCanvas, PincelSVG, type Pincel } from "./pincel";

export class Tela {
  readonly canvas: HTMLCanvasElement;
  readonly raiz: HTMLElement;
  private W = 0;
  private H = 0;
  private limpar: () => void;

  constructor(container: HTMLElement, private readonly o: { razao: number; alturaMin?: number; alturaMax?: number; rotulo: string }, private readonly desenho: (p: Pincel, interativo: boolean) => void) {
    this.canvas = h("canvas", { class: "tela", role: "img", "aria-label": o.rotulo });
    this.raiz = h("div", { class: "palco" }, this.canvas);
    container.append(this.raiz);
    this.limpar = aoRedimensionar(this.raiz, () => this.desenhar());
  }

  destruir(): void {
    this.limpar();
    this.raiz.remove();
  }

  desenhar(): void {
    const w = Math.max(220, Math.round(this.raiz.clientWidth || 400));
    const hh = Math.round(Math.min(this.o.alturaMax ?? 560, Math.max(this.o.alturaMin ?? 180, w * this.o.razao)));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(hh * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(hh * dpr);
      this.canvas.style.height = `${hh}px`;
    }
    this.W = w;
    this.H = hh;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.desenho(new PincelCanvas(ctx, w, hh, cssVar("--f-dado", this.raiz) || "monospace"), true);
  }

  png(escala = 3): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = Math.round(this.W * escala);
    c.height = Math.round(this.H * escala);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
    this.desenho(new PincelCanvas(ctx, this.W, this.H, cssVar("--f-dado", this.raiz) || "monospace"), false);
    return c;
  }

  svg(): string {
    const p = new PincelSVG(this.W, this.H, cssVar("--f-dado", this.raiz) || "monospace");
    this.desenho(p, false);
    return p.resultado();
  }
}
