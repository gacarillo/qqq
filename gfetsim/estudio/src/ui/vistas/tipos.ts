import type { Aba } from "@/estado/app";

export interface Exportavel {
  nome: string;
  png?: (escala?: number) => HTMLCanvasElement;
  svg?: () => string;
  csv?: () => string;
}

export interface Vista {
  id: Aba;
  titulo: string;
  el: HTMLElement;
  ativar?(): void;
  desativar?(): void;
  /** chamado a cada quadro enquanto a vista está visível */
  quadro?(dt: number): void;
  exportaveis?(): Exportavel[];
  /** canvas que o gravador de vídeo captura */
  telaVideo?(): HTMLCanvasElement | null;
}
