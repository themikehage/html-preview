// SPDX-License-Identifier: MIT

/**
 * Hostnames are case-insensitive and cannot hold `_`, so subdomain mode cannot carry the
 * base64url ids as they are. A label is the id's 16 bytes in lowercase base32 (26 chars),
 * and a fixed deployment is `<preview>--<deployment>` (54 chars, one DNS label).
 */
const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
const ID_BYTES = 16;
const ID_LABEL_LENGTH = 26;
const DEPLOYMENT_PREFIX = "d_";

function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function fromBase32(label: string): Uint8Array | null {
  if (label.length !== ID_LABEL_LENGTH) return null;
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of label) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  // Canonical only: the leftover padding bits must be zero, so one id has one label.
  if ((value & ((1 << bits) - 1)) !== 0) return null;
  return bytes.length === ID_BYTES ? Uint8Array.from(bytes) : null;
}

export function idToLabel(id: string): string | null {
  const bytes = Buffer.from(id, "base64url");
  return bytes.length === ID_BYTES ? toBase32(bytes) : null;
}

export function labelToId(label: string): string | null {
  const bytes = fromBase32(label);
  return bytes ? Buffer.from(bytes).toString("base64url") : null;
}

export function deploymentToLabel(deploymentId: string): string | null {
  return deploymentId.startsWith(DEPLOYMENT_PREFIX)
    ? idToLabel(deploymentId.slice(DEPLOYMENT_PREFIX.length))
    : null;
}

export function labelToDeployment(label: string): string | null {
  const id = labelToId(label);
  return id ? `${DEPLOYMENT_PREFIX}${id}` : null;
}

export interface HostTarget {
  /** Id (decoded) or alias name to look up. */
  keys: string[];
  /** Deployment id when the host pins one. */
  deploymentId: string | null;
}

/** `<label>` of `<label>.<contentHost>`, or null when the host is not a preview host. */
export function targetFromHost(host: string, contentHost: string): HostTarget | null {
  const suffix = `.${contentHost}`;
  if (!host.endsWith(suffix)) return null;
  const label = host.slice(0, -suffix.length);
  if (label === "" || label.includes(".")) return null;
  const pinned = label.split("--");
  if (pinned.length === 2 && pinned[0] && pinned[1]) {
    const id = labelToId(pinned[0]);
    const deploymentId = labelToDeployment(pinned[1]);
    if (id && deploymentId) return { keys: [id], deploymentId };
  }
  const id = labelToId(label);
  return { keys: id ? [id, label] : [label], deploymentId: null };
}
