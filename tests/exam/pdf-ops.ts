import { inflateRawSync, inflateSync } from "node:zlib";

/** Inflate PDF content streams by /Length. Do not regex `stream` — `endstream` contains that word. */
export function pdfOperators(bytes: Uint8Array): string {
  const raw = new TextDecoder("latin1").decode(bytes);
  let out = "";
  const re = /\/Length\s+(\d+)\s*\n>>\s*\nstream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const n = Number(match[1]);
    if (!Number.isFinite(n) || n < 0) continue;
    const start = match.index + match[0].length;
    const buf = Buffer.from(raw.slice(start, start + n), "latin1");
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
