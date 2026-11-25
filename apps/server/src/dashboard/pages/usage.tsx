// SPDX-License-Identifier: MIT

import type { Usage } from "@html-preview/shared";
import { MetricStrip } from "../components";
import { formatBytes, formatTime } from "../format";
import { Layout } from "../layout";

export function UsagePage({ csrf, usage }: { csrf: string; usage: Usage }) {
  const { totals, quota } = usage;
  return (
    <Layout title="Usage" csrf={csrf} active="usage">
      <div class="page-head">
        <h1>Usage</h1>
      </div>
      <MetricStrip
        items={[
          { label: "Previews", value: String(totals.previews) },
          { label: "Deployments", value: String(totals.deployments) },
          { label: "Stored", value: formatBytes(totals.storedBytes) },
          { label: "Free", value: formatBytes(quota.remainingBytes) },
        ]}
      />
      <MetricStrip
        items={[
          { label: "Max deploy", value: formatBytes(quota.maxDeployBytes) },
          { label: "Max files", value: String(quota.maxDeployFiles) },
          { label: "Instance cap", value: formatBytes(quota.maxTotalBytes) },
          { label: "Kept per preview", value: String(quota.keepDeployments) },
        ]}
      />
      <div class="box">
        <table class="table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Scopes</th>
              <th class="num">Deployments</th>
              <th class="num">Bytes</th>
              <th class="hide-sm">Last used</th>
            </tr>
          </thead>
          <tbody>
            {usage.keys.map((key) => (
              <tr>
                <td>{key.label}</td>
                <td>{key.scopes.join(", ")}</td>
                <td class="num">{key.deployments}</td>
                <td class="num">{formatBytes(key.bytes)}</td>
                <td class="mono hide-sm">{formatTime(key.lastUsedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
