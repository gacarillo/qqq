/** Gravação de vídeo WebM de um canvas pela API MediaRecorder. */
import { salvarArquivo } from "./salvar";
import { aviso } from "@/ui/componentes";

export function videoDisponivel(): boolean {
  return typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function";
}

export async function gravarCanvas(canvas: HTMLCanvasElement, segundos: number, nome: string, aoIniciar?: () => void, aoProgresso?: (f: number) => void): Promise<void> {
  if (!videoDisponivel()) {
    aviso("este navegador não grava vídeo de canvas", "erro");
    return;
  }
  const fluxo = canvas.captureStream(30);
  const tipos = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  const mime = tipos.find((t) => MediaRecorder.isTypeSupported(t)) ?? "video/webm";
  const rec = new MediaRecorder(fluxo, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const pedacos: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) pedacos.push(e.data);
  };
  const fim = new Promise<void>((ok) => (rec.onstop = () => ok()));
  rec.start(250);
  aoIniciar?.();
  const t0 = performance.now();
  await new Promise<void>((ok) => {
    const passo = () => {
      const f = (performance.now() - t0) / (segundos * 1000);
      aoProgresso?.(Math.min(1, f));
      if (f >= 1) ok();
      else requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  });
  rec.stop();
  await fim;
  fluxo.getTracks().forEach((t) => t.stop());
  await salvarArquivo(nome, new Blob(pedacos, { type: "video/webm" }));
}
