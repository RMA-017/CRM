export const MIN_NOTIFICATION_RETENTION_DAYS = 0;
export const MAX_NOTIFICATION_RETENTION_DAYS = 3650;

export function getNotificationRetentionDaysMessage() {
  return `Retention days must be an integer between ${MIN_NOTIFICATION_RETENTION_DAYS} and ${MAX_NOTIFICATION_RETENTION_DAYS}.`;
}

export function parseNotificationRetentionDays(value, field) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (
    !Number.isInteger(parsed)
    || parsed < MIN_NOTIFICATION_RETENTION_DAYS
    || parsed > MAX_NOTIFICATION_RETENTION_DAYS
  ) {
    return {
      error: {
        field,
        message: getNotificationRetentionDaysMessage()
      }
    };
  }

  return { value: parsed };
}
