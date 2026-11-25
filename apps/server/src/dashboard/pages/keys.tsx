// SPDX-License-Identifier: MIT

import type { ApiKey } from "@html-preview/shared";
import { Banner, Confirm } from "../components";
import { formatTime } from "../format";
import { Layout } from "../layout";

interface Props {
  csrf: string;
  keys: ApiKey[];
  error?: string | undefined;
  /** The one time a secret is displayed. */
  created?: { label: string; key: string } | undefined;
}

export function KeysPage({ csrf, keys, error, created }: Props) {
  return (
    <Layout title="API keys" csrf={csrf} active="keys">
      <div class="page-head">
        <div class="grow">
          <h1>API keys</h1>
          <p class="muted">Keys identify agents. Only a hash is stored.</p>
        </div>
      </div>
      {error ? <Banner kind="error">{error}</Banner> : null}
      {created ? (
        <Banner kind="ok">
          Key "{created.label}" created. Copy it now: it is not shown again.
          <div class="secret">
            <code id="new-key">{created.key}</code>
            <button type="button" class="btn btn-small" data-copy="new-key">
              Copy
            </button>
          </div>
        </Banner>
      ) : null}
      <div class="box">
        {keys.map((key) => (
          <div class="row">
            <div class="grow">
              <strong>{key.label}</strong>
              <div class="muted">
                {key.scopes.join(", ")} · created{" "}
                <span class="mono">{formatTime(key.createdAt)}</span> · last used{" "}
                <span class="mono">{formatTime(key.lastUsedAt)}</span>
              </div>
            </div>
            <Confirm
              id={`revoke-${key.id}`}
              title={`Revoke "${key.label}"?`}
              body="Anything using this key stops working immediately. This cannot be undone."
              action={`/dashboard/keys/${key.id}/revoke`}
              csrf={csrf}
              trigger="Revoke"
              confirmLabel="Revoke key"
            />
          </div>
        ))}
      </div>
      <section>
        <h2>Create a key</h2>
        <form method="post" action="/dashboard/keys" class="box form-row">
          <input type="hidden" name="_csrf" value={csrf} />
          <div class="field">
            <label for="label">Label</label>
            <input
              id="label"
              type="text"
              name="label"
              placeholder="claude-code@laptop"
              required
              maxlength={100}
            />
          </div>
          <fieldset class="field plain">
            <legend>Scopes</legend>
            <label class="check">
              <input type="checkbox" name="scopes" value="read" checked /> read
            </label>
            <label class="check">
              <input type="checkbox" name="scopes" value="deploy" checked /> deploy
            </label>
            <label class="check">
              <input type="checkbox" name="scopes" value="admin" /> admin
            </label>
          </fieldset>
          <button type="submit" class="btn btn-primary">
            Create key
          </button>
        </form>
      </section>
    </Layout>
  );
}
