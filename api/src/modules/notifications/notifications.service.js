import pool from "../../config/db.js";
import { parsePositiveInteger } from "../../lib/number.js";

const MAX_NOTIFICATIONS_LIMIT = 200;
const MAX_OUTBOX_BATCH_LIMIT = 1000;
const MAX_OUTBOX_RETENTION_DAYS = 3650;
const MAX_OUTBOX_RETRY_DELAY_SECONDS = 86400;
const MAX_OUTBOX_MAX_RETRIES = 100;
const ALL_TARGET_ROLE = "all";

function normalizePositiveInteger(value) {
  const parsed = parsePositiveInteger(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeRoleLabel(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeTargetUserIds(value) {
  const source = Array.isArray(value) ? value : [];
  return Array.from(
    new Set(
      source
        .map((item) => normalizePositiveInteger(item))
        .filter((item) => item > 0)
    )
  );
}

function normalizeTargetRoles(value) {
  const source = Array.isArray(value) ? value : [];
  return Array.from(
    new Set(
      source
        .map((item) => normalizeRoleLabel(item))
        .filter((item) => item.length > 0)
    )
  );
}

function normalizeNotificationLimit(value) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 50;
  }
  return Math.min(parsed, MAX_NOTIFICATIONS_LIMIT);
}

function normalizeOutboxBatchLimit(value, fallback = 100) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, MAX_OUTBOX_BATCH_LIMIT);
}

function normalizeOutboxRetentionDays(value, fallback = 30) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.min(parsed, MAX_OUTBOX_RETENTION_DAYS);
}

function normalizeOutboxRetryDelaySeconds(value, fallback = 30) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, MAX_OUTBOX_RETRY_DELAY_SECONDS);
}

function normalizeOutboxMaxRetries(value, fallback = 5) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.min(parsed, MAX_OUTBOX_MAX_RETRIES);
}

function toNotificationItem(row) {
  return {
    id: String(row?.id || "").trim(),
    organizationId: String(row?.organization_id || "").trim(),
    userId: String(row?.user_id || "").trim(),
    sourceUserId: row?.source_user_id == null ? "" : String(row.source_user_id),
    eventType: String(row?.event_type || "").trim().toLowerCase(),
    message: String(row?.message || "").trim(),
    payload: row?.payload && typeof row.payload === "object" ? row.payload : {},
    isRead: Boolean(row?.is_read),
    readAt: row?.read_at || null,
    createdAt: row?.created_at || null
  };
}

export function isNotificationsSchemaMissing(error) {
  if (error?.code !== "42P01") {
    return false;
  }
  const message = String(error?.message || "").trim().toLowerCase();
  return message.includes("user_notifications") || message.includes("outbox_events");
}

function isOutboxRetryColumnMissing(error) {
  if (error?.code !== "42703") {
    return false;
  }
  const message = String(error?.message || "").trim().toLowerCase();
  return message.includes("retry_count")
    || message.includes("max_retries")
    || message.includes("next_retry_at");
}

async function selectUserIdsByRoleLabel({
  organizationId,
  roleLabel,
  db = pool
}) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId);
  const normalizedLabel = String(roleLabel || "").trim().toLowerCase();
  if (!normalizedOrganizationId || !normalizedLabel) {
    return [];
  }

  const { rows } = await db.query(
    `SELECT u.id
       FROM users u
       JOIN role_options r ON r.id = u.role_id
      WHERE u.organization_id = $1
        AND r.is_active = TRUE
        AND LOWER(TRIM(r.label)) = $2`,
    [normalizedOrganizationId, normalizedLabel]
  );
  return (rows || [])
    .map((row) => normalizePositiveInteger(row?.id))
    .filter((id) => id > 0);
}

async function selectAllUserIdsByOrganization({
  organizationId,
  db = pool
}) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId);
  if (!normalizedOrganizationId) {
    return [];
  }

  const { rows } = await db.query(
    `SELECT id
       FROM users
      WHERE organization_id = $1`,
    [normalizedOrganizationId]
  );
  return (rows || [])
    .map((row) => normalizePositiveInteger(row?.id))
    .filter((id) => id > 0);
}

