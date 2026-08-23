import type { Expr, Statement } from "./ast.js";

export type Value =
  | number
  | string
  | boolean
  | null
  | Value[]
  | { [key: string]: Value };

export type Scope = Record<string, unknown>;

export function evaluate(expr: Expr, scopes: Scope[]): Value {
  switch (expr.kind) {
    case "number":
      return expr.value;
    case "string":
      return expr.value;
    case "boolean":
      return expr.value;
    case "none":
      return null;
    case "ident":
      return lookup(expr.path, scopes);
    case "array":
      return expr.items.map((item) => evaluate(item, scopes));
    case "object": {
      const obj: Record<string, Value> = {};
      for (const entry of expr.entries) {
        obj[entry.key] = evaluate(entry.value, scopes);
      }
      return obj;
    }
    case "unary": {
      const value = evaluate(expr.expr, scopes);
      return expr.op === "not" ? !truthy(value) : -num(value);
    }
    case "binary":
      return applyBinary(expr.op, evaluate(expr.left, scopes), evaluate(expr.right, scopes));
    case "call":
      return applyCall(
        expr.callee,
        expr.args.map((a) => evaluate(a, scopes)),
      );
  }
}

export function execute(stmts: Statement[], scopes: Scope[]): void {
  for (const stmt of stmts) {
    if (stmt.kind === "assign") {
      assign(stmt.target, evaluate(stmt.value, scopes), scopes);
      continue;
    }
    if (stmt.kind === "if") {
      if (truthy(evaluate(stmt.cond, scopes))) execute(stmt.body, scopes);
      continue;
    }
    const source = evaluate(stmt.source, scopes);
    const items = Array.isArray(source) ? source : [];
    for (const item of items) {
      execute(stmt.body, [{ [stmt.item]: item }, ...scopes]);
    }
  }
}

export function lookup(path: string[], scopes: Scope[]): Value {
  for (const scope of scopes) {
    if (!hasPath(scope, path)) continue;
    return getPath(scope, path);
  }
  return null;
}

export function assign(path: string[], value: Value, scopes: Scope[]): void {
  for (const scope of scopes) {
    if (!hasPath(scope, path)) continue;
    setPath(scope, path, value);
    return;
  }
  const root = scopes[scopes.length - 1];
  if (root) setPath(root, path, value);
}

function hasPath(scope: Scope, path: string[]): boolean {
  if (!(path[0] && path[0] in scope)) return false;
  let current: unknown = scope;
  for (const key of path) {
    if (!isRecord(current) || !(key in current)) return false;
    current = current[key];
  }
  return true;
}

function getPath(scope: Scope, path: string[]): Value {
  let current: unknown = scope;
  for (const key of path) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return current as Value;
}

function setPath(scope: Scope, path: string[], value: Value): void {
  let current: Record<string, unknown> = scope;
  for (const key of path.slice(0, -1)) {
    const next = current[key];
    if (!isRecord(next)) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  const last = path[path.length - 1];
  if (last) current[last] = value;
}

function applyBinary(op: string, left: Value, right: Value): Value {
  switch (op) {
    case "+":
      if (Array.isArray(left) && Array.isArray(right)) {
        return [...left, ...right];
      }
      if (typeof left === "string" || typeof right === "string") {
        return String(left ?? "") + String(right ?? "");
      }
      return num(left) + num(right);
    case "-":
      return num(left) - num(right);
    case "*":
      return num(left) * num(right);
    case "/":
      return num(right) === 0 ? 0 : num(left) / num(right);
    case "%":
      return num(left) % num(right);
    case "==":
      return equals(left, right);
    case "!=":
      return !equals(left, right);
    case "<":
      return num(left) < num(right);
    case ">":
      return num(left) > num(right);
    case "<=":
      return num(left) <= num(right);
    case ">=":
      return num(left) >= num(right);
    case "and":
      return truthy(left) && truthy(right);
    case "or":
      return truthy(left) || truthy(right);
    default:
      return null;
  }
}

import {
  evalPaletteBuiltin,
  evalPaletteStrokeBuiltin,
  getStyleContext,
} from "./style/context.js";

/** Safe builtins for tick / rules (no user-defined functions at runtime yet). */
const NUM_BUILTINS: Record<string, (...args: number[]) => number> = {
  sin: (x) => Math.sin(x),
  cos: (x) => Math.cos(x),
  tan: (x) => Math.tan(x),
  abs: (x) => Math.abs(x),
  sqrt: (x) => (x < 0 ? 0 : Math.sqrt(x)),
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  round: (x) => Math.round(x),
  min: (...xs) => Math.min(...xs),
  max: (...xs) => Math.max(...xs),
  clamp: (x, lo, hi) => Math.min(Math.max(x, lo), hi),
  log: (x) => Math.log(Math.max(x, 1e-12)),
  exp: (x) => Math.exp(x),
};

function applyCall(callee: string, args: Value[]): Value {
  if (callee === "palette") {
    return evalPaletteBuiltin(args[0], args[1]);
  }
  if (callee === "paletteStroke") {
    return evalPaletteStrokeBuiltin(args[0], args[1]);
  }
  const fn = NUM_BUILTINS[callee];
  if (!fn) {
    const allowed = [...Object.keys(NUM_BUILTINS), "palette", "paletteStroke"].join(", ");
    throw new Error(`unknown function '${callee}' (allowed: ${allowed})`);
  }
  return fn(...args.map(num));
}

export function evaluateWithStyle(expr: Expr, scopes: Scope[]): Value {
  if (!getStyleContext()) return evaluate(expr, scopes);
  return evaluate(expr, scopes);
}

export function truthy(value: Value): boolean {
  if (value === null || value === false) return false;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function num(value: Value): number {
  return typeof value === "number" ? value : Number(value) || 0;
}

function equals(left: Value, right: Value): boolean {
  if (left === right) return true;
  if (left === null && right === "") return true;
  if (right === null && left === "") return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function cloneValue<T>(value: T): T {
  return structuredClone(value);
}
