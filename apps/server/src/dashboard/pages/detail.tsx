// SPDX-License-Identifier: MIT

import type { DeploymentSummary, Preview, Visibility } from "@html-preview/shared";
import { MAX_ACTIVE_LINKS } from "@html-preview/shared";
import type { StoredLink } from "../../core/ports/link-repo.port";
import { isLinkActive } from "../../domain/links";
import { Badge, Banner, Confirm, VisibilityBadge } from "../components";
import { formatBytes, formatTime } from "../format";
import { Layout } from "../layout";

export interface DetailProps {
  csrf: string;
  preview: Preview;
  /** What is enforced after the MAX_VISIBILITY ceiling. */
  effective: Visibility;
  allowed: Visibility[];
  deployments: DeploymentSummary[];
  links: StoredLink[];
  now: Date;
  /** Iframe URL (with a 60 s ticket when private); null when there is nothing to show. */
  frameSrc: string | null;
  error?: string | undefined;
  notice?: string | undefined;
  createdLink?: { url: string; label: string | null } | undefined;
}

function Header({ preview, effective }: Pick<DetailProps, "preview" | "effective">) {
  const name = preview.name;
  return (
    <div class="page-head">
      <div class="grow">
        <p class="muted">
          <a href="/dashboard">Previews</a> / {name}
        </p>
        <h1>{name}</h1>
        <p>
          <VisibilityBadge visibility={effective} />{" "}
          {effective !== preview.visibility ? (
            <Badge tone="amber">limited by MAX_VISIBILITY</Badge>
          ) : null}{" "}
          {preview.pinned ? <Badge tone="green">pinned</Badge> : null}
        </p>
      </div>
      <a
        class="btn"
        href={`/dashboard/previews/${name}/open`}
        target="_blank"
        rel="noreferrer noopener"
      >
        Open in new tab
      </a>
    </div>
  );
}

