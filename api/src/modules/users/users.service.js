import argon2 from "argon2";
import pool from "../../config/db.js";
import { executeTransaction } from "../../lib/db-utils.js";

const VIP_CLASS_TEACHER_ASSIGNMENTS_TABLE_NAME = "public.vip_class_teacher_assignments";
const VIP_CLASS_TEACHER_ASSIGNMENTS_TABLE_CACHE_TTL_MS = 60_000;
let vipClassTeacherAssignmentsTableCache = {
  value: null,
  checkedAt: 0
};

function normalizeRoleLabel(value) {
  return String(value || "").trim().toLowerCase();
}

function isTutorRoleLabel(roleLabel) {
  return normalizeRoleLabel(roleLabel).includes("tutor");
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

export async function findRequester({ userId, organizationId }) {
  const { rows } = await pool.query(
    `SELECT u.id, u.role_id, r.is_admin, u.organization_id
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
       JOIN role_options r ON r.id = u.role_id
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
  organizationCode = ""
}) {
  const baseParams = [];
  const whereParts = ["o.is_active = TRUE"];

  if (canReadAllOrganizations) {
    const normalizedOrganizationCode = String(organizationCode || "").trim().toLowerCase();
    if (normalizedOrganizationCode && normalizedOrganizationCode !== "all") {
      baseParams.push(normalizedOrganizationCode);
      whereParts.push(`LOWER(o.code) = $${baseParams.length}`);
    }
  } else {
    baseParams.push(organizationId);
    whereParts.push(`u.organization_id = $${baseParams.length}`);
  }

  const whereSql = `WHERE ${whereParts.join(" AND ")}`;

  const totalResult = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
      ${whereSql}`,
    baseParams
  );
  const total = Number(totalResult.rows[0]?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;
  const pageParams = [...baseParams, limit, offset];

  const rowsResult = await pool.query(
    `SELECT
       u.id::text AS id,
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
      ORDER BY u.created_at DESC
      LIMIT $${baseParams.length + 1} OFFSET $${baseParams.length + 2}`,
    pageParams
  );
  return {
    page: safePage,
    totalPages,
    total,
    rows: rowsResult.rows
  };
}

export async function getUserScopeById(userId) {
  const { rows } = await pool.query(
    "SELECT id::text AS id, organization_id::text AS organization_id FROM users WHERE id = $1 LIMIT 1",
    [userId]
  );
  return rows[0] || null;
}

export async function updateUserByAdmin({
  currentOrganizationId,
  nextOrganizationId = null,
  actorUserId,
  userId,
  username,
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
      `SELECT role_id
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
    const nextRoleLabel = await getRoleLabelById(client, roleId);
    const isRoleChangingToTutor = Number(roleId) !== currentRoleId && isTutorRoleLabel(nextRoleLabel);
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

    const updateResult = await client.query(
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
        username,
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
