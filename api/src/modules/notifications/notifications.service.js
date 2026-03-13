import pool from "../../config/db.js";
import { executeTransaction } from "../../lib/db-utils.js";
import { toBoundedInteger } from "../../lib/bounded-integer.js";
import {
  createMigrationRequiredError,
  getMissingNames,
  getTableColumnNames
} from "../../lib/schema-guard.js";
import {
  MANAGER_ROLE_MATCHERS,
  isManagerLikeRoleLabel,
  normalizeNotificationTargetRoles as normalizeTargetRoles,
  normalizeNotificationTargetUserIds as normalizeTargetUserIds
} from "../../lib/notification-targets.js";
import { normalizeNotificationListLimit } from "../../lib/notification-limits.js";
import { normalizePositiveInteger } from "../../lib/number.js";

const MAX_OUTBOX_BATCH_LIMIT = 1000;
const MAX_OUTBOX_RETENTION_DAYS = 3650;
const MAX_OUTBOX_RETRY_DELAY_SECONDS = 86400;
const MAX_OUTBOX_MAX_RETRIES = 100;
const ALL_TARGET_ROLE = "all";
const APPOINTMENT_SETTINGS_TABLE = "appointment_settings";
const DEFAULT_OUTBOX_RETENTION_DAYS = 30;
const DEFAULT_USER_NOTIFICATIONS_RETENTION_DAYS = 0;
let notificationRetentionColumnFlagsPromise = null;

function normalizeOutboxBatchLimit(value, fallback = 100) {
  return toBoundedInteger(value, fallback, 1, MAX_OUTBOX_BATCH_LIMIT);
}

function normalizeOutboxRetentionDays(value, fallback = 30) {
  return toBoundedInteger(value, fallback, 0, MAX_OUTBOX_RETENTION_DAYS);
}

function normalizeOutboxRetryDelaySeconds(value, fallback = 30) {
  return toBoundedInteger(value, fallback, 1, MAX_OUTBOX_RETRY_DELAY_SECONDS);
}

function normalizeOutboxClaimTtlSeconds(value, fallback = 120) {
  return toBoundedInteger(value, fallback, 5, MAX_OUTBOX_RETRY_DELAY_SECONDS);
}

function normalizeOutboxMaxRetries(value, fallback = 5) {
  return toBoundedInteger(value, fallback, 0, MAX_OUTBOX_MAX_RETRIES);
}

async function getNotificationRetentionColumnFlags({
  tableName = APPOINTMENT_SETTINGS_TABLE,
  db = pool
} = {}) {
  const loadFlags = async () => {
    const columns = await getTableColumnNames({ tableName, db });
    return {
      hasOutboxRetentionDays: columns.has("outbox_retention_days"),
      hasUserNotificationsRetentionDays: columns.has("user_notifications_retention_days")
    };
  };

  if (tableName !== APPOINTMENT_SETTINGS_TABLE) {
    return loadFlags();
  }

  if (db !== pool) {
    return loadFlags();
  }

  if (!notificationRetentionColumnFlagsPromise) {
    notificationRetentionColumnFlagsPromise = loadFlags().catch((error) => {
      notificationRetentionColumnFlagsPromise = null;
      throw error;
    });
  }

  return notificationRetentionColumnFlagsPromise;
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
  const customRoles = normalizedTargetRoles.filter((roleLabel) => roleLabel !== ALL_TARGET_ROLE);
  const includeManagerSemantic = customRoles.some((roleLabel) => isManagerLikeRoleLabel(roleLabel));
  const exactRoleLabels = customRoles.filter((roleLabel) => !isManagerLikeRoleLabel(roleLabel));
  if (
    !shouldIncludeAllUsers
    && normalizedTargetUserIds.length === 0
    && exactRoleLabels.length === 0
    && !includeManagerSemantic
  ) {
    return [];
  }

  const excludedUserId = normalizePositiveInteger(excludeUserId);
  const { rows } = await db.query(
    `SELECT DISTINCT u.id
       FROM users u
       JOIN organizations o
         ON o.id = u.organization_id
       JOIN role_options r
         ON r.id = u.role_id
        AND r.organization_id = u.organization_id
      WHERE u.organization_id = $1
        AND o.is_active = TRUE
        AND r.is_active = TRUE
        AND ($7::integer IS NULL OR u.id <> $7::integer)
        AND (
          $4::boolean = TRUE
          OR (CARDINALITY($2::integer[]) > 0 AND u.id = ANY($2::integer[]))
          OR (CARDINALITY($3::text[]) > 0 AND LOWER(TRIM(r.label)) = ANY($3::text[]))
          OR (
            $5::boolean = TRUE
            AND (
              COALESCE(r.is_admin, FALSE) = TRUE
              OR COALESCE(u.is_platform_admin, FALSE) = TRUE
              OR EXISTS (
                SELECT 1
                  FROM UNNEST($6::text[]) AS matcher(pattern)
                 WHERE LOWER(TRIM(r.label)) LIKE ('%' || matcher.pattern || '%')
              )
            )
          )
        )`,
    [
      normalizedOrganizationId,
      normalizedTargetUserIds,
      exactRoleLabels,
      shouldIncludeAllUsers,
      includeManagerSemantic,
      MANAGER_ROLE_MATCHERS,
      excludedUserId || null
    ]
  );

  return (rows || [])
    .map((row) => normalizePositiveInteger(row?.id))
    .filter((id) => id > 0);
}

