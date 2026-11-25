// SPDX-License-Identifier: MIT

import type { Visibility } from "@html-preview/shared";
import type { Child } from "hono/jsx";

export function Banner({ kind, children }: { kind: "error" | "ok"; children?: Child }) {
  return (
    <div class={`banner banner-${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

const VISIBILITY_TONE: Record<Visibility, string> = {
  private: "tone-amber",
  unlisted: "tone-neutral",
  public: "tone-blue",
};

export function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  return <span class={`badge ${VISIBILITY_TONE[visibility]}`}>{visibility}</span>;
}

export function Badge({ tone, children }: { tone: string; children?: Child }) {
  return <span class={`badge tone-${tone}`}>{children}</span>;
}

export function GenericIcon() {
  return (
    <svg class="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5zM2 5h12"
        fill="none"
        stroke="currentColor"
        stroke-width="1.2"
      />
    </svg>
  );
}

export interface ConfirmProps {
  id: string;
  title: string;
  /** What will happen, in plain words. */
  body: string;
  action: string;
  csrf: string;
  confirmLabel: string;
  trigger: string;
  fields?: Record<string, string>;
}

/**
 * Destructive actions open a CSS-only modal (`:target`): a centered dialog on desktop and a
 * bottom sheet on small screens. Escape closes it (dashboard.js); no native confirm().
 */
export function Confirm(props: ConfirmProps) {
  const labelId = `${props.id}-title`;
  return (
    <>
      <a class="btn btn-danger-quiet" href={`#${props.id}`}>
        {props.trigger}
      </a>
      <dialog class="modal" id={props.id} aria-modal="true" aria-labelledby={labelId}>
        <a class="backdrop" href="#close" tabindex={-1}>
          <span class="sr-only">Close</span>
        </a>
        <div class="sheet">
          <h2 id={labelId}>{props.title}</h2>
          <p>{props.body}</p>
          <form method="post" action={props.action} class="sheet-actions">
            <input type="hidden" name="_csrf" value={props.csrf} />
            {Object.entries(props.fields ?? {}).map(([name, value]) => (
              <input type="hidden" name={name} value={value} />
            ))}
            <a class="btn" href="#close">
              Cancel
            </a>
            <button type="submit" class="btn btn-danger">
              {props.confirmLabel}
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}

export function MetricStrip({ items }: { items: { label: string; value: string }[] }) {
  return (
    <p class="metrics">
      {items.map((item, index) => (
        <>
          {index > 0 ? <span class="sep">·</span> : null}
          <span class="metric">
            {item.label}: <strong class="mono">{item.value}</strong>
          </span>
        </>
      ))}
    </p>
  );
}
