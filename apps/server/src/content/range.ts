// SPDX-License-Identifier: MIT

export type ByteRange = { start: number; end: number } | "invalid" | null;

export function parseRange(header: string | null, size: number): ByteRange {
  if (!header) return null;
  const match = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const [, from = "", to = ""] = match;
  if (from === "" && to === "") return "invalid";
  let start: number;
  let end: number;
  if (from === "") {
    const suffix = Number(to);
    if (suffix === 0) return "invalid";
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(from);
    end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
  }
  if (start >= size || start > end) return "invalid";
  return { start, end };
}
