import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync, inflateSync } from "node:zlib";

/** Decode PDF content streams to operator text (latin1). */
export function pdfContentOperators(bytes: Uint8Array): string {
  const raw = new TextDecoder("latin1").decode(bytes);
  const chunks = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)];
  let out = "";
  for (const chunk of chunks) {
    const buf = Buffer.from(chunk[1]!, "latin1");
    for (const inflate of [inflateSync, inflateRawSync]) {
      try {
        out += inflate(buf).toString("latin1");
        break;
      } catch {
        /* try the other wrapper */
      }
    }
  }
  return out;
}

function decodePdfLiteral(body: string): string {
  return body
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\(\d{1,3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8)));
}

function decodeUtf16BeHex(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  let s = "";
  for (let i = 0; i < clean.length; i += 4) {
    s += String.fromCharCode(parseInt(clean.slice(i, i + 4).padEnd(4, "0"), 16));
  }
  return s;
}

function decodePdfHex(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2).padEnd(2, "0"), 16));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let s = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      s += String.fromCharCode((bytes[i]! << 8) | bytes[i + 1]!);
    }
    return s;
  }
  const utf16 =
    bytes.length >= 2 &&
    bytes.length % 2 === 0 &&
    bytes.every((b, i) => i % 2 === 1 || b === 0);
  if (utf16) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 2) {
      s += String.fromCharCode((bytes[i]! << 8) | bytes[i + 1]!);
    }
    return s;
  }
  return Buffer.from(bytes).toString("latin1");
}

function decodePdfStringToken(token: string): string {
  if (token.startsWith("(") && token.endsWith(")")) return decodePdfLiteral(token.slice(1, -1));
  if (token.startsWith("<") && token.endsWith(">")) return decodePdfHex(token.slice(1, -1));
  return "";
}

function parseToUnicode(ops: string): Map<string, string> {
  const map = new Map<string, string>();
  const cmapBlocks = ops.match(/begincmap[\s\S]*?endcmap/g) ?? [];
  for (const cmap of cmapBlocks) {
    if (cmap.length > 80_000) continue;
    const block = /beginbfchar([\s\S]*?)endbfchar/g;
    let m: RegExpExecArray | null;
    while ((m = block.exec(cmap))) {
      const pairs = m[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g);
      for (const pair of pairs) {
        map.set(pair[1]!.toUpperCase(), decodeUtf16BeHex(pair[2]!));
      }
    }
  }
  return map;
}

function decodeWithCmap(token: string, cmap: Map<string, string>): string {
  if (token.startsWith("(") && token.endsWith(")")) return decodePdfLiteral(token.slice(1, -1));
  if (token.startsWith("<") && token.endsWith(">")) {
    const hex = token.slice(1, -1).replace(/\s+/g, "").toUpperCase();
    if (cmap.has(hex)) return cmap.get(hex)!;
    let out = "";
    for (let i = 0; i < hex.length; i += 4) {
      const cid = hex.slice(i, i + 4).padEnd(4, "0");
      out += cmap.get(cid) ?? decodePdfHex(cid);
    }
    return out;
  }
  return "";
}

/**
 * Extract painted PDF strings in draw order. Used as the R2-B true value
 * (the file, not the layout estimate).
 */
export function extractPdfStrings(bytes: Uint8Array): string[] {
  const ops = pdfContentOperators(bytes);
  const cmap = parseToUnicode(ops);
  const out: string[] = [];
  const tj = /\((?:\\.|[^\\)])*\)|<[^>]+>\s*Tj/g;
  const tjArray = /\[([\s\S]*?)\]\s*TJ/g;
  let m: RegExpExecArray | null;
  while ((m = tj.exec(ops))) {
    const token = m[0].replace(/\s*Tj$/, "").trim();
    const text = decodeWithCmap(token, cmap);
    if (text) out.push(text);
  }
  while ((m = tjArray.exec(ops))) {
    const inner = m[1] ?? "";
    const parts = [...inner.matchAll(/\((?:\\.|[^\\)])*\)|<[^>]+>/g)].map((p) =>
      decodeWithCmap(p[0]!, cmap),
    );
    const joined = parts.join("");
    if (joined) out.push(joined);
  }
  return out;
}

function pdftotextHaystack(bytes: Uint8Array): string {
  const dir = mkdtempSync(join(tmpdir(), "viva-pdftxt-"));
  try {
    const pdfPath = join(dir, "in.pdf");
    writeFileSync(pdfPath, bytes);
    const ran = spawnSync("pdftotext", ["-layout", pdfPath, "-"], { encoding: "utf8" });
    if (ran.status !== 0) return "";
    return (ran.stdout ?? "").replace(/\s+/g, " ");
  } catch {
    return "";
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function pdfHaystack(bytes: Uint8Array): string {
  const poppler = pdftotextHaystack(bytes);
  if (poppler.trim()) return poppler;
  return extractPdfStrings(bytes).join("").replace(/\u0000/g, "");
}
