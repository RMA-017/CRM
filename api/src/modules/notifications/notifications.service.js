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

const MAX_OUTBOX_MAX_RETRIES = 100;
const ALL_TARGET_ROLE = "all";

function normalizeOutboxMaxRetries(value, fallback = 5) {
  return toBoundedInteger(value, fallback, 0, MAX_OUTBOX_MAX_RETRIES);
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
