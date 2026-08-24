import { ensureBuiltinPlugins, listCompileHooks, listWidgets } from "../widgets.js";
import { listStylePresets } from "../style/index.js";

export type VivaCapabilities = {
  widgets: string[];
  compileHooks: string[];
  handbooks: string[];
  events: string[];
  scene: string[];
};

export function vivaCapabilities(): VivaCapabilities {
  ensureBuiltinPlugins();
  return {
    widgets: listWidgets(),
    compileHooks: listCompileHooks(),
    handbooks: listStylePresets().map((p) => p.id),
    events: ["click", "hover", "dragstart", "drag", "dragend", "collide", "key"],
    scene: ["unit: mm", "column: single|double", "page: a4|letter", "span: 1|2"],
  };
}

export function formatCapabilities(caps = vivaCapabilities()): string {
  return [
    `widgets: ${caps.widgets.join(", ")}`,
    `hooks: ${caps.compileHooks.join(", ") || "(none)"}`,
    `handbooks: ${caps.handbooks.join(", ")}`,
    `events: ${caps.events.join(", ")}`,
    `scene: ${caps.scene.join("; ")}`,
  ].join("\n");
}
