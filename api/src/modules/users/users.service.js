import argon2 from "argon2";
import pool from "../../config/db.js";
import { executeTransaction } from "../../lib/db-utils.js";
import { normalizeOrganizationCode } from "../../lib/organization-code.js";
import {
  isSpecialistLikeRoleLabel,
  joinNormalizedRoleLabelParts
} from "../../lib/role-labels.js";
import {
  clearAppointmentPlannerReportFilterCaches,
  clearAppointmentReferenceCaches
} from "../appointments/appointment-settings.service.js";

function buildUsersPagedResult(rows, {
  limit,
  requestedPage
} = {}) {
  const items = Array.isArray(rows) ? rows : [];
  const firstRow = items[0] || null;
  const total = Number.parseInt(String(firstRow?.total || "0"), 10) || 0;
  const totalPagesFromRow = Number.parseInt(String(firstRow?.total_pages || "0"), 10) || 0;
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 1;
  const totalPages = Math.max(1, totalPagesFromRow || Math.ceil(total / safeLimit) || 1);
  const safePage = total > 0
    ? Math.min(Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1, totalPages)
    : 1;

  return {
    page: safePage,
    totalPages,
    total,
    rows: items
      .filter((row) => Boolean(String(row?.id || "").trim()))
      .map((row) => {
        const nextRow = {};
        Object.entries(row || {}).forEach(([key, value]) => {
          if (key !== "total" && key !== "total_pages" && key !== "_sort_user_id") {
            nextRow[key] = value;
          }
        });
        return nextRow;
      })
  };
}

async function getRoleLabelById(client, roleId) {
  if (!Number.parseInt(String(roleId || "").trim(), 10)) {
    return "";
  }

  const { rows } = await client.query(
    "SELECT label FROM role_options WHERE id = $1 LIMIT 1",
    [roleId]
  );
  return String(rows[0]?.label || "").trim();
}

async function getPositionLabelById(client, positionId) {
  if (!Number.parseInt(String(positionId || "").trim(), 10)) {
    return "";
  }

  const { rows } = await client.query(
    "SELECT label FROM position_options WHERE id = $1 LIMIT 1",
    [positionId]
  );
  return String(rows[0]?.label || "").trim();
}

async function deleteFutureAppointmentSchedulesBySpecialist({
  client,
  organizationId,
  specialistId
}) {
  const { rows } = await client.query(
    `WITH deleted AS (
       DELETE FROM appointment_schedules s
        WHERE s.organization_id = $1
          AND s.specialist_id = $2
          AND (
            s.appointment_date > TIMEZONE('Asia/Tashkent', NOW())::date
            OR (
              s.appointment_date = TIMEZONE('Asia/Tashkent', NOW())::date
              AND s.end_time > TIMEZONE('Asia/Tashkent', NOW())::time
            )
          )
       RETURNING s.id
     )
     SELECT COUNT(*)::integer AS deleted_count
       FROM deleted`,
    [organizationId, specialistId]
  );

  return Number.parseInt(String(rows?.[0]?.deleted_count ?? "0"), 10) || 0;
}

async function deleteAppointmentSchedulesBySpecialist({
  client,
  organizationId,
  specialistId
}) {
  const { rows } = await client.query(
    `WITH deleted AS (
       DELETE FROM appointment_schedules s
        WHERE s.organization_id = $1
          AND s.specialist_id = $2
       RETURNING s.id
     )
     SELECT COUNT(*)::integer AS deleted_count
       FROM deleted`,
    [organizationId, specialistId]
  );

  return Number.parseInt(String(rows?.[0]?.deleted_count ?? "0"), 10) || 0;
}

async function runUserDeleteCleanupStep(step, callback) {
  try {
    return await callback();
  } catch (error) {
    const wrappedError = new Error(`User delete cleanup failed at ${step}.`);
    wrappedError.code = "USER_DELETE_CLEANUP_FAILED";
    wrappedError.statusCode = 409;
    wrappedError.step = step;
    wrappedError.cause = error;
    wrappedError.originalCode = error?.code || "";
    wrappedError.originalMessage = error?.message || "";
    throw wrappedError;
  }
}

