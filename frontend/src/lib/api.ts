/**
 * Typed fetch wrapper.
 *
 * - Throws `ApiError` on non-2xx.
 * - Validates response shape via Zod (when caller provides a schema).
 * - Sends cookies on every request (admin session lives in httpOnly cookie).
 */

import type { z } from "zod";
import { apiBase } from "./platform";

// Web build: same-origin "" (Vite proxy / nginx).
// Native (Capacitor APK): absolute Cloudflare URL — see platform.ts.

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

interface RequestOpts<S extends z.ZodTypeAny | undefined> {
  method?: Method;
  path: string;
  body?: unknown;
  formData?: FormData;
  schema?: S;
  signal?: AbortSignal;
}

export async function api<S extends z.ZodTypeAny | undefined>(
  opts: RequestOpts<S>
): Promise<S extends z.ZodTypeAny ? z.infer<S> : unknown> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;

  if (opts.formData) {
    body = opts.formData;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(`${apiBase()}${opts.path}`, {
    method: opts.method ?? "GET",
    headers,
    body,
    credentials: "include",
    signal: opts.signal,
  });

  if (!res.ok) {
    let detail: unknown = undefined;
    try {
      detail = await res.json();
    } catch {
      /* not json */
    }
    const message =
      (detail && typeof detail === "object" && "detail" in detail
        ? String((detail as { detail: unknown }).detail)
        : res.statusText) || `HTTP ${res.status}`;
    throw new ApiError(res.status, message, detail);
  }

  if (res.status === 204) {
    return undefined as never;
  }

  const json = await res.json();
  if (opts.schema) {
    return opts.schema.parse(json);
  }
  return json;
}