async function insertUserNotifications({
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

async function insertOutboxEvent({
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

async function markOutboxEventsSent({
  eventIds,
  supportsRetryColumns = true,
  db = pool
}) {
  const normalizedEventIds = normalizeTargetUserIds(eventIds);
  if (normalizedEventIds.length === 0) {
    return 0;
  }

  const updateResult = supportsRetryColumns
    ? await db.query(
      `UPDATE outbox_events
          SET status = 'sent',
              error_message = NULL,
              next_retry_at = NULL,
              processed_at = CURRENT_TIMESTAMP
        WHERE id = ANY($1::integer[])
          AND status = 'pending'`,
      [normalizedEventIds]
    )
    : await db.query(
      `UPDATE outbox_events
          SET status = 'sent',
              error_message = NULL,
              processed_at = CURRENT_TIMESTAMP
        WHERE id = ANY($1::integer[])
          AND status = 'pending'`,
      [normalizedEventIds]
    );

  return updateResult?.rowCount || 0;
}

async function markOutboxEventsFailed({
  items,
  supportsRetryColumns = true,
  db = pool
}) {
  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: normalizePositiveInteger(item?.id),
      retryCount: normalizePositiveInteger(item?.retryCount),
      errorMessage: String(item?.errorMessage || "Outbox processing failed.")
        .trim()
        .slice(0, 2048) || "Outbox processing failed."
    }))
    .filter((item) => item.id > 0);
  if (normalizedItems.length === 0) {
    return 0;
  }

  const eventIds = normalizedItems.map((item) => item.id);
  const errorMessages = normalizedItems.map((item) => item.errorMessage);

  const updateResult = supportsRetryColumns
    ? await db.query(
      `WITH updates AS (
         SELECT *
           FROM UNNEST($1::integer[], $2::integer[], $3::text[])
                AS t(id, retry_count, error_message)
       )
       UPDATE outbox_events o
          SET status = 'failed',
              retry_count = u.retry_count,
              error_message = u.error_message,
              next_retry_at = NULL,
              processed_at = CURRENT_TIMESTAMP
         FROM updates u
        WHERE o.id = u.id
          AND o.status = 'pending'`,
      [
        eventIds,
        normalizedItems.map((item) => item.retryCount),
        errorMessages
      ]
    )
    : await db.query(
      `WITH updates AS (
         SELECT *
           FROM UNNEST($1::integer[], $2::text[])
                AS t(id, error_message)
       )
       UPDATE outbox_events o
          SET status = 'failed',
              error_message = u.error_message,
              processed_at = CURRENT_TIMESTAMP
         FROM updates u
        WHERE o.id = u.id
          AND o.status = 'pending'`,
      [eventIds, errorMessages]
    );

  return updateResult?.rowCount || 0;
}

async function requeueOutboxEvents({
  items,
  retryDelaySeconds,
  db = pool
}) {
  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: normalizePositiveInteger(item?.id),
      retryCount: normalizePositiveInteger(item?.retryCount),
      errorMessage: String(item?.errorMessage || "Outbox processing failed.")
        .trim()
        .slice(0, 2048) || "Outbox processing failed."
    }))
    .filter((item) => item.id > 0 && item.retryCount > 0);
  if (normalizedItems.length === 0) {
    return 0;
  }

  const updateResult = await db.query(
    `WITH updates AS (
       SELECT *
         FROM UNNEST($1::integer[], $2::integer[], $3::text[])
              AS t(id, retry_count, error_message)
     )
     UPDATE outbox_events o
        SET status = 'pending',
            retry_count = u.retry_count,
            error_message = u.error_message,
            next_retry_at = CURRENT_TIMESTAMP + ($4::integer * INTERVAL '1 second'),
            processed_at = NULL
       FROM updates u
      WHERE o.id = u.id
        AND o.status = 'pending'`,
    [
      normalizedItems.map((item) => item.id),
      normalizedItems.map((item) => item.retryCount),
      normalizedItems.map((item) => item.errorMessage),
      retryDelaySeconds
    ]
  );

  return updateResult?.rowCount || 0;
}

