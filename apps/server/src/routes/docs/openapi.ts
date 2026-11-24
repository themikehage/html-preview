// SPDX-License-Identifier: MIT

import { ErrorBody, OPERATIONS, type Operation } from "@html-preview/shared";
import type { ZodObject, ZodRawShape, ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

type Json = Record<string, unknown>;

function schemaOf(schema: ZodTypeAny): Json {
  const { $schema: _ignored, ...rest } = zodToJsonSchema(schema, {
    target: "openApi3",
    $refStrategy: "none",
  }) as Json;
  return rest;
}

function parameters(location: "path" | "query", shape: ZodObject<ZodRawShape>): Json[] {
  return Object.entries(shape.shape).map(([name, field]) => ({
    name,
    in: location,
    required: location === "path" || !field.isOptional(),
    schema: schemaOf(field),
  }));
}

function operationOf(operation: Operation): Json {
  const params = [
    ...(operation.params ? parameters("path", operation.params) : []),
    ...(operation.query ? parameters("query", operation.query) : []),
  ];
  const responses: Record<string, Json> = {};
  for (const response of operation.responses) {
    responses[String(response.status)] = {
      description: response.description,
      ...(response.schema
        ? { content: { "application/json": { schema: schemaOf(response.schema) } } }
        : {}),
    };
  }
  if (operation.scope) {
    responses["401"] = { $ref: "#/components/responses/Unauthorized" };
    responses["403"] = { $ref: "#/components/responses/Forbidden" };
    responses["429"] = { $ref: "#/components/responses/RateLimited" };
  }
  responses.default = { $ref: "#/components/responses/Error" };
  let requestBody: Json | undefined;
  if (operation.json) {
    requestBody = {
      required: true,
      content: { "application/json": { schema: schemaOf(operation.json) } },
    };
  } else if (operation.raw) {
    requestBody = {
      required: true,
      content: Object.fromEntries(
        Object.entries(operation.raw).map(([type, description]) => [
          type,
          { schema: { type: "string", format: "binary", description } },
        ]),
      ),
    };
  }
  return {
    operationId: operation.id,
    summary: operation.summary,
    ...(operation.scope ? { security: [{ bearer: [] }], "x-required-scope": operation.scope } : {}),
    ...(params.length ? { parameters: params } : {}),
    ...(requestBody ? { requestBody } : {}),
    responses,
  };
}

export function buildOpenApi(info: { version: string; serverUrl: string }): Json {
  const paths: Record<string, Record<string, Json>> = {};
  for (const operation of OPERATIONS) {
    const entry = paths[operation.path] ?? {};
    entry[operation.method] = operationOf(operation);
    paths[operation.path] = entry;
  }
  const error = (description: string): Json => ({
    description,
    content: { "application/json": { schema: schemaOf(ErrorBody) } },
  });
  return {
    openapi: "3.0.3",
    info: {
      title: "html-preview API",
      version: info.version,
      description:
        "Deploy static HTML previews and get a stable URL. Generated from the same Zod schemas as the server.",
    },
    servers: [{ url: info.serverUrl }],
    paths,
    components: {
      securitySchemes: {
        bearer: { type: "http", scheme: "bearer", description: "API key (hp_…)" },
      },
      responses: {
        Error: error("Error with a stable code and a fix hint"),
        Unauthorized: error("UNAUTHORIZED: missing or invalid API key"),
        Forbidden: error("INSUFFICIENT_SCOPE: the key lacks the required scope"),
        RateLimited: error("RATE_LIMITED: wait Retry-After seconds"),
      },
    },
  };
}