async function selectExistingOrganizationUserIds({
  organizationId,
  userIds,
  db = pool
}) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId);
  const normalizedUserIds = normalizeTargetUserIds(userIds);
  if (!normalizedOrganizationId || normalizedUserIds.length === 0) {
    return [];
  }

  const { rows } = await db.query(
    `SELECT id
       FROM users
      WHERE organization_id = $1
        AND id = ANY($2::integer[])`,
    [normalizedOrganizationId, normalizedUserIds]
  );
  return (rows || [])
    .map((row) => normalizePositiveInteger(row?.id))
    .filter((id) => id > 0);
}

export async function resolveNotificationRecipientIds({
  organizationId,
  targetUserIds = [],
  targetRoles = [],
  excludeUserId = 0,
  db = pool
}) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId);
  if (!normalizedOrganizationId) {
    return [];
  }

  const normalizedTargetUserIds = normalizeTargetUserIds(targetUserIds);
  const normalizedTargetRoles = normalizeTargetRoles(targetRoles);
  const shouldIncludeAllUsers = normalizedTargetRoles.includes(ALL_TARGET_ROLE);
  const customRoles = normalizedTargetRoles.filter((r) => r !== ALL_TARGET_ROLE);

  let allUserIds = [];
  if (shouldIncludeAllUsers) {
    allUserIds = await selectAllUserIdsByOrganization({
      organizationId: normalizedOrganizationId,
      db
    });
  }

  const roleUserIds = [];
  for (const roleLabel of customRoles) {
    const ids = await selectUserIdsByRoleLabel({
      organizationId: normalizedOrganizationId,
      roleLabel,
      db
    });
    roleUserIds.push(...ids);
  }

  const candidateUserIds = Array.from(
    new Set([...normalizedTargetUserIds, ...allUserIds, ...roleUserIds])
  );
  if (candidateUserIds.length === 0) {
    return [];
  }

  const existingUserIds = await selectExistingOrganizationUserIds({
    organizationId: normalizedOrganizationId,
    userIds: candidateUserIds,
    db
  });
  if (existingUserIds.length === 0) {
    return [];
  }

  const excludedUserId = normalizePositiveInteger(excludeUserId);
  return existingUserIds.filter((userId) => !excludedUserId || userId !== excludedUserId);
}

export async function insertUserNotifications({
  organizationId,
  recipientUserIds,
  sourceUserId = 0,
  eventType = "",
  message = "",
  payload = {},
  db = pool
}) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId);
  const normalizedRecipientUserIds = normalizeTargetUserIds(recipientUserIds);
  const normalizedEventType = String(eventType || "").trim().toLowerCase();
  const normalizedMessage = String(message || "").trim();
  if (
    !normalizedOrganizationId
    || normalizedRecipientUserIds.length === 0
    || !normalizedEventType
    || !normalizedMessage
  ) {
    return [];
  }

  const normalizedSourceUserId = normalizePositiveInteger(sourceUserId) || null;
  const payloadJson = JSON.stringify(payload && typeof payload === "object" ? payload : {});
  const { rows } = await db.query(
    `WITH recipients AS (
       SELECT DISTINCT UNNEST($2::integer[]) AS user_id
     )
     INSERT INTO user_notifications (
       organization_id,
       user_id,
       source_user_id,
       event_type,
       message,
       payload
     )
     SELECT
       $1,
       r.user_id,
       $3::integer,
       $4,
       $5,
       $6::jsonb
     FROM recipients r
     RETURNING id`,
    [
      normalizedOrganizationId,
      normalizedRecipientUserIds,
      normalizedSourceUserId,
      normalizedEventType,
      normalizedMessage,
      payloadJson
    ]
  );
  return (rows || [])
    .map((row) => normalizePositiveInteger(row?.id))
    .filter((id) => id > 0);
}

