// SPDX-License-Identifier: MIT

import { buildLlmsTxt } from "../apps/server/src/routes/docs/llms-txt";
import { buildOpenApi } from "../apps/server/src/routes/docs/openapi";
import { DOC_SNAPSHOT_ORIGIN, DOC_SNAPSHOT_VERSION } from "../apps/server/src/routes/docs/snapshot";

await Bun.write(
  "docs/openapi.snapshot.json",
  `${JSON.stringify(buildOpenApi({ version: DOC_SNAPSHOT_VERSION, serverUrl: DOC_SNAPSHOT_ORIGIN }), null, 2)}\n`,
);
await Bun.write("docs/llms.snapshot.txt", buildLlmsTxt(DOC_SNAPSHOT_ORIGIN));
console.log("Wrote docs/openapi.snapshot.json and docs/llms.snapshot.txt");
