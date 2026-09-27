// Single seam between the UI and the backend.
//
// * Every mutating request carries `X-Requested-With`, which the server's
//   CSRF middleware requires (a cross-origin page cannot set it).
// * Errors are normalised to `ApiError` with the server's machine code so
//   components can branch (`e.code === "rate_limited"`) without string-matching.
// * SSE streams are consumed with `fetch` + a manual parser rather than
//   `EventSource`, because `EventSource` cannot POST a JSON body.
import type { ApiErrorBody } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    /** Seconds the server asked us to wait (429 `Retry-After`), if any. */
    public retryAfter?: number,
  ) {
    super(message);
  }
}

function retryAfterSeconds(res: Response): number | undefined {
  const v = Number(res.headers.get("retry-after"));
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

/** Transient failures worth retrying: throttling, server errors, network. */
export function isTransient(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  return err.status === 429 || err.status >= 500;
}

const BASE = "/api";

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = { "X-Requested-With": "fetch", Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
    signal,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data ?? {}) as Partial<ApiErrorBody>;
    throw new ApiError(res.status, err.code ?? "http_error", err.message ?? `HTTP ${res.status}`, retryAfterSeconds(res));
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>("GET", path, undefined, signal),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
  delete: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
};

export interface SseHandlers {
  onDelta: (text: string) => void;
  onDone?: (info: { input_tokens: number; output_tokens: number; stop_reason: string | null }) => void;
  onError?: (message: string) => void;
}

/** POST a JSON body and consume the Server-Sent Events reply. */
export async function streamPost(path: string, body: unknown, handlers: SseHandlers, signal?: AbortSignal): Promise<void> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "fetch", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    credentials: "same-origin",
    signal,
  });
  if (!res.ok || !res.body) {
    let err: Partial<ApiErrorBody> = {};
    try {
      err = (await res.json()) as ApiErrorBody;
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, err.code ?? "http_error", err.message ?? `HTTP ${res.status}`, retryAfterSeconds(res));
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "message";
  let data: string[] = [];
  const dispatch = () => {
    if (data.length === 0) return;
    const payload = data.join("\n");
    data = [];
    if (event === "delta") handlers.onDelta(payload);
    else if (event === "done") {
      try {
        handlers.onDone?.(JSON.parse(payload));
      } catch {
        handlers.onDone?.({ input_tokens: 0, output_tokens: 0, stop_reason: null });
      }
    } else if (event === "error") handlers.onError?.(payload);
    event = "message";
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, "");
      buffer = buffer.slice(idx + 1);
      if (line === "") dispatch();
      else if (line.startsWith(":")) continue;
      else if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
  }
  dispatch();
}