export async function insertOutboxEvent({
  organizationId,
  eventType = "",
  aggregateType = "appointment",
  aggregateId = "",
  payload = {},
  maxRetries = 5,
  createdBy = 0,
  db = pool
}) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId);
  const normalizedEventType = String(eventType || "").trim().toLowerCase();
  const normalizedAggregateType = String(aggregateType || "").trim().toLowerCase();
  if (!normalizedOrganizationId || !normalizedEventType || !normalizedAggregateType) {
    return 0;
  }

  const payloadJson = JSON.stringify(payload && typeof payload === "object" ? payload : {});
  const normalizedCreatedBy = normalizePositiveInteger(createdBy) || null;
  const normalizedAggregateId = String(aggregateId || "").trim() || null;
  const normalizedMaxRetries = normalizeOutboxMaxRetries(maxRetries, 5);

  try {
    const { rows } = await db.query(
      `INSERT INTO outbox_events (
         organization_id,
         event_type,
         aggregate_type,
         aggregate_id,
         payload,
         max_retries,
         created_by
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
       RETURNING id`,
      [
        normalizedOrganizationId,
        normalizedEventType,
        normalizedAggregateType,
        normalizedAggregateId,
        payloadJson,
        normalizedMaxRetries,
        normalizedCreatedBy
      ]
    );
    return normalizePositiveInteger(rows?.[0]?.id);
  } catch (error) {
    if (!isOutboxRetryColumnMissing(error)) {
      throw error;
    }

    const { rows } = await db.query(
      `INSERT INTO outbox_events (
         organization_id,
         event_type,
         aggregate_type,
         aggregate_id,
         payload,
         created_by
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6)
       RETURNING id`,
      [
        normalizedOrganizationId,
        normalizedEventType,
        normalizedAggregateType,
        normalizedAggregateId,
        payloadJson,
        normalizedCreatedBy
      ]
    );
    return normalizePositiveInteger(rows?.[0]?.id);
  }
}

