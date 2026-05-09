import pool from "../../config/db.js";
import { executeTransaction } from "../../lib/db-utils.js";
import { toBoundedInteger } from "../../lib/bounded-integer.js";
import {
  MANAGER_ROLE_MATCHERS,
  isManagerLikeRoleLabel,
  normalizeNotificationTargetRoles as normalizeTargetRoles,
  normalizeNotificationTargetUserIds as normalizeTargetUserIds
} from "../../lib/notification-targets.js";
import { normalizePositiveInteger } from "../../lib/number.js";
import { normalizePermissionCodes } from "../../lib/permission-codes.js";

const MAX_OUTBOX_MAX_RETRIES = 100;
const ALL_TARGET_ROLE = "all";
const DEFAULT_NOTIFICATION_LIMIT = 10;
const MAX_NOTIFICATION_LIMIT = 50;

function normalizeOutboxMaxRetries(value, fallback = 5) {
  return toBoundedInteger(value, fallback, 0, MAX_OUTBOX_MAX_RETRIES);
}

function normalizeNotificationLimit(value, fallback = DEFAULT_NOTIFICATION_LIMIT) {
  return toBoundedInteger(value, fallback, 1, MAX_NOTIFICATION_LIMIT);
}

function mapNotificationRow(row) {
  return {
    id: normalizePositiveInteger(row?.id),
    eventType: String(row?.event_type || "").trim(),
    message: String(row?.message || "").trim(),
    payload: row?.payload && typeof row.payload === "object" ? row.payload : {},
    isRead: Boolean(row?.is_read),
    readAt: row?.read_at || null,
    createdAt: row?.created_at || null,
    sourceUserId: normalizePositiveInteger(row?.source_user_id) || null
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

async function resolveNotificationRecipientIds({
  organizationId,
  targetUserIds = [],
  targetRoles = [],
  targetPermissionCodes = [],
  excludeUserId = 0,
  db = pool
}) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId);
  if (!normalizedOrganizationId) {
    return [];
  }

  const normalizedTargetUserIds = normalizeTargetUserIds(targetUserIds);
  const normalizedTargetRoles = normalizeTargetRoles(targetRoles);
  const normalizedTargetPermissionCodes = normalizePermissionCodes(targetPermissionCodes);
  const shouldIncludeAllUsers = normalizedTargetRoles.includes(ALL_TARGET_ROLE);
  const customRoles = normalizedTargetRoles.filter((roleLabel) => roleLabel !== ALL_TARGET_ROLE);
  const includeManagerSemantic = customRoles.some((roleLabel) => isManagerLikeRoleLabel(roleLabel));
  const exactRoleLabels = customRoles.filter((roleLabel) => !isManagerLikeRoleLabel(roleLabel));
  if (
    !shouldIncludeAllUsers
    && normalizedTargetUserIds.length === 0
    && exactRoleLabels.length === 0
    && !includeManagerSemantic
    && normalizedTargetPermissionCodes.length === 0
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
            CARDINALITY($8::text[]) > 0
            AND EXISTS (
              SELECT 1
                FROM role_permissions rp
                JOIN permissions p
                  ON p.id = rp.permission_id
                 AND p.is_active = TRUE
               WHERE rp.role_id = u.role_id
                 AND LOWER(TRIM(p.code)) = ANY($8::text[])
            )
          )
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
      excludedUserId || null,
      normalizedTargetPermissionCodes
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

export async function persistNotificationEvent({
  organizationId,
  sourceUserId = 0,
  eventType = "",
  message = "",
  targetUserIds = [],
  targetRoles = [],
  targetPermissionCodes = [],
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
      targetPermissionCodes,
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
  limit = DEFAULT_NOTIFICATION_LIMIT,
  unreadOnly = false
}) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId);
  const normalizedUserId = normalizePositiveInteger(userId);
  if (!normalizedOrganizationId || !normalizedUserId) {
    return {
      items: [],
      unreadCount: 0
    };
  }

  const normalizedLimit = normalizeNotificationLimit(limit);
  const onlyUnread = Boolean(unreadOnly);
  const { rows } = await pool.query(
    `SELECT
       id,
       event_type,
       message,
       payload,
       is_read,
       read_at,
       created_at,
       source_user_id
      FROM user_notifications
     WHERE organization_id = $1
       AND user_id = $2
       AND ($4::boolean = FALSE OR is_read = FALSE)
     ORDER BY created_at DESC, id DESC
     LIMIT $3::integer`,
    [
      normalizedOrganizationId,
      normalizedUserId,
      normalizedLimit,
      onlyUnread
    ]
  );
  const unreadResult = await pool.query(
    `SELECT COUNT(*)::integer AS unread_count
       FROM user_notifications
      WHERE organization_id = $1
        AND user_id = $2
        AND is_read = FALSE`,
    [normalizedOrganizationId, normalizedUserId]
  );

  return {
    items: (rows || []).map(mapNotificationRow).filter((item) => item.id > 0),
    unreadCount: normalizePositiveInteger(unreadResult.rows?.[0]?.unread_count)
  };
}

export async function markUserNotificationRead({
  organizationId,
  userId,
  notificationId
}) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId);
  const normalizedUserId = normalizePositiveInteger(userId);
  const normalizedNotificationId = normalizePositiveInteger(notificationId);
  if (!normalizedOrganizationId || !normalizedUserId || !normalizedNotificationId) {
    return null;
  }

  const { rows } = await pool.query(
    `UPDATE user_notifications
        SET is_read = TRUE,
            read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
      WHERE organization_id = $1
        AND user_id = $2
        AND id = $3
      RETURNING
        id,
        event_type,
        message,
        payload,
        is_read,
        read_at,
        created_at,
        source_user_id`,
    [
      normalizedOrganizationId,
      normalizedUserId,
      normalizedNotificationId
    ]
  );

  return rows?.[0] ? mapNotificationRow(rows[0]) : null;
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

  return Number.isInteger(rowCount) ? rowCount : 0;
}
