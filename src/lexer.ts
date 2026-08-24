import type { Span } from "./diagnostics.js";
import { VivaError } from "./diagnostics.js";

export type TokenType =
  | "IDENT"
  | "KEYWORD"
  | "NUMBER"
  | "STRING"
  | "COLOR"
  | "NEWLINE"
  | "INDENT"
  | "DEDENT"
  | "COLON"
  | "COMMA"
  | "DOT"
  | "EQ"
  | "BIND"
  | "EQEQ"
  | "NEQ"
  | "LT"
  | "GT"
  | "LTE"
  | "GTE"
  | "PLUS"
  | "MINUS"
  | "STAR"
  | "SLASH"
  | "PERCENT"
  | "LPAREN"
  | "RPAREN"
  | "LBRACK"
  | "RBRACK"
  | "LBRACE"
  | "RBRACE"
  | "EOF";

export type Token = {
  type: TokenType;
  value: string;
  span: Span;
};

const KEYWORDS = new Set([
  "artifact",
  "data",
  "state",
  "entity",
  "scene",
  "layer",
  "node",
  "resource",
  "rule",
  "event",
  "function",
  "animate",
  "timeline",
  "tick",
  "bind",
  "if",
  "for",
  "when",
  "as",
  "in",
  "on",
  "widget",
  "frame",
  "true",
  "false",
  "none",
  "and",
  "or",
  "not",
]);

export function tokenize(source: string, filename = "<input>"): Token[] {
  const text = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const tokens: Token[] = [];
  const indents = [0];
  let i = 0;
  let line = 1;
  let column = 1;
  let atLineStart = true;
  let bracketDepth = 0;

  const span = (): Span => ({ line, column });

  const push = (type: TokenType, value = "", s = span()): void => {
    tokens.push({ type, value, span: s });
  };

  const advance = (n = 1): void => {
    for (let k = 0; k < n; k += 1) {
      if (text[i] === "\n") {
        line += 1;
        column = 1;
      } else {
        column += 1;
      }
      i += 1;
    }
  };

  const peek = (n = 0): string => text[i + n] ?? "";

  const isHex = (ch: string): boolean => /[0-9a-fA-F]/.test(ch);

  const skipComment = (): boolean => {
    if (peek() !== "#") return false;
    const next = peek(1);
    if (isHex(next)) return false;
    while (i < text.length && peek() !== "\n") advance();
    return true;
  };

  const emitIndent = (indent: number): void => {
    const current = indents[indents.length - 1] ?? 0;
    if (indent > current) {
      indents.push(indent);
      push("INDENT");
      return;
    }
    while ((indents[indents.length - 1] ?? 0) > indent) {
      indents.pop();
      push("DEDENT");
    }
    if ((indents[indents.length - 1] ?? 0) !== indent) {
      throw new VivaError([
        {
          message: "inconsistent indentation",
          span: { line, column: 1 },
          source: filename,
        },
      ]);
    }
  };

  while (i < text.length) {
    if (atLineStart) {
      let indent = 0;
      while (peek() === " " || peek() === "\t") {
        indent += peek() === "\t" ? 2 : 1;
        advance();
      }
      if (peek() === "\n") {
        advance();
        continue;
      }
      if (peek() === "#" && !isHex(peek(1))) {
        skipComment();
        if (peek() === "\n") advance();
        continue;
      }
      if (i >= text.length) break;
      if (bracketDepth === 0) emitIndent(indent);
      atLineStart = false;
      continue;
    }

    if (skipComment()) continue;

    const ch = peek();
    if (ch === " " || ch === "\t") {
      advance();
      continue;
    }

    if (ch === "\n") {
      if (bracketDepth === 0) push("NEWLINE");
      advance();
      atLineStart = true;
      continue;
    }

    const start = span();

    if (ch === '"' || ch === "'") {
      const quote = ch;
      advance();
      let value = "";
      while (i < text.length && peek() !== quote) {
        if (peek() === "\\") {
          advance();
          const escaped = peek();
          const map: Record<string, string> = {
            n: "\n",
            t: "\t",
            r: "\r",
            '"': '"',
            "'": "'",
            "\\": "\\",
          };
          value += map[escaped] ?? escaped;
          advance();
        } else {
          value += peek();
          advance();
        }
      }
      if (peek() !== quote) {
        throw new VivaError([
          { message: "unterminated string", span: start, source: filename },
        ]);
      }
      advance();
      push("STRING", value, start);
      continue;
    }

    if (ch === "#" && isHex(peek(1))) {
      let value = "#";
      advance();
      while (isHex(peek())) {
        value += peek();
        advance();
      }
      push("COLOR", value, start);
      continue;
    }

    if (/[0-9]/.test(ch)) {
      let value = "";
      while (/[0-9]/.test(peek())) {
        value += peek();
        advance();
      }
      if (peek() === "." && /[0-9]/.test(peek(1))) {
        value += ".";
        advance();
        while (/[0-9]/.test(peek())) {
          value += peek();
          advance();
        }
      }
      const unit = peek();
      if (unit === "s" || (unit === "m" && peek(1) === "s")) {
        if (unit === "s") {
          value = String(Number(value) * 1000);
          advance();
        } else {
          advance(2);
        }
      }
      push("NUMBER", value, start);
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let value = "";
      while (/[A-Za-z0-9_]/.test(peek())) {
        value += peek();
        advance();
      }
      push(KEYWORDS.has(value) ? "KEYWORD" : "IDENT", value, start);
      continue;
    }

    const two = ch + peek(1);
    const twoMap: Record<string, TokenType> = {
      "<-": "BIND",
      "==": "EQEQ",
      "!=": "NEQ",
      "<=": "LTE",
      ">=": "GTE",
    };
    if (twoMap[two]) {
      push(twoMap[two], two, start);
      advance(2);
      continue;
    }

    const oneMap: Record<string, TokenType> = {
      ":": "COLON",
      ",": "COMMA",
      ".": "DOT",
      "=": "EQ",
      "<": "LT",
      ">": "GT",
      "+": "PLUS",
      "-": "MINUS",
      "*": "STAR",
      "/": "SLASH",
      "%": "PERCENT",
      "(": "LPAREN",
      ")": "RPAREN",
      "[": "LBRACK",
      "]": "RBRACK",
      "{": "LBRACE",
      "}": "RBRACE",
    };
    const type = oneMap[ch];
    if (type) {
      if (ch === "(" || ch === "[" || ch === "{") bracketDepth += 1;
      if (ch === ")" || ch === "]" || ch === "}") bracketDepth = Math.max(0, bracketDepth - 1);
      push(type, ch, start);
      advance();
      continue;
    }

    throw new VivaError([
      {
        message: `unexpected character '${ch}'`,
        span: start,
        source: filename,
      },
    ]);
  }

  if (!atLineStart) push("NEWLINE");
  while (indents.length > 1) {
    indents.pop();
    push("DEDENT");
  }
  push("EOF");
  return tokens;
}