export async function processPendingOutboxEvents({
  limit = 100,
  retryDelaySeconds = 30,
  processor = null,
  db = pool
}) {
  const normalizedLimit = normalizeOutboxBatchLimit(limit, 100);
  const normalizedRetryDelaySeconds = normalizeOutboxRetryDelaySeconds(retryDelaySeconds, 30);
  let supportsRetryColumns = true;
  let rows = [];
  try {
    const result = await db.query(
      `SELECT id, organization_id, event_type, aggregate_type, aggregate_id, payload, retry_count, max_retries
         FROM outbox_events
        WHERE status = 'pending'
          AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP)
        ORDER BY created_at ASC, id ASC
        LIMIT $1`,
      [normalizedLimit]
    );
    rows = Array.isArray(result?.rows) ? result.rows : [];
  } catch (error) {
    if (!isOutboxRetryColumnMissing(error)) {
      throw error;
    }

    supportsRetryColumns = false;
    const result = await db.query(
      `SELECT id, organization_id, event_type, aggregate_type, aggregate_id, payload
         FROM outbox_events
        WHERE status = 'pending'
        ORDER BY created_at ASC, id ASC
        LIMIT $1`,
      [normalizedLimit]
    );
    rows = Array.isArray(result?.rows) ? result.rows : [];
  }

  let processedCount = 0;
  let requeuedCount = 0;
  let failedCount = 0;

  for (const row of rows || []) {
    const outboxEventId = normalizePositiveInteger(row?.id);
    if (!outboxEventId) {
      continue;
    }

    try {
      const eventType = String(row?.event_type || "").trim().toLowerCase();
      const aggregateType = String(row?.aggregate_type || "").trim().toLowerCase();
      if (!eventType || !aggregateType) {
        throw new Error("Invalid outbox event payload.");
      }
      const normalizedProcessor = typeof processor === "function" ? processor : null;
      if (normalizedProcessor) {
        await normalizedProcessor({
          id: outboxEventId,
          organizationId: normalizePositiveInteger(row?.organization_id),
          eventType,
          aggregateType,
          aggregateId: String(row?.aggregate_id || "").trim(),
          payload: row?.payload && typeof row.payload === "object" ? row.payload : {}
        });
      }

      const updateResult = supportsRetryColumns
        ? await db.query(
          `UPDATE outbox_events
              SET status = 'sent',
                  error_message = NULL,
                  next_retry_at = NULL,
                  processed_at = CURRENT_TIMESTAMP
            WHERE id = $1
              AND status = 'pending'`,
          [outboxEventId]
        )
        : await db.query(
          `UPDATE outbox_events
              SET status = 'sent',
                  error_message = NULL,
                  processed_at = CURRENT_TIMESTAMP
            WHERE id = $1
              AND status = 'pending'`,
          [outboxEventId]
        );
      processedCount += updateResult?.rowCount || 0;
    } catch (error) {
      const errorMessage = String(error?.message || "Outbox processing failed.")
        .trim()
        .slice(0, 2048);
      if (!supportsRetryColumns) {
        const updateResult = await db.query(
          `UPDATE outbox_events
              SET status = 'failed',
                  error_message = $2,
                  processed_at = CURRENT_TIMESTAMP
            WHERE id = $1
              AND status = 'pending'`,
          [outboxEventId, errorMessage || "Outbox processing failed."]
        );
        failedCount += updateResult?.rowCount || 0;
        continue;
      }

      const currentRetryCount = Math.max(
        0,
        Number.parseInt(String(row?.retry_count ?? 0).trim(), 10) || 0
      );
      const maxRetries = normalizeOutboxMaxRetries(row?.max_retries, 5);
      const nextRetryCount = currentRetryCount + 1;

      if (nextRetryCount > maxRetries) {
        const updateResult = await db.query(
          `UPDATE outbox_events
              SET status = 'failed',
                  retry_count = $2,
                  error_message = $3,
                  next_retry_at = NULL,
                  processed_at = CURRENT_TIMESTAMP
            WHERE id = $1
              AND status = 'pending'`,
          [outboxEventId, nextRetryCount, errorMessage || "Outbox processing failed."]
        );
        failedCount += updateResult?.rowCount || 0;
      } else {
        const updateResult = await db.query(
          `UPDATE outbox_events
              SET status = 'pending',
                  retry_count = $2,
                  error_message = $3,
                  next_retry_at = CURRENT_TIMESTAMP + ($4::integer * INTERVAL '1 second'),
                  processed_at = NULL
            WHERE id = $1
              AND status = 'pending'`,
          [
            outboxEventId,
            nextRetryCount,
            errorMessage || "Outbox processing failed.",
            normalizedRetryDelaySeconds
          ]
        );
        requeuedCount += updateResult?.rowCount || 0;
      }
    }
  }

  return {
    fetchedCount: Array.isArray(rows) ? rows.length : 0,
    processedCount,
    requeuedCount,
    failedCount
  };
}

export async function pruneProcessedOutboxEvents({
  retentionDays = 30,
  limit = 500,
  db = pool
}) {
  const normalizedRetentionDays = normalizeOutboxRetentionDays(retentionDays, 30);
  if (normalizedRetentionDays <= 0) {
    return { deletedCount: 0 };
  }

  const normalizedLimit = normalizeOutboxBatchLimit(limit, 500);
  const { rowCount } = await db.query(
    `WITH deletable AS (
       SELECT id
         FROM outbox_events
        WHERE status IN ('sent', 'failed')
          AND processed_at IS NOT NULL
          AND processed_at < (CURRENT_TIMESTAMP - ($1::integer * INTERVAL '1 day'))
        ORDER BY processed_at ASC, id ASC
        LIMIT $2
     )
     DELETE FROM outbox_events o
     USING deletable d
     WHERE o.id = d.id`,
    [normalizedRetentionDays, normalizedLimit]
  );

  return {
    deletedCount: rowCount || 0
  };
}

