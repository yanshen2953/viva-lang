import { cloneValue, evaluate, execute, truthy, type Scope } from "./eval.js";
import type { VisualIR } from "./ir.js";
import { applyTimelineState, startOfBeat } from "./timeline/clock.js";
import { applyViewState } from "./runtime/view-machine.js";

export type SimWorld = {
  state: Record<string, unknown>;
  data: Record<string, unknown>;
};

export type SimulateOptions = {
  /** How many tick-body executions to run (not wall-clock frames). */
  ticks?: number;
  /** Fire named events: `{ type, target, event?, item? }` */
  events?: {
    type: string;
    target: string;
    event?: Record<string, unknown>;
    /** Flattened row fields, same as Runtime `fire()` on a for-loop mark. */
    item?: Record<string, unknown>;
  }[];
};

/**
 * Headless world stepping: binds → rules → tick bodies → optional events.
 * Used by Host sessions with `mount: null` and by behavioral exams.
 */
export function createSimWorld(ir: VisualIR): SimWorld {
  return {
    state: cloneValue(ir.state) as Record<string, unknown>,
    data: cloneValue(ir.data) as Record<string, unknown>,
  };
}

export function stepSimWorld(ir: VisualIR, world: SimWorld, opts: SimulateOptions = {}): SimWorld {
  const scopes = (): Scope[] => [world.state, world.data];

  const applyBinds = () => {
    for (const bind of ir.binds) {
      execute(
        [{ kind: "assign", target: bind.target, value: bind.source, span: { line: 1, column: 1 } }],
        scopes(),
      );
    }
  };
  const applyRules = () => {
    for (const rule of ir.rules) {
      if (truthy(evaluate(rule.cond, scopes()))) execute(rule.body, scopes());
    }
  };

  applyBinds();
  applyRules();

  const n = opts.ticks ?? 0;
  for (let i = 0; i < n; i++) {
    if (ir.timeline) {
      applyTimelineState(world.state, ir.timeline, startOfBeat(ir.timeline, i + 1));
    }
    for (const tick of ir.ticks) {
      execute(tick.body, scopes());
    }
    applyBinds();
    applyRules();
    applyViewState(world.state, { playing: Boolean(ir.timeline) });
  }

  for (const fire of opts.events ?? []) {
    const handlers = ir.events.filter(
      (e) => e.type === fire.type && e.target === fire.target,
    );
    const extra: Scope = { __event: fire.event ?? {}, ...(fire.item ?? {}) };
    for (const handler of handlers) {
      execute(handler.body, [extra, ...scopes()]);
    }
    applyBinds();
    applyRules();
  }

  return world;
}

export function simulate(ir: VisualIR, opts: SimulateOptions = {}): SimWorld {
  return stepSimWorld(ir, createSimWorld(ir), opts);
}
