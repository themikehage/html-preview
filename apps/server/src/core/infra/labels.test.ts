// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { deploymentToLabel, idToLabel, labelToId, targetFromHost } from "./labels";

describe("preview host labels", () => {
  test("ids round-trip through a lowercase DNS-safe label", () => {
    for (let i = 0; i < 200; i++) {
      const id = randomBytes(16).toString("base64url");
      const label = idToLabel(id);
      expect(label).toMatch(/^[a-z2-7]{26}$/);
      expect(labelToId(label ?? "")).toBe(id);
    }
  });

  test("non-canonical, short or foreign labels do not decode", () => {
    expect(labelToId("landing")).toBeNull();
    expect(labelToId(`${"a".repeat(25)}b`)).toBeNull(); // non-zero padding bits
    expect(labelToId("A".repeat(26))).toBeNull();
    expect(idToLabel("short")).toBeNull();
  });

  test("a host resolves to ids, aliases and pinned deployments", () => {
    const id = randomBytes(16).toString("base64url");
    const dep = `d_${randomBytes(16).toString("base64url")}`;
    const host = "p.example.com";
    expect(targetFromHost(`${idToLabel(id)}.${host}`, host)).toEqual({
      keys: [id, idToLabel(id) as string],
      deploymentId: null,
    });
    expect(targetFromHost(`${idToLabel(id)}--${deploymentToLabel(dep)}.${host}`, host)).toEqual({
      keys: [id],
      deploymentId: dep,
    });
    expect(targetFromHost(`landing.${host}`, host)).toEqual({
      keys: ["landing"],
      deploymentId: null,
    });
    expect(targetFromHost(host, host)).toBeNull();
    expect(targetFromHost(`a.b.${host}`, host)).toBeNull();
    expect(targetFromHost("other.example.org", host)).toBeNull();
  });
});
