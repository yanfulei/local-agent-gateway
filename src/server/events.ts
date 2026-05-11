import { EventEmitter } from "node:events";
import type { GatewayEvent } from "../shared/types.js";

export class GatewayEventBus {
  private readonly emitter = new EventEmitter();

  publish(event: GatewayEvent): void {
    this.emitter.emit("event", event);
  }

  subscribe(listener: (event: GatewayEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }
}