async function claimPendingOutboxEvents({
  limit = 100,
  claimTtlSeconds = 120,
  db = pool
}) {
  const normalizedLimit = normalizeOutboxBatchLimit(limit, 100);
  const normalizedClaimTtlSeconds = normalizeOutboxClaimTtlSeconds(claimTtlSeconds, 120);
  let supportsRetryColumns = true;
  let rows = [];

  try {
    const result = await db.query(
      `WITH claimable AS (
         SELECT id
           FROM outbox_events
          WHERE status = 'pending'
            AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP)
          ORDER BY created_at ASC, id ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
       )
       UPDATE outbox_events o
          SET next_retry_at = CURRENT_TIMESTAMP + ($2::integer * INTERVAL '1 second'),
              error_message = NULL
         FROM claimable c
        WHERE o.id = c.id
       RETURNING o.id, o.organization_id, o.event_type, o.aggregate_type, o.aggregate_id, o.payload, o.retry_count, o.max_retries`,
      [normalizedLimit, normalizedClaimTtlSeconds]
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

  return {
    supportsRetryColumns,
    rows
  };
}

export async function processPendingOutboxEvents({
  limit = 100,
  claimTtlSeconds = 120,
  retryDelaySeconds = 30,
  processor = null,
  db = pool
}) {
  const normalizedRetryDelaySeconds = normalizeOutboxRetryDelaySeconds(retryDelaySeconds, 30);
  const {
    supportsRetryColumns,
    rows
  } = await claimPendingOutboxEvents({
    limit,
    claimTtlSeconds,
    db
  });

  let processedCount = 0;
  let requeuedCount = 0;
  let failedCount = 0;
  const normalizedProcessor = typeof processor === "function" ? processor : null;
  const sentEventIds = [];
  const failedItems = [];
  const requeuedItems = [];

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
      sentEventIds.push(outboxEventId);
    } catch (error) {
      const errorMessage = String(error?.message || "Outbox processing failed.")
        .trim()
        .slice(0, 2048);
      if (!supportsRetryColumns) {
        failedItems.push({
          id: outboxEventId,
          errorMessage
        });
        continue;
      }

      const currentRetryCount = Math.max(
        0,
        Number.parseInt(String(row?.retry_count ?? 0).trim(), 10) || 0
      );
      const maxRetries = normalizeOutboxMaxRetries(row?.max_retries, 5);
      const nextRetryCount = currentRetryCount + 1;

      if (nextRetryCount > maxRetries) {
        failedItems.push({
          id: outboxEventId,
          retryCount: nextRetryCount,
          errorMessage
        });
      } else {
        requeuedItems.push({
          id: outboxEventId,
          retryCount: nextRetryCount,
          errorMessage
        });
      }
    }
  }

  processedCount = await markOutboxEventsSent({
    eventIds: sentEventIds,
    supportsRetryColumns,
    db
  });
  failedCount = await markOutboxEventsFailed({
    items: failedItems,
    supportsRetryColumns,
    db
  });
  requeuedCount = supportsRetryColumns
    ? await requeueOutboxEvents({
      items: requeuedItems,
      retryDelaySeconds: normalizedRetryDelaySeconds,
      db
    })
    : 0;

  return {
    fetchedCount: Array.isArray(rows) ? rows.length : 0,
    processedCount,
    requeuedCount,
    failedCount
  };
}

