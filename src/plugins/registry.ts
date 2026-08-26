import type { Artifact, FrameDecl, LayerDecl } from "../ast.js";
import type { CompileHook, WidgetPlugin } from "./types.js";

const widgets = new Map<string, WidgetPlugin>();
const compileHooks = new Map<string, CompileHook>();
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

export function registerCompileHook(hook: CompileHook): void {
  compileHooks.set(hook.name, hook);
}

export function unregisterCompileHook(name: string): void {
  compileHooks.delete(name);
}

export function listCompileHooks(): string[] {
  return [...compileHooks.keys()];
}

export function hookMayTouchOwner(owner: string | undefined, hookName: string): boolean {
  if (!owner) return true;
  const plugin = widgets.get(owner);
  if (!plugin) return true;
  const allow = plugin.allowHooks ?? [];
  if (allow.includes("*")) return true;
  return allow.includes(hookName);
}

export function runCompileHooks(artifact: Artifact): void {
  for (const hook of orderCompileHooks()) {
    const snap = snapshotProtected(artifact, hook.name);
    hook.run(artifact);
    restoreProtected(artifact, snap);
  }
}

function snapshotProtected(
  artifact: Artifact,
  hookName: string,
): { layers: LayerDecl[]; frames: FrameDecl[] } {
  const layers = (artifact.scene?.layers ?? [])
    .filter((layer) => layer.owner && !hookMayTouchOwner(layer.owner, hookName))
    .map((layer) => structuredClone(layer));
  const frames = artifact.frames
    .filter((frame) => frame.owner && !hookMayTouchOwner(frame.owner, hookName))
    .map((frame) => structuredClone(frame));
  return { layers, frames };
}

function restoreProtected(
  artifact: Artifact,
  snap: { layers: LayerDecl[]; frames: FrameDecl[] },
): void {
  if (!artifact.scene) return;
  for (const layer of snap.layers) {
    const i = artifact.scene.layers.findIndex((item) => item.name === layer.name);
    if (i >= 0) artifact.scene.layers[i] = structuredClone(layer);
    else artifact.scene.layers.push(structuredClone(layer));
  }
  for (const frame of snap.frames) {
    const i = artifact.frames.findIndex((item) => item.name === frame.name);
    if (i >= 0) artifact.frames[i] = structuredClone(frame);
    else artifact.frames.push(structuredClone(frame));
  }
}

export function orderCompileHooks(): CompileHook[] {
  const all = [...compileHooks.values()];
  const done = new Set<string>();
  const out: CompileHook[] = [];
  let guard = 0;
  while (out.length < all.length && guard++ < all.length + 4) {
    let progressed = false;
    for (const hook of all) {
      if (done.has(hook.name)) continue;
      const deps = hook.after ?? [];
      if (deps.every((name) => done.has(name) || !compileHooks.has(name))) {
        out.push(hook);
        done.add(hook.name);
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  for (const hook of all) {
    if (!done.has(hook.name)) out.push(hook);
  }
  return out;
}

export function resetWidgetPlugins(): void {
  widgets.clear();
  compileHooks.clear();
  builtinsSeeded = false;
}

export function ensureBuiltinPlugins(): void {
  if (builtinsSeeded) return;
  builtinsSeeded = true;
  seedBuiltins?.();
}
