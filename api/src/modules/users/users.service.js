import argon2 from "argon2";
import pool from "../../config/db.js";
import { executeTransaction } from "../../lib/db-utils.js";
import { normalizeOrganizationCode } from "../../lib/organization-code.js";
import { isTutorLikeRoleLabel } from "../../lib/role-labels.js";

const VIP_CLASS_TEACHER_ASSIGNMENTS_TABLE_NAME = "public.vip_class_teacher_assignments";
const VIP_CLASS_TEACHER_ASSIGNMENTS_TABLE_CACHE_TTL_MS = 60_000;
let vipClassTeacherAssignmentsTableCache = {
  value: null,
  checkedAt: 0
};

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
  const { rows } = await client.query(
    "SELECT label FROM role_options WHERE id = $1 LIMIT 1",
    [roleId]
  );
  return String(rows[0]?.label || "").trim();
}

async function vipClassTeacherAssignmentsTableExists(client) {
  const now = Date.now();
  if (
    typeof vipClassTeacherAssignmentsTableCache.value === "boolean"
    && now - vipClassTeacherAssignmentsTableCache.checkedAt < VIP_CLASS_TEACHER_ASSIGNMENTS_TABLE_CACHE_TTL_MS
  ) {
    return vipClassTeacherAssignmentsTableCache.value;
  }

  const { rows } = await client.query(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [VIP_CLASS_TEACHER_ASSIGNMENTS_TABLE_NAME]
  );
  const exists = Boolean(rows[0]?.exists);
  vipClassTeacherAssignmentsTableCache = {
    value: exists,
    checkedAt: now
  };
  return exists;
}

async function isAssignedAsVipClassTeacher(client, { organizationId, userId }) {
  if (!(await vipClassTeacherAssignmentsTableExists(client))) {
    return false;
  }

  const { rows } = await client.query(
    `SELECT EXISTS (
       SELECT 1
         FROM vip_class_teacher_assignments
        WHERE organization_id = $1
          AND teacher_user_id = $2
     ) AS assigned`,
    [organizationId, userId]
  );
  return Boolean(rows[0]?.assigned);
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
      WHERE id = $1
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
      `SELECT role_id, username
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
    const nextUsername = String(currentUser.username || "").trim();
    const nextRoleLabel = await getRoleLabelById(client, roleId);
    const isRoleChangingToTutor = Number(roleId) !== currentRoleId && isTutorLikeRoleLabel(nextRoleLabel);
    if (isRoleChangingToTutor) {
      const isTeacherAssigned = await isAssignedAsVipClassTeacher(client, {
        organizationId: scopedOrganizationId,
        userId
      });
      if (isTeacherAssigned) {
        const conflictError = new Error(
          "Cannot change role to Tutor while this user is assigned as a class teacher."
        );
        conflictError.code = "ROLE_CHANGE_BLOCKED_TEACHER_ASSIGNED";
        conflictError.field = "role";
        throw conflictError;
      }
    }

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

    return rows[0] || null;
  });
}

export async function deleteUserById(userId, organizationId) {
  return pool.query(
    "DELETE FROM users WHERE id = $1 AND organization_id = $2",
    [userId, organizationId]
  );
}
