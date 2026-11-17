/// <reference lib="webworker" />
import { Motor } from "./motor";
import type { Pedido, Resposta } from "./protocolo";

const escopo = self as unknown as DedicatedWorkerGlobalScope;
const motor = new Motor((r: Resposta) => escopo.postMessage(r));
escopo.onmessage = (ev: MessageEvent<Pedido>) => motor.tratar(ev.data);
escopo.postMessage({ tipo: "pronto" } satisfies Resposta);
