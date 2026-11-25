// SPDX-License-Identifier: MIT

import type { DeploymentSummary, Preview } from "@html-preview/shared";
import { GenericIcon, VisibilityBadge } from "../components";
import { formatBytes, formatExpiry, formatTime } from "../format";
import { Layout } from "../layout";

export interface PreviewRow {
  preview: Preview;
  deployment: DeploymentSummary | null;
  hasFavicon: boolean;
}

interface Props {
  csrf: string;
  rows: PreviewRow[];
  q: string;
  createdBy: string;
  labels: string[];
  nextCursor: string | null;
}

function nextHref(props: Props): string {
  const params = new URLSearchParams();
  if (props.q) params.set("q", props.q);
  if (props.createdBy) params.set("by", props.createdBy);
  if (props.nextCursor) params.set("after", props.nextCursor);
  return `/dashboard?${params.toString()}`;
}

export function PreviewsPage(props: Props) {
  const filtered = props.q !== "" || props.createdBy !== "";
  return (
    <Layout title="Previews" csrf={props.csrf} active="previews">
      <div class="page-head">
        <div class="grow">
          <h1>Previews</h1>
          <p class="muted">Pages deployed to this instance.</p>
        </div>
      </div>
      <form method="get" action="/dashboard" class="box form-row">
        <div class="field">
          <label for="q">Name</label>
          <input id="q" type="search" name="q" value={props.q} placeholder="Search by name" />
        </div>
        <div class="field">
          <label for="by">Created by</label>
          <select id="by" name="by">
            <option value="">Any key</option>
            {props.labels.map((label) => (
              <option value={label} selected={label === props.createdBy}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" class="btn">
          Filter
        </button>
        {filtered ? (
          <a class="btn btn-quiet" href="/dashboard">
            Clear
          </a>
        ) : null}
      </form>
      <p />
      {props.rows.length === 0 ? (
        <div class="box empty">
          <h2>{filtered ? "No previews match" : "No previews yet"}</h2>
          <p class="muted">
            {filtered
              ? "Try another name or clear the filter."
              : "Deploy a folder or a single page and it shows up here."}
          </p>
          {filtered ? null : <code>npx html-preview deploy ./dist</code>}
        </div>
      ) : (
        <div class="box">
          <table class="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Visibility</th>
                <th class="num hide-sm">Size</th>
                <th class="hide-sm">Updated</th>
                <th class="hide-sm">Created by</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map(({ preview, deployment, hasFavicon }) => (
                <tr>
                  <td>
                    <div class="name-cell">
                      {hasFavicon ? (
                        <img
                          class="favicon"
                          src={`/dashboard/previews/${preview.name}/favicon`}
                          alt=""
                          width="16"
                          height="16"
                          loading="lazy"
                        />
                      ) : (
                        <GenericIcon />
                      )}
                      <a href={`/dashboard/previews/${preview.name}`}>{preview.name}</a>
                    </div>
                  </td>
                  <td>
                    <VisibilityBadge visibility={preview.visibility} />
                  </td>
                  <td class="num hide-sm">{deployment ? formatBytes(deployment.bytes) : "—"}</td>
                  <td class="mono hide-sm">{formatTime(preview.updatedAt)}</td>
                  <td class="hide-sm">{preview.createdBy}</td>
                  <td class="mono">{formatExpiry(preview)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {props.nextCursor ? (
        <p>
          <a class="btn" href={nextHref(props)}>
            Next page
          </a>
        </p>
      ) : null}
    </Layout>
  );
}
