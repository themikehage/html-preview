// SPDX-License-Identifier: MIT

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** `2026-11-25 08:54` in UTC: stable, sortable, no locale surprises. */
export function formatTime(iso: string | null): string {
  return iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : "—";
}

export function formatExpiry(preview: { expiresAt: string | null; pinned: boolean }): string {
  if (preview.pinned) return "pinned";
  return preview.expiresAt ? formatTime(preview.expiresAt) : "never";
}
