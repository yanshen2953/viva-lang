import type { WidgetPlugin } from "./types.js";

const widgets = new Map<string, WidgetPlugin>();
let builtinsSeeded = false;
let seedBuiltins: (() => void) | undefined;

export function setWidgetBuiltinSeed(fn: () => void): void {
  seedBuiltins = fn;
}

export function registerWidget(plugin: WidgetPlugin): void {
  widgets.set(plugin.name, plugin);
}

export function unregisterWidget(name: string): void {
  widgets.delete(name);
}

export function getWidget(name: string): WidgetPlugin | undefined {
  return widgets.get(name);
}

export function listWidgets(): string[] {
  return [...widgets.keys()].sort();
}

export function resetWidgetPlugins(): void {
  widgets.clear();
  builtinsSeeded = false;
}

export function ensureBuiltinPlugins(): void {
  if (builtinsSeeded) return;
  builtinsSeeded = true;
  seedBuiltins?.();
}
