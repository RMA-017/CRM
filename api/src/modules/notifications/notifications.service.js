import pool from "../../config/db.js";
import { parsePositiveInteger } from "../../lib/number.js";

const MAX_NOTIFICATIONS_LIMIT = 200;
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