export async function findRequester(authContext = {}) {
  const cachedRequester = authContext?.requester;
  if (cachedRequester) {
    return {
      id: cachedRequester.id,
      role_id: cachedRequester.role_id,
      is_admin: Boolean(cachedRequester.is_admin),
      is_platform_admin: Boolean(cachedRequester.is_platform_admin),
      organization_id: cachedRequester.organization_id,
      organization_allowed_features: Array.isArray(cachedRequester.organization_allowed_features)
        ? [...cachedRequester.organization_allowed_features]
        : null
    };
  }

  const { userId, organizationId } = authContext;
  const { rows } = await pool.query(
    `SELECT
       u.id,
       u.role_id,
       (COALESCE(u.is_platform_admin, FALSE) OR COALESCE(r.is_admin, FALSE)) AS is_admin,
       COALESCE(u.is_platform_admin, FALSE) AS is_platform_admin,
       u.organization_id,
       o.allowed_features AS organization_allowed_features
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
       JOIN role_options r ON r.id = u.role_id
        AND r.is_active = TRUE
      WHERE u.id = $1
        AND u.organization_id = $2
        AND o.is_active = TRUE`,
    [userId, organizationId]
  );
  return rows[0] || null;
}

export async function getUsersPage({
  organizationId,
  page,
  limit,
  canReadAllOrganizations = false,
  organizationCode = "",
  search = ""
}) {
  const baseParams = [];
  const whereParts = ["o.is_active = TRUE"];

  if (canReadAllOrganizations) {
    const normalizedOrganizationCode = normalizeOrganizationCode(organizationCode);
    if (normalizedOrganizationCode && normalizedOrganizationCode !== "all") {
      baseParams.push(normalizedOrganizationCode);
      whereParts.push(`LOWER(o.code) = $${baseParams.length}`);
    }
  } else {
    baseParams.push(organizationId);
    whereParts.push(`u.organization_id = $${baseParams.length}`);
  }

  const normalizedSearch = String(search || "").trim();
  if (normalizedSearch) {
    const isNumericSearch = /^\d+$/.test(normalizedSearch);
    baseParams.push(`%${normalizedSearch}%`);
    const textSearchParamIndex = baseParams.length;
    let numericSearchParamIndex = 0;
    if (isNumericSearch) {
      baseParams.push(Number.parseInt(normalizedSearch, 10));
      numericSearchParamIndex = baseParams.length;
    }
    whereParts.push(`(
      u.username ILIKE $${textSearchParamIndex}
      OR u.email ILIKE $${textSearchParamIndex}
      OR u.full_name ILIKE $${textSearchParamIndex}
      OR u.phone_number ILIKE $${textSearchParamIndex}
      ${numericSearchParamIndex ? `OR u.id = $${numericSearchParamIndex}` : ""}
    )`);
  }

  const whereSql = `WHERE ${whereParts.join(" AND ")}`;
  const requestedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const limitParamRef = `$${baseParams.length + 1}`;
  const pageParamRef = `$${baseParams.length + 2}`;

  const rowsResult = await pool.query(
    `WITH filtered_users AS (
       SELECT
         u.id::text AS id,
         u.id AS _sort_user_id,
         u.organization_id::text AS organization_id,
         o.code AS organization_code,
         o.name AS organization_name,
         u.username,
         u.email,
         u.full_name,
         u.birthday,
         u.phone_number,
         u.position_id::text AS position_id,
         u.role_id::text AS role_id,
         p.label AS position,
         r.label AS role,
         u.created_at
        FROM users u
        JOIN organizations o ON o.id = u.organization_id
        JOIN role_options r ON r.id = u.role_id
        LEFT JOIN position_options p ON p.id = u.position_id
        ${whereSql}
     ),
     meta AS (
       SELECT
         COUNT(*)::int AS total,
         GREATEST(1, CEIL(COUNT(*)::numeric / ${limitParamRef})::int) AS total_pages
        FROM filtered_users
     )
     SELECT
       meta.total,
       meta.total_pages,
       paged.*
      FROM meta
      LEFT JOIN LATERAL (
        SELECT *
          FROM filtered_users
         ORDER BY created_at DESC, _sort_user_id DESC
         LIMIT ${limitParamRef}
        OFFSET CASE
          WHEN meta.total = 0 THEN 0
          WHEN ${pageParamRef} < 1 THEN 0
          WHEN ${pageParamRef} > meta.total_pages THEN (meta.total_pages - 1) * ${limitParamRef}
          ELSE (${pageParamRef} - 1) * ${limitParamRef}
        END
      ) paged ON TRUE`,
    [...baseParams, limit, requestedPage]
  );
  return buildUsersPagedResult(rowsResult.rows, {
    limit,
    requestedPage
  });
}

