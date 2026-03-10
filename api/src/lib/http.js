export function setNoCacheHeaders(reply) {
  reply.header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  reply.header("Pragma", "no-cache");
  reply.header("Expires", "0");
}

export function sendMigrationRequired(reply, error, fallbackMessage = "DB migration required.", {
  includeDetails = false
} = {}) {
  if (error?.code !== "MIGRATION_REQUIRED") {
    return false;
  }

  reply.status(409).send({
    code: "MIGRATION_REQUIRED",
    message: String(error?.message || fallbackMessage).trim() || fallbackMessage,
    details: includeDetails && error?.details && typeof error.details === "object"
      ? error.details
      : undefined
  });
  return true;
}
