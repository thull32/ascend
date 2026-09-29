const TABLE = {
  validation: [422, "validation_error"],
  unauthorized: [401, "unauthorized"],
  forbidden: [403, "forbidden"],
  not_found: [404, "not_found"],
  conflict: [409, "conflict"],
  rate_limited: [429, "rate_limited"],
  ai_upstream: [502, "ai_upstream"],
  database: [500, "database_error"],
  internal: [500, "internal_error"],
};

function to_http(error) {
  const { kind, detail } = error;
  if (!(kind in TABLE)) {
    return { status: 500, code: "internal_error", message: "internal error" };
  }
  const [status, code] = TABLE[kind];
  let message;
  if (kind === "validation" || kind === "conflict") message = detail;
  else if (kind === "unauthorized") message = "authentication required";
  else if (kind === "forbidden") message = "forbidden";
  else if (kind === "not_found") message = detail + " not found";
  else if (kind === "rate_limited") message = "rate limit exceeded: " + detail;
  else if (kind === "ai_upstream") message = "upstream AI provider error: " + detail;
  else message = "internal error";
  return { status, code, message };
}