function Deployments({ props }: { props: DetailProps }) {
  const { preview, deployments, csrf } = props;
  return (
    <section>
      <h2>Deployments</h2>
      <div class="box">
        {deployments.map((deployment) => {
          const current = deployment.id === preview.currentDeploymentId;
          return (
            <div class="row">
              <div class="grow">
                <span class="mono">{deployment.id}</span>{" "}
                {current ? <Badge tone="green">current</Badge> : null}
                <div class="muted">
                  <span class="mono">{formatTime(deployment.createdAt)}</span> ·{" "}
                  {deployment.fileCount} files ·{" "}
                  <span class="mono">{formatBytes(deployment.bytes)}</span> · {deployment.createdBy}
                  {deployment.message ? ` · ${deployment.message}` : ""}
                </div>
              </div>
              <a
                class="btn btn-small"
                href={`/dashboard/previews/${preview.name}/open?deployment=${deployment.id}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                View
              </a>
              {current ? null : (
                <form method="post" action={`/dashboard/previews/${preview.name}/rollback`}>
                  <input type="hidden" name="_csrf" value={csrf} />
                  <input type="hidden" name="deploymentId" value={deployment.id} />
                  <button type="submit" class="btn btn-small">
                    Roll back to this
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Settings({ props }: { props: DetailProps }) {
  const { preview, csrf, allowed } = props;
  return (
    <section>
      <h2>Settings</h2>
      <form
        method="post"
        action={`/dashboard/previews/${preview.name}/settings`}
        class="box form-row"
      >
        <input type="hidden" name="_csrf" value={csrf} />
        <div class="field">
          <label for="visibility">Visibility</label>
          <select id="visibility" name="visibility">
            {allowed.map((value) => (
              <option value={value} selected={value === preview.visibility}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="ttl">Hours until expiry (0 = never)</label>
          <input id="ttl" type="number" name="ttl" min="0" max="87600" placeholder="unchanged" />
        </div>
        <label class="check">
          <input type="checkbox" name="pinned" value="1" checked={preview.pinned} /> Pinned
        </label>
        <button type="submit" class="btn btn-primary">
          Save
        </button>
      </form>
      <p class="muted">
        Expires{" "}
        <span class="mono">
          {preview.pinned ? "never (pinned)" : formatTime(preview.expiresAt)}
        </span>
        . Making a preview public or unlisted revokes its share links.
      </p>
    </section>
  );
}

function ShareLinks({ props }: { props: DetailProps }) {
  const { preview, links, csrf, effective, now, createdLink } = props;
  if (effective !== "private") {
    return (
      <section>
        <h2>Share links</h2>
        <p class="muted">
          Share links are for private previews. This one is reachable by its URL; set visibility to
          private in Settings to restrict it.
        </p>
      </section>
    );
  }
  const active = links.filter((link) => isLinkActive(link, now)).length;
  return (
    <section>
      <h2>Share links</h2>
      {createdLink ? (
        <Banner kind="ok">
          Link created. Copy it now: the URL is not shown again.
          <div class="secret">
            <code id="new-link">{createdLink.url}</code>
            <button type="button" class="btn btn-small" data-copy="new-link">
              Copy
            </button>
          </div>
        </Banner>
      ) : null}
      <div class="box">
        {links.length === 0 ? <div class="row muted">No links yet.</div> : null}
        {links.map((link) => {
          const live = isLinkActive(link, now);
          return (
            <div class="row">
              <div class="grow">
                <strong>{link.label ?? "Untitled link"}</strong>{" "}
                {link.revokedAt ? (
                  <Badge tone="red">revoked</Badge>
                ) : live ? (
                  <Badge tone="green">active</Badge>
                ) : (
                  <Badge tone="amber">expired</Badge>
                )}
                <div class="muted">
                  expires <span class="mono">{formatTime(link.expiresAt)}</span> ·{" "}
                  <span class="mono">{link.accessCount}</span> opens · last{" "}
                  <span class="mono">{formatTime(link.lastAccessedAt)}</span>
                </div>
              </div>
              {live ? (
                <form
                  method="post"
                  action={`/dashboard/previews/${preview.name}/links/${link.id}/revoke`}
                >
                  <input type="hidden" name="_csrf" value={csrf} />
                  <button type="submit" class="btn btn-small btn-danger-quiet">
                    Revoke
                  </button>
                </form>
              ) : null}
            </div>
          );
        })}
      </div>
      <p />
      <form method="post" action={`/dashboard/previews/${preview.name}/links`} class="box form-row">
        <input type="hidden" name="_csrf" value={csrf} />
        <div class="field">
          <label for="link-label">Label</label>
          <input
            id="link-label"
            type="text"
            name="label"
            maxlength={100}
            placeholder="Who is it for?"
          />
        </div>
        <div class="field">
          <label for="link-hours">Expires in (hours, 1 to 720)</label>
          <input
            id="link-hours"
            type="number"
            name="expiresInHours"
            min="1"
            max="720"
            value="168"
          />
        </div>
        <button type="submit" class="btn btn-primary" disabled={active >= MAX_ACTIVE_LINKS}>
          Create link
        </button>
      </form>
      <p class="muted">
        {active} of {MAX_ACTIVE_LINKS} active links.
      </p>
    </section>
  );
}

export function DetailPage(props: DetailProps) {
  const { preview, csrf, frameSrc, error, notice } = props;
  return (
    <Layout title={preview.name} csrf={csrf} active="previews">
      <Header preview={preview} effective={props.effective} />
      {error ? <Banner kind="error">{error}</Banner> : null}
      {notice ? <Banner kind="ok">{notice}</Banner> : null}
      {frameSrc ? (
        <iframe
          class="preview-frame"
          title={`Preview of ${preview.name}`}
          src={frameSrc}
          sandbox="allow-scripts allow-forms allow-popups allow-modals"
          referrerpolicy="no-referrer"
        />
      ) : (
        <div class="box empty">
          <p class="muted">This preview has no live deployment.</p>
        </div>
      )}
      <Deployments props={props} />
      <Settings props={props} />
      <ShareLinks props={props} />
      <section>
        <h2>Delete</h2>
        <p class="muted">Removes the preview, its deployments and its share links.</p>
        <Confirm
          id="delete-preview"
          title={`Delete "${preview.name}"?`}
          body="The preview and every deployment are permanently removed and its URL stops working. This cannot be undone."
          action={`/dashboard/previews/${preview.name}/delete`}
          csrf={csrf}
          trigger="Delete preview"
          confirmLabel="Delete preview"
        />
      </section>
    </Layout>
  );
}
