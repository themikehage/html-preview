// SPDX-License-Identifier: MIT

import { Banner } from "../components";
import { Layout } from "../layout";

export function LoginPage({ token, error }: { token: string; error?: string | undefined }) {
  return (
    <Layout title="Sign in">
      <div class="login">
        <h1>Sign in</h1>
        <p class="muted">Enter the admin password of this instance.</p>
        {error ? <Banner kind="error">{error}</Banner> : null}
        <form method="post" action="/dashboard/login" class="box">
          <input type="hidden" name="_csrf" value={token} />
          <label for="password">Password</label>
          <input
            id="password"
            type="password"
            name="password"
            autocomplete="current-password"
            required
            autofocus
          />
          <p />
          <button type="submit" class="btn btn-primary">
            Sign in
          </button>
        </form>
      </div>
    </Layout>
  );
}