export async function persistNotificationEvent({
  organizationId,
  sourceUserId = 0,
  eventType = "",
  message = "",
  targetUserIds = [],
  targetRoles = [],
  payload = {},
  aggregateType = "appointment",
  aggregateId = ""
}) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId);
  const normalizedSourceUserId = normalizePositiveInteger(sourceUserId);
  const normalizedEventType = String(eventType || "").trim().toLowerCase();
  const normalizedMessage = String(message || "").trim();
  if (!normalizedOrganizationId || !normalizedEventType || !normalizedMessage) {
    return {
      recipientUserIds: [],
      notificationIds: [],
      outboxEventId: 0
    };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const recipientUserIds = await resolveNotificationRecipientIds({
      organizationId: normalizedOrganizationId,
      targetUserIds,
      targetRoles,
      excludeUserId: normalizedSourceUserId,
      db: client
    });

    if (recipientUserIds.length === 0) {
      await client.query("COMMIT");
      return {
        recipientUserIds: [],
        notificationIds: [],
        outboxEventId: 0
      };
    }

    const fullPayload = {
      organizationId: normalizedOrganizationId,
      sourceUserId: normalizedSourceUserId || null,
      eventType: normalizedEventType,
      message: normalizedMessage,
      targetUserIds: recipientUserIds,
      data: payload && typeof payload === "object" ? payload : {},
      timestamp: new Date().toISOString()
    };

    const notificationIds = await insertUserNotifications({
      organizationId: normalizedOrganizationId,
      recipientUserIds,
      sourceUserId: normalizedSourceUserId,
      eventType: normalizedEventType,
      message: normalizedMessage,
      payload: fullPayload,
      db: client
    });
    const outboxEventId = await insertOutboxEvent({
      organizationId: normalizedOrganizationId,
      eventType: normalizedEventType,
      aggregateType,
      aggregateId,
      payload: fullPayload,
      createdBy: normalizedSourceUserId,
      db: client
    });

    await client.query("COMMIT");
    return {
      recipientUserIds,
      notificationIds,
      outboxEventId
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function listUserNotifications({
  organizationId,
  userId,
  unreadOnly = false,
  limit = 50
}) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId);
  const normalizedUserId = normalizePositiveInteger(userId);
  if (!normalizedOrganizationId || !normalizedUserId) {
    return [];
  }

  const normalizedLimit = normalizeNotificationLimit(limit);
  const whereParts = [
    "organization_id = $1",
    "user_id = $2"
  ];
  if (Boolean(unreadOnly)) {
    whereParts.push("is_read = FALSE");
  }

  const { rows } = await pool.query(
    `SELECT
       id,
       organization_id,
       user_id,
       source_user_id,
       event_type,
       message,
       payload,
       is_read,
       read_at,
       created_at
      FROM user_notifications
      WHERE ${whereParts.join("\n        AND ")}
      ORDER BY created_at DESC, id DESC
      LIMIT $3`,
    [normalizedOrganizationId, normalizedUserId, normalizedLimit]
  );

  return (rows || []).map(toNotificationItem);
}

export async function markAllUserNotificationsRead({
  organizationId,
  userId
}) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId);
  const normalizedUserId = normalizePositiveInteger(userId);
  if (!normalizedOrganizationId || !normalizedUserId) {
    return 0;
  }

  const { rowCount } = await pool.query(
    `UPDATE user_notifications
        SET is_read = TRUE,
            read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
      WHERE organization_id = $1
        AND user_id = $2
        AND is_read = FALSE`,
    [normalizedOrganizationId, normalizedUserId]
  );
  return rowCount || 0;
}

export async function clearAllUserNotifications({
  organizationId,
  userId
}) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId);
  const normalizedUserId = normalizePositiveInteger(userId);
  if (!normalizedOrganizationId || !normalizedUserId) {
    return 0;
  }

  const { rowCount } = await pool.query(
    `DELETE FROM user_notifications
      WHERE organization_id = $1
        AND user_id = $2`,
    [normalizedOrganizationId, normalizedUserId]
  );
  return rowCount || 0;
}