export async function pruneProcessedOutboxEvents({
  retentionDays = DEFAULT_OUTBOX_RETENTION_DAYS,
  limit = 500,
  db = pool
}) {
  const normalizedRetentionDays = normalizeOutboxRetentionDays(retentionDays, DEFAULT_OUTBOX_RETENTION_DAYS);

  const normalizedLimit = normalizeOutboxBatchLimit(limit, 500);
  const { rowCount } = await db.query(
    `WITH deletable AS (
       SELECT o.id
         FROM outbox_events o
         LEFT JOIN appointment_settings aps
           ON aps.organization_id = o.organization_id
        WHERE o.status IN ('sent', 'failed')
          AND o.processed_at IS NOT NULL
          AND COALESCE(aps.outbox_retention_days, $1::integer) > 0
          AND o.processed_at < (
            CURRENT_TIMESTAMP - (
              COALESCE(aps.outbox_retention_days, $1::integer) * INTERVAL '1 day'
            )
          )
        ORDER BY o.processed_at ASC, o.id ASC
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

export async function pruneUserNotifications({
  retentionDays = DEFAULT_USER_NOTIFICATIONS_RETENTION_DAYS,
  limit = 500,
  db = pool
}) {
  const normalizedRetentionDays = normalizeOutboxRetentionDays(
    retentionDays,
    DEFAULT_USER_NOTIFICATIONS_RETENTION_DAYS
  );

  const normalizedLimit = normalizeOutboxBatchLimit(limit, 500);
  const { rowCount } = await db.query(
    `WITH deletable AS (
       SELECT n.id
         FROM user_notifications n
         LEFT JOIN appointment_settings aps
           ON aps.organization_id = n.organization_id
        WHERE COALESCE(aps.user_notifications_retention_days, $1::integer) > 0
          AND n.created_at < (
            CURRENT_TIMESTAMP - (
              COALESCE(aps.user_notifications_retention_days, $1::integer) * INTERVAL '1 day'
            )
          )
        ORDER BY n.created_at ASC, n.id ASC
        LIMIT $2
     )
     DELETE FROM user_notifications n
     USING deletable d
     WHERE n.id = d.id`,
    [normalizedRetentionDays, normalizedLimit]
  );

  return {
    deletedCount: rowCount || 0
  };
}

export async function getNotificationRetentionSettingsByOrganization({
  organizationId,
  defaultOutboxRetentionDays = DEFAULT_OUTBOX_RETENTION_DAYS,
  defaultUserNotificationsRetentionDays = DEFAULT_USER_NOTIFICATIONS_RETENTION_DAYS,
  db = pool
}) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId);
  if (!normalizedOrganizationId) {
    return null;
  }

  const fallbackOutboxRetentionDays = normalizeOutboxRetentionDays(
    defaultOutboxRetentionDays,
    DEFAULT_OUTBOX_RETENTION_DAYS
  );
  const fallbackUserNotificationsRetentionDays = normalizeOutboxRetentionDays(
    defaultUserNotificationsRetentionDays,
    DEFAULT_USER_NOTIFICATIONS_RETENTION_DAYS
  );

  const flags = await getNotificationRetentionColumnFlags({ db });
  if (!flags.hasOutboxRetentionDays || !flags.hasUserNotificationsRetentionDays) {
    return {
      organizationId: String(normalizedOrganizationId),
      outboxRetentionDays: String(fallbackOutboxRetentionDays),
      userNotificationsRetentionDays: String(fallbackUserNotificationsRetentionDays)
    };
  }

  const { rows } = await db.query(
    `SELECT outbox_retention_days, user_notifications_retention_days
       FROM appointment_settings
      WHERE organization_id = $1
      LIMIT 1`,
    [normalizedOrganizationId]
  );
  const row = rows[0] || null;

  return {
    organizationId: String(normalizedOrganizationId),
    outboxRetentionDays: String(
      normalizeOutboxRetentionDays(
        row?.outbox_retention_days,
        fallbackOutboxRetentionDays
      )
    ),
    userNotificationsRetentionDays: String(
      normalizeOutboxRetentionDays(
        row?.user_notifications_retention_days,
        fallbackUserNotificationsRetentionDays
      )
    )
  };
}

export async function saveNotificationRetentionSettingsByOrganization({
  organizationId,
  outboxRetentionDays = DEFAULT_OUTBOX_RETENTION_DAYS,
  userNotificationsRetentionDays = DEFAULT_USER_NOTIFICATIONS_RETENTION_DAYS,
  db = pool
}) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId);
  if (!normalizedOrganizationId) {
    const error = new Error("Invalid organization id.");
    error.code = "INVALID_NOTIFICATION_RETENTION_ORGANIZATION_ID";
    throw error;
  }

  const normalizedOutboxRetentionDays = normalizeOutboxRetentionDays(outboxRetentionDays, Number.NaN);
  if (!Number.isInteger(normalizedOutboxRetentionDays)) {
    const error = new Error("Invalid outbox retention days.");
    error.code = "INVALID_OUTBOX_RETENTION_DAYS";
    throw error;
  }

  const normalizedUserNotificationsRetentionDays = normalizeOutboxRetentionDays(
    userNotificationsRetentionDays,
    Number.NaN
  );
  if (!Number.isInteger(normalizedUserNotificationsRetentionDays)) {
    const error = new Error("Invalid user notifications retention days.");
    error.code = "INVALID_USER_NOTIFICATIONS_RETENTION_DAYS";
    throw error;
  }

  const flags = await getNotificationRetentionColumnFlags({ db });
  if (!flags.hasOutboxRetentionDays || !flags.hasUserNotificationsRetentionDays) {
    throw createMigrationRequiredError("Notification retention migration is required.", {
      missingColumns: {
        [APPOINTMENT_SETTINGS_TABLE]: getMissingNames(
          new Set([
            ...(flags.hasOutboxRetentionDays ? ["outbox_retention_days"] : []),
            ...(flags.hasUserNotificationsRetentionDays ? ["user_notifications_retention_days"] : [])
          ]),
          ["outbox_retention_days", "user_notifications_retention_days"]
        )
      }
    });
  }

  const { rows } = await db.query(
    `INSERT INTO appointment_settings (
       organization_id,
       slot_interval_minutes,
       outbox_retention_days,
       user_notifications_retention_days
     ) VALUES ($1,30,$2,$3)
     ON CONFLICT (organization_id) DO UPDATE SET
       outbox_retention_days = EXCLUDED.outbox_retention_days,
       user_notifications_retention_days = EXCLUDED.user_notifications_retention_days
     RETURNING organization_id, outbox_retention_days, user_notifications_retention_days`,
    [
      normalizedOrganizationId,
      normalizedOutboxRetentionDays,
      normalizedUserNotificationsRetentionDays
    ]
  );
  const row = rows[0] || {};
  return {
    organizationId: String(row?.organization_id || normalizedOrganizationId),
    outboxRetentionDays: String(
      normalizeOutboxRetentionDays(
        row?.outbox_retention_days,
        normalizedOutboxRetentionDays
      )
    ),
    userNotificationsRetentionDays: String(
      normalizeOutboxRetentionDays(
        row?.user_notifications_retention_days,
        normalizedUserNotificationsRetentionDays
      )
    )
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

  return executeTransaction(async (client) => {
    const recipientUserIds = await resolveNotificationRecipientIds({
      organizationId: normalizedOrganizationId,
      targetUserIds,
      targetRoles,
      excludeUserId: normalizedSourceUserId,
      db: client
    });

    if (recipientUserIds.length === 0) {
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

    return {
      recipientUserIds,
      notificationIds,
      outboxEventId
    };
  });
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

  const normalizedLimit = normalizeNotificationListLimit(limit);
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
