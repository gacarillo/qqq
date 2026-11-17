/**
 * Entrega de arquivos ao usuário. Publicado no claude.ai, o estúdio usa o recurso de
 * downloads da página, que pede confirmação. Aberto localmente (npm run dev ou o HTML
 * salvo), baixa direto pelo navegador.
 */
import { aviso } from "@/ui/componentes";

interface Downloads {
  save(r: { filename: string; data: string | Blob | ArrayBuffer | ArrayBufferView }): Promise<{ status: "saved" | "delivered" }>;
}
interface ClaudeJanela {
  use(nome: "downloads"): Promise<Downloads | null>;
}

let promessa: Promise<Downloads | null> | null = null;
function downloads(): Promise<Downloads | null> {
  const c = (window as unknown as { claude?: ClaudeJanela }).claude;
  if (!c?.use) return Promise.resolve(null);
  promessa ??= c.use("downloads").catch(() => null);
  return promessa;
}

export async function salvarArquivo(nome: string, dados: string | Blob): Promise<void> {
  const d = await downloads();
  if (d) {
    try {
      const r = await d.save({ filename: nome, data: dados });
      if (r.status === "saved") aviso(`${nome} salvo`, "ok");
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "declined") aviso("download cancelado");
      else if (code === "rate_limited") aviso("já há um pedido de download aberto; tente de novo em alguns segundos", "erro");
      else aviso(`não foi possível salvar ${nome} nesta visualização (${code ?? "sem código"})`, "erro");
    }
    return;
  }
  const blob = typeof dados === "string" ? new Blob([dados], { type: tipoMime(nome) }) : dados;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  aviso(`${nome} enviado ao navegador`, "ok");
}

function tipoMime(nome: string): string {
  const ext = nome.split(".").pop() ?? "";
  return ({ csv: "text/csv", json: "application/json", svg: "image/svg+xml", html: "text/html", txt: "text/plain", md: "text/markdown" } as Record<string, string>)[ext] ?? "application/octet-stream";
}

export function canvasParaBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, erro) => c.toBlob((b) => (b ? ok(b) : erro(new Error("o navegador não gerou a imagem"))), "image/png"));
}

export async function salvarPNG(nome: string, c: HTMLCanvasElement): Promise<void> {
  await salvarArquivo(nome.endsWith(".png") ? nome : `${nome}.png`, await canvasParaBlob(c));
}

/** Nome de arquivo seguro a partir de um título. */
export function nomeArquivo(base: string, ext: string): string {
  const limpo = base.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").toLowerCase();
  return `gfetsim_${limpo || "figura"}.${ext}`;
}
