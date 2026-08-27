import { inflateRawSync, inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";

function inflateBytes(buf: Uint8Array): string | null {
  for (const inflate of [inflateSync, inflateRawSync]) {
    try {
      return inflate(buf).toString("latin1");
    } catch {
      /* try the other wrapper */
    }
  }
  return null;
}

function rawContents(obj: unknown): Uint8Array | null {
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as { contents?: unknown; getContents?: () => unknown };
  if (rec.contents instanceof Uint8Array) return rec.contents;
  if (typeof rec.getContents === "function") {
    const bytes = rec.getContents();
    if (bytes instanceof Uint8Array) return bytes;
  }
  return null;
}

function looksLikeOps(text: string): boolean {
  return /\b(cm|q|Q|BT|ET|re|m|l|c|f|S|W)\b/.test(text);
}

function decodeContents(obj: unknown): string | null {
  const raw = rawContents(obj);
  if (raw) {
    const inflated = inflateBytes(raw);
    if (inflated != null) return inflated;
    const plain = Buffer.from(raw).toString("latin1");
    return looksLikeOps(plain) ? plain : null;
  }
  if (obj && typeof obj === "object" && "size" in obj && "lookup" in obj) {
    const arr = obj as { size: () => number; lookup: (i: number) => unknown };
    const parts: string[] = [];
    for (let i = 0; i < arr.size(); i++) {
      const part = decodeContents(arr.lookup(i));
      if (part) parts.push(part);
    }
    return parts.length ? parts.join("\n") : null;
  }
  return null;
}

function inflateByStreamKeyword(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  const out: string[] = [];
  const startRe = /(?:^|[\s])stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = startRe.exec(raw))) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) continue;
    const tryBufs = [
      Buffer.from(raw.slice(start, end), "latin1"),
      Buffer.from(raw.slice(start, end).replace(/\r?\n$/, ""), "latin1"),
    ];
    for (const buf of tryBufs) {
      const text = inflateBytes(buf);
      if (text != null) {
        out.push(text);
        break;
      }
    }
    startRe.lastIndex = end + 9;
  }
  return out.join("\n");
}

/** Decode page content streams (Flate) into PDF operator text. */
export async function pdfOperators(bytes: Uint8Array): Promise<string> {
  try {
    const doc = await PDFDocument.load(bytes);
    const parts: string[] = [];
    for (const page of doc.getPages()) {
      const decoded = decodeContents(page.node.Contents());
      if (decoded) parts.push(decoded);
    }
    if (parts.length) return parts.join("\n");

    const enumerated = (
      doc.context as { enumerateIndirectObjects?: () => Array<[unknown, unknown]> }
    ).enumerateIndirectObjects?.();
    if (enumerated) {
      for (const [, obj] of enumerated) {
        const decoded = decodeContents(obj);
        if (decoded && looksLikeOps(decoded)) parts.push(decoded);
      }
    }
    if (parts.length) return parts.join("\n");
  } catch {
    /* fall through */
  }
  return inflateByStreamKeyword(bytes);
}