export async function getUserScopeById(userId) {
  const { rows } = await pool.query(
    `SELECT
       u.id::text AS id,
       u.organization_id::text AS organization_id,
       u.role_id::text AS role_id,
       (COALESCE(u.is_platform_admin, FALSE) OR COALESCE(r.is_admin, FALSE)) AS is_admin,
       COALESCE(u.is_platform_admin, FALSE) AS is_platform_admin
      FROM users u
      LEFT JOIN role_options r ON r.id = u.role_id
      WHERE u.id = $1
      LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

export async function updateUserByAdmin({
  currentOrganizationId,
  nextOrganizationId = null,
  actorUserId,
  userId,
  email,
  fullName,
  birthday,
  phone,
  positionId,
  roleId,
  password
}) {
  return executeTransaction(async (client) => {
    const parsedNextOrganizationId = Number(nextOrganizationId);
    const targetOrganizationId = Number.isInteger(parsedNextOrganizationId) && parsedNextOrganizationId > 0
      ? parsedNextOrganizationId
      : Number(currentOrganizationId);
    const scopedOrganizationId = Number(currentOrganizationId);

    const currentUserResult = await client.query(
      `SELECT role_id, position_id, username
         FROM users
        WHERE id = $1
          AND organization_id = $2
        LIMIT 1
        FOR UPDATE`,
      [userId, scopedOrganizationId]
    );
    const currentUser = currentUserResult.rows[0] || null;
    if (!currentUser) {
      return null;
    }

    const currentRoleId = Number(currentUser.role_id);
    const currentPositionId = Number.parseInt(String(currentUser.position_id || "").trim(), 10) || 0;
    const nextUsername = String(currentUser.username || "").trim();
    const currentRoleLabel = await getRoleLabelById(client, currentRoleId);
    const currentPositionLabel = await getPositionLabelById(client, currentPositionId);
    const nextRoleLabel = await getRoleLabelById(client, roleId);
    const nextPositionId = Number.parseInt(String(positionId || "").trim(), 10) || 0;
    const nextPositionLabel = nextPositionId === currentPositionId
      ? currentPositionLabel
      : await getPositionLabelById(client, nextPositionId);
    const wasPlannerSpecialist = isSpecialistLikeRoleLabel(
      joinNormalizedRoleLabelParts(currentRoleLabel, currentPositionLabel)
    );
    const remainsPlannerSpecialist = isSpecialistLikeRoleLabel(
      joinNormalizedRoleLabelParts(nextRoleLabel, nextPositionLabel)
    );
    const shouldDeleteFuturePlannerLessons = wasPlannerSpecialist && !remainsPlannerSpecialist;

    let updateResult;
    try {
      updateResult = await client.query(
        `UPDATE users
            SET organization_id = $1,
                username = $2,
                email = LOWER($3),
                full_name = $4,
                birthday = $5,
                phone_number = $6,
                position_id = $7::int,
                role_id = $8::int,
                updated_by = $11,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $9
            AND organization_id = $10`,
        [
          targetOrganizationId,
          nextUsername,
          email || null,
          fullName,
          birthday || null,
          phone || null,
          positionId,
          roleId,
          userId,
          scopedOrganizationId,
          actorUserId || null
        ]
      );
    } catch (error) {
      if (error?.code === "23503" && targetOrganizationId !== scopedOrganizationId) {
        const transferBlockedError = new Error(
          "User has linked organization data and cannot be moved to another organization."
        );
        transferBlockedError.code = "USER_TRANSFER_BLOCKED_LINKED_DATA";
        transferBlockedError.field = "organizationCode";
        throw transferBlockedError;
      }
      throw error;
    }

    if (updateResult.rowCount === 0) {
      return null;
    }

    if (password) {
      const passwordHash = await argon2.hash(password);
      await client.query(
        "UPDATE users SET password_hash = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND organization_id = $4",
        [passwordHash, actorUserId || null, userId, targetOrganizationId]
      );
    }

    if (shouldDeleteFuturePlannerLessons) {
      await deleteFutureAppointmentSchedulesBySpecialist({
        client,
        organizationId: scopedOrganizationId,
        specialistId: userId,
        actorUserId: actorUserId || null
      });
    }

    const { rows } = await client.query(
      `SELECT
         u.id::text AS id,
         u.organization_id::text AS organization_id,
         o.code AS organization_code,
         o.name AS organization_name,
         u.username,
         u.email,
         u.full_name,
         u.birthday,
         u.role_id::text AS role_id,
         r.label AS role,
         u.phone_number,
         u.position_id::text AS position_id,
         p.label AS position,
         u.created_at
        FROM users u
        JOIN organizations o ON o.id = u.organization_id
        JOIN role_options r ON r.id = u.role_id
        LEFT JOIN position_options p ON p.id = u.position_id
       WHERE u.id = $1
         AND u.organization_id = $2`,
      [userId, targetOrganizationId]
    );

    clearAppointmentReferenceCaches();
    clearAppointmentPlannerReportFilterCaches();

    return rows[0] || null;
  });
}

export async function deleteUserById(userId, organizationId, {
  actorUserId = null
} = {}) {
  return executeTransaction(async (client) => {
    await runUserDeleteCleanupStep("user audit references", () => client.query(
      `UPDATE users
          SET created_by = CASE WHEN created_by = $2 THEN NULL ELSE created_by END,
              updated_by = CASE WHEN updated_by = $2 THEN NULL ELSE updated_by END
        WHERE organization_id = $1
          AND (created_by = $2 OR updated_by = $2)`,
      [organizationId, userId]
    ));

    const targetClassResult = await runUserDeleteCleanupStep("VIP class lookup", () => client.query(
      `SELECT id
         FROM vip_class_teacher_assignments
        WHERE organization_id = $1
          AND teacher_user_id = $2
        ORDER BY id ASC`,
      [organizationId, userId]
    ));
    const targetClassIds = (targetClassResult.rows || [])
      .map((row) => Number.parseInt(String(row?.id || "").trim(), 10))
      .filter((id) => Number.isInteger(id) && id > 0);

    await runUserDeleteCleanupStep("appointment schedules", () => deleteAppointmentSchedulesBySpecialist({
      client,
      organizationId,
      specialistId: userId
    }));

    await runUserDeleteCleanupStep("appointment breaks", () => client.query(
      `DELETE FROM appointment_breaks
        WHERE organization_id = $1
          AND specialist_id = $2`,
      [organizationId, userId]
    ));

    await runUserDeleteCleanupStep("appointment working hours", () => client.query(
      `DELETE FROM appointment_working_hours
        WHERE organization_id = $1
          AND user_id = $2`,
      [organizationId, userId]
    ));

    await runUserDeleteCleanupStep("user notifications", () => client.query(
      `DELETE FROM user_notifications
        WHERE organization_id = $1
          AND user_id = $2`,
      [organizationId, userId]
    ));

    await runUserDeleteCleanupStep("notification source user references", () => client.query(
      `UPDATE user_notifications
          SET source_user_id = NULL
        WHERE organization_id = $1
          AND source_user_id = $2`,
      [organizationId, userId]
    ));

    await runUserDeleteCleanupStep("VIP tutor assignment history", () => client.query(
      `DELETE FROM vip_client_tutor_assignment_history
        WHERE organization_id = $1
          AND tutor_user_id = $2`,
      [organizationId, userId]
    ));

    await runUserDeleteCleanupStep("VIP tutor assignments", () => client.query(
      `DELETE FROM vip_client_tutor_assignments
        WHERE organization_id = $1
          AND tutor_user_id = $2`,
      [organizationId, userId]
    ));

    if (targetClassIds.length > 0) {
      await runUserDeleteCleanupStep("VIP class tutor assignments", () => client.query(
        `DELETE FROM vip_client_tutor_assignments
          WHERE organization_id = $1
            AND class_assignment_id = ANY($2::bigint[])`,
        [organizationId, targetClassIds]
      ));

      await runUserDeleteCleanupStep("VIP class tutor assignment history", () => client.query(
        `UPDATE vip_client_tutor_assignment_history
            SET class_assignment_id = NULL
          WHERE organization_id = $1
            AND class_assignment_id = ANY($2::bigint[])`,
        [organizationId, targetClassIds]
      ));
    }

    await runUserDeleteCleanupStep("VIP class teacher assignments", () => client.query(
      `DELETE FROM vip_class_teacher_assignments
        WHERE organization_id = $1
          AND teacher_user_id = $2`,
      [organizationId, userId]
    ));

    const result = await runUserDeleteCleanupStep("user row", () => client.query(
      "DELETE FROM users WHERE id = $1 AND organization_id = $2",
      [userId, organizationId]
    ));
    if (result.rowCount > 0) {
      clearAppointmentReferenceCaches();
      clearAppointmentPlannerReportFilterCaches();
    }
    return result;
  });
}
