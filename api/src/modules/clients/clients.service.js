import pool from "../../config/db.js";
import { clearAppointmentPlannerReportFilterCaches } from "../appointments/appointment-settings.service.js";
import { notifyTelegramParentsForAppointmentChange } from "../telegram-bot/telegram-bot.service.js";
import { createTtlCache } from "../../lib/ttl-cache.js";
import {
  createMigrationRequiredError,
  getExistingTableNames,
  getMissingNames,
  getTableColumnNames
} from "../../lib/schema-guard.js";
import {
  normalizeVipClassDailyRoutineActivityType,
  normalizeVipDailyRoutineDayOfWeek
} from "./vip-daily-routines.js";

let vipAttendanceSchemaInitPromise = null;
let vipAssignmentsSchemaInitPromise = null;
let vipClassDailyRoutinesSchemaInitPromise = null;
let appointmentCalendarTablesReadyPromise = null;
const CLIENT_NAME_CONFLICT_CONSTRAINT = "uq_clients_org_person_name_ci";
const clientsReferenceCache = createTtlCache({
  maxEntries: 128,
  defaultTtlMs: 30_000
});
const vipNormMonitoringCache = createTtlCache({
  maxEntries: 64,
  defaultTtlMs: 30_000
});
const VIP_CLASS_DAILY_ROUTINES_REQUIRED_COLUMNS = [
  "organization_id",
  "class_assignment_id",
  "day_of_week",
  "activity_type",
  "start_time",
  "end_time",
  "specialist_user_id",
  "mandatory_exercises",
  "note",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at"
];

function cloneVipAssignableUsers(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    id: String(item?.id || "").trim(),
    name: String(item?.name || "").trim()
  }));
}

function cloneVipClientOptionItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    id: String(item?.id || "").trim(),
    first_name: String(item?.first_name || "").trim(),
    last_name: String(item?.last_name || "").trim(),
    middle_name: String(item?.middle_name || "").trim()
  }));
}

export function clearClientsReferenceCaches() {
  clientsReferenceCache.clear();
}

export function resetClientsServiceSchemaCacheForTests() {
  vipAttendanceSchemaInitPromise = null;
  vipAssignmentsSchemaInitPromise = null;
  vipClassDailyRoutinesSchemaInitPromise = null;
  appointmentCalendarTablesReadyPromise = null;
  clearClientsReferenceCaches();
}

export function isClientNameConflictError(error) {
  return (
    error?.code === "23505"
    && String(error?.constraint || "").trim().toLowerCase() === CLIENT_NAME_CONFLICT_CONSTRAINT
  );
}

function mapDeletedClientAppointmentNotificationRow(row) {
  return {
    id: row?.id,
    organizationId: row?.organization_id,
    specialistId: row?.specialist_id,
    specialistName: row?.specialist_name,
    clientId: row?.client_id,
    appointmentDate: row?.appointment_date,
    startTime: row?.start_time,
    endTime: row?.end_time,
    serviceName: row?.service_name,
    status: row?.status,
    note: row?.note,
    firstName: row?.first_name,
    lastName: row?.last_name,
    middleName: row?.middle_name
  };
}

function buildClientLessonsDeletedNotification({ organizationId, clientName, items }) {
  const notificationItems = (Array.isArray(items) ? items : [])
    .map(mapDeletedClientAppointmentNotificationRow)
    .filter((item) => Number.parseInt(String(item?.id || "").trim(), 10) > 0);
  if (!Number.parseInt(String(organizationId || "").trim(), 10) || notificationItems.length === 0) {
    return null;
  }
  return {
    organizationId,
    eventType: "client-lessons-deleted",
    actorName: "CRM",
    items: notificationItems,
    notificationContext: {
      scope: "client_deactivated",
      clientName: String(clientName || "").trim(),
      deletedCount: notificationItems.length
    }
  };
}

async function sendClientLessonsDeletedNotification(notification) {
  if (!notification?.organizationId || !Array.isArray(notification.items) || notification.items.length === 0) {
    return;
  }
  await notifyTelegramParentsForAppointmentChange(notification).catch(() => {});
}

function buildPagedRowsResult(rows, {
  limit,
  requestedPage,
  idField = "id",
  omitKeys = []
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
  const omitKeySet = new Set(["total", "total_pages", ...omitKeys]);

  const normalizedRows = items
    .filter((row) => {
      const value = row?.[idField];
      return Boolean(String(value ?? "").trim());
    })
    .map((row) => {
      const nextRow = {};
      Object.entries(row || {}).forEach(([key, value]) => {
        if (!omitKeySet.has(key)) {
          nextRow[key] = value;
        }
      });
      return nextRow;
    });

  return {
    total,
    totalPages,
    page: safePage,
    rows: normalizedRows
  };
}

function buildMissingTablesError(message, missingTables = []) {
  return createMigrationRequiredError(message, {
    missingTables: Array.isArray(missingTables) ? missingTables : []
  });
}

async function ensureVipAttendanceSchema() {
  if (!vipAttendanceSchemaInitPromise) {
    vipAttendanceSchemaInitPromise = (async () => {
      const existingTables = await getExistingTableNames({
        tableNames: ["vip_client_attendance"]
      });
      const missingTables = ["vip_client_attendance"].filter((tableName) => !existingTables.has(tableName));
      if (missingTables.length > 0) {
        throw buildMissingTablesError("VIP attendance migration is required.", missingTables);
      }
    })().catch((error) => {
      vipAttendanceSchemaInitPromise = null;
      throw error;
    });
  }

  return vipAttendanceSchemaInitPromise;
}

async function ensureVipAssignmentsSchema() {
  if (!vipAssignmentsSchemaInitPromise) {
    vipAssignmentsSchemaInitPromise = (async () => {
      const requiredTables = [
        "vip_class_teacher_assignments",
        "vip_client_tutor_assignments",
        "vip_class_teacher_assignment_history",
        "vip_client_tutor_assignment_history"
      ];
      const existingTables = await getExistingTableNames({
        tableNames: requiredTables
      });
      const missingTables = requiredTables.filter((tableName) => !existingTables.has(tableName));
      if (missingTables.length > 0) {
        throw buildMissingTablesError("VIP assignment migration is required.", missingTables);
      }
    })().catch((error) => {
      vipAssignmentsSchemaInitPromise = null;
      throw error;
    });
  }

  return vipAssignmentsSchemaInitPromise;
}

async function ensureVipClassDailyRoutinesSchema() {
  if (!vipClassDailyRoutinesSchemaInitPromise) {
    vipClassDailyRoutinesSchemaInitPromise = (async () => {
      await ensureVipAssignmentsSchema();
      const existingTables = await getExistingTableNames({
        tableNames: ["vip_class_daily_routines"]
      });
      const missingTables = ["vip_class_daily_routines"].filter((tableName) => !existingTables.has(tableName));
      if (missingTables.length > 0) {
        throw buildMissingTablesError("VIP class daily routine migration is required.", missingTables);
      }

      const existingColumns = await getTableColumnNames({
        tableName: "vip_class_daily_routines"
      });
      const missingColumns = getMissingNames(existingColumns, VIP_CLASS_DAILY_ROUTINES_REQUIRED_COLUMNS);
      if (missingColumns.length > 0) {
        throw createMigrationRequiredError("VIP class daily routine migration is required.", {
          missingColumns: {
            vip_class_daily_routines: missingColumns
          }
        });
      }
    })().catch((error) => {
      vipClassDailyRoutinesSchemaInitPromise = null;
      throw error;
    });
  }

  return vipClassDailyRoutinesSchemaInitPromise;
}

export async function findClientsRequester(authContext = {}) {
  const cachedRequester = authContext?.requester;
  if (cachedRequester) {
    const roleLabel = String(cachedRequester.role_label || cachedRequester.role || "").trim();
    const positionLabel = String(cachedRequester.position_label || cachedRequester.position || "").trim();
    return {
      id: cachedRequester.id,
      role_id: cachedRequester.role_id,
      is_admin: Boolean(cachedRequester.is_admin),
      is_platform_admin: Boolean(cachedRequester.is_platform_admin),
      role_label: roleLabel,
      position_label: positionLabel
    };
  }

  const { userId, organizationId } = authContext;
  const { rows } = await pool.query(
    `SELECT
       u.id,
       u.role_id,
       (COALESCE(u.is_platform_admin, FALSE) OR COALESCE(r.is_admin, FALSE)) AS is_admin,
       COALESCE(u.is_platform_admin, FALSE) AS is_platform_admin,
       COALESCE(NULLIF(TRIM(r.label), ''), '') AS role_label,
       COALESCE(NULLIF(TRIM(p.label), ''), '') AS position_label
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
       JOIN role_options r ON r.id = u.role_id
        AND r.is_active = TRUE
       LEFT JOIN position_options p ON p.id = u.position_id
      WHERE u.id = $1
        AND u.organization_id = $2
        AND o.is_active = TRUE
      LIMIT 1`,
    [userId, organizationId]
  );
  return rows[0] || null;
}

async function getVipAssignableUsersByKeywords(organizationId, keywords = []) {
  const normalizedKeywords = Array.isArray(keywords)
    ? keywords
        .map((keyword) => normalizeSearchToken(keyword))
        .filter(Boolean)
    : [];
  if (normalizedKeywords.length === 0) {
    return [];
  }

  const cacheKey = `vip-assignable|org:${organizationId}|keywords:${normalizedKeywords.join(",")}`;
  const cached = clientsReferenceCache.get(cacheKey);
  if (cached) {
    return cloneVipAssignableUsers(cached);
  }

  const params = [organizationId];
  const roleLikeParts = [];
  const positionLikeParts = [];
  normalizedKeywords.forEach((keyword) => {
    params.push(`%${keyword}%`);
    const paramRef = `$${params.length}`;
    roleLikeParts.push(`LOWER(TRIM(COALESCE(r.label, ''))) LIKE ${paramRef}`);
    positionLikeParts.push(`LOWER(TRIM(COALESCE(p.label, ''))) LIKE ${paramRef}`);
  });

  const { rows } = await pool.query(
    `SELECT
       u.id::text AS id,
       COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), CONCAT('User #', u.id::text)) AS name
      FROM users u
      JOIN organizations o ON o.id = u.organization_id
      JOIN role_options r ON r.id = u.role_id
      LEFT JOIN position_options p ON p.id = u.position_id
      WHERE u.organization_id = $1
        AND o.is_active = TRUE
        AND r.is_active = TRUE
        AND (
          (${roleLikeParts.join(" OR ")})
          OR
          (${positionLikeParts.join(" OR ")})
        )
      ORDER BY
        COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), u.id::text) ASC`,
    params
  );
  const items = rows || [];
  clientsReferenceCache.set(cacheKey, cloneVipAssignableUsers(items));
  return items;
}

async function getOrganizationUsersByExactPositionLabels(organizationId, positionLabels = []) {
  const normalizedLabels = Array.isArray(positionLabels)
    ? Array.from(new Set(positionLabels.map((label) => normalizeSearchToken(label)).filter(Boolean)))
    : [];
  if (normalizedLabels.length === 0) {
    return [];
  }

  const cacheKey = `organization-users-by-position|org:${organizationId}|positions:${normalizedLabels.join(",")}`;
  const cached = clientsReferenceCache.get(cacheKey);
  if (cached) {
    return cloneVipAssignableUsers(cached);
  }

  const params = [organizationId];
  const positionClauses = normalizedLabels.map((label) => {
    params.push(label);
    return `LOWER(TRIM(COALESCE(p.label, ''))) = $${params.length}`;
  });

  const { rows } = await pool.query(
    `SELECT
       u.id::text AS id,
       COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), CONCAT('User #', u.id::text)) AS name
      FROM users u
      JOIN organizations o ON o.id = u.organization_id
      JOIN role_options r ON r.id = u.role_id
       AND r.is_active = TRUE
      LEFT JOIN position_options p ON p.id = u.position_id
      WHERE u.organization_id = $1
        AND o.is_active = TRUE
        AND (${positionClauses.join(" OR ")})
      ORDER BY
        COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), u.id::text) ASC,
        u.id ASC`,
    params
  );

  const items = rows || [];
  clientsReferenceCache.set(cacheKey, cloneVipAssignableUsers(items));
  return items;
}

async function getOrganizationUsersByOrganization(organizationId) {
  const cacheKey = `organization-users|org:${organizationId}`;
  const cached = clientsReferenceCache.get(cacheKey);
  if (cached) {
    return cloneVipAssignableUsers(cached);
  }

  const { rows } = await pool.query(
    `SELECT
       u.id::text AS id,
       COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), CONCAT('User #', u.id::text)) AS name
      FROM users u
      JOIN organizations o ON o.id = u.organization_id
      WHERE u.organization_id = $1
        AND o.is_active = TRUE
      ORDER BY
        COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), u.id::text) ASC,
        u.id ASC`,
    [organizationId]
  );

  const items = rows || [];
  clientsReferenceCache.set(cacheKey, cloneVipAssignableUsers(items));
  return items;
}

export async function getVipAttendanceTeachersByOrganization(organizationId) {
  return getVipAssignableUsersByKeywords(organizationId, [
    "educator",
    "teacher",
    "tutor",
    "coach"
  ]);
}

async function getVipAttendanceEducatorsByOrganization(organizationId) {
  return getOrganizationUsersByExactPositionLabels(organizationId, ["educator"]);
}

async function getVipAttendanceTutorsByOrganization(organizationId) {
  return getOrganizationUsersByExactPositionLabels(organizationId, ["tutor"]);
}

export async function getVipClientOptionsByOrganization({
  organizationId,
  limit = 1000
}) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 2000) : 1000;
  const cacheKey = `vip-clients|org:${organizationId}|limit:${safeLimit}`;
  const cached = clientsReferenceCache.get(cacheKey);
  if (cached) {
    return cloneVipClientOptionItems(cached);
  }
  const { rows } = await pool.query(
    `SELECT
       c.id::text AS id,
       c.first_name,
       c.last_name,
       c.middle_name
      FROM clients c
      JOIN organizations o ON o.id = c.organization_id
      WHERE c.organization_id = $1
        AND c.is_vip = TRUE
        AND o.is_active = TRUE
      ORDER BY
        LOWER(c.last_name) ASC,
        LOWER(c.first_name) ASC,
        LOWER(COALESCE(c.middle_name, '')) ASC,
        c.id ASC
      LIMIT $2`,
    [organizationId, safeLimit]
  );
  const items = rows || [];
  clientsReferenceCache.set(cacheKey, cloneVipClientOptionItems(items));
  return items;
}

export async function getVipAssignmentOptionsByOrganization(organizationId) {
  const [teachers, tutors] = await Promise.all([
    getOrganizationUsersByOrganization(organizationId),
    getVipAssignableUsersByKeywords(organizationId, [
      "educator",
      "tutor"
    ])
  ]);
  return {
    teachers,
    tutors
  };
}

async function getVipClassAssignments({
  organizationId,
  assignedUserId = null,
  limit = 200
}) {
  await ensureVipAssignmentsSchema();

  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 200;
  const normalizedAssignedUserId = Number.parseInt(String(assignedUserId || "").trim(), 10) || null;
  const { rows } = await pool.query(
    `SELECT
       va.id::text AS id,
       va.class_name,
       va.teacher_user_id::text AS teacher_user_id,
       COALESCE(NULLIF(TRIM(tu.full_name), ''), NULLIF(TRIM(tu.username), ''), '') AS teacher_name,
       COALESCE(vta_stats.children_count, 0) AS children_count,
       va.created_by::text AS created_by,
       COALESCE(NULLIF(TRIM(vcu.full_name), ''), NULLIF(TRIM(vcu.username), ''), '') AS created_by_name,
       va.created_at
      FROM vip_class_teacher_assignments va
      JOIN organizations o ON o.id = va.organization_id
      LEFT JOIN (
        SELECT
          vta.class_assignment_id,
          COUNT(*)::int AS children_count,
          BOOL_OR(vta.tutor_user_id = $3::integer) AS has_assigned_tutor
        FROM vip_client_tutor_assignments vta
        WHERE vta.organization_id = $1
        GROUP BY vta.class_assignment_id
      ) vta_stats
        ON vta_stats.class_assignment_id = va.id
      LEFT JOIN users tu
        ON tu.id = va.teacher_user_id
       AND tu.organization_id = va.organization_id
      LEFT JOIN users vcu
        ON vcu.id = va.created_by
       AND vcu.organization_id = va.organization_id
      WHERE va.organization_id = $1
        AND o.is_active = TRUE
        AND (
          $3::integer IS NULL
          OR va.teacher_user_id = $3::integer
          OR COALESCE(vta_stats.has_assigned_tutor, FALSE)
        )
      ORDER BY
        LOWER(va.class_name) ASC,
        va.id ASC
      LIMIT $2`,
    [organizationId, safeLimit, normalizedAssignedUserId]
  );

  return rows || [];
}

async function getVipClassAssignmentOptions({
  organizationId,
  assignedUserId = null,
  limit = 500
}) {
  await ensureVipAssignmentsSchema();

  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 1000) : 500;
  const normalizedAssignedUserId = Number.parseInt(String(assignedUserId || "").trim(), 10) || null;
  const { rows } = await pool.query(
    `SELECT
       va.id::text AS id,
       va.class_name,
       va.teacher_user_id::text AS teacher_user_id,
       COALESCE(NULLIF(TRIM(tu.full_name), ''), NULLIF(TRIM(tu.username), ''), '') AS teacher_name
      FROM vip_class_teacher_assignments va
      JOIN organizations o ON o.id = va.organization_id
      LEFT JOIN (
        SELECT
          vta.class_assignment_id,
          BOOL_OR(vta.tutor_user_id = $3::integer) AS has_assigned_tutor
        FROM vip_client_tutor_assignments vta
        WHERE vta.organization_id = $1
        GROUP BY vta.class_assignment_id
      ) vta_scope
        ON vta_scope.class_assignment_id = va.id
      LEFT JOIN users tu
        ON tu.id = va.teacher_user_id
       AND tu.organization_id = va.organization_id
      WHERE va.organization_id = $1
        AND o.is_active = TRUE
        AND (
          $3::integer IS NULL
          OR va.teacher_user_id = $3::integer
          OR COALESCE(vta_scope.has_assigned_tutor, FALSE)
        )
      ORDER BY LOWER(va.class_name) ASC, va.id ASC
      LIMIT $2`,
    [organizationId, safeLimit, normalizedAssignedUserId]
  );

  return rows || [];
}

async function getVipClassAssignmentHistory({
  organizationId,
  classId = null,
  assignedUserId = null,
  limit = 200
}) {
  await ensureVipAssignmentsSchema();

  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 200;
  const whereParts = [
    "h.organization_id = $1",
    "o.is_active = TRUE"
  ];
  const params = [organizationId];
  if (Number.isInteger(classId) && classId > 0) {
    params.push(classId);
    whereParts.push(`h.class_assignment_id = $${params.length}`);
  }
  const normalizedAssignedUserId = Number.parseInt(String(assignedUserId || "").trim(), 10) || null;
  if (normalizedAssignedUserId) {
    params.push(normalizedAssignedUserId);
    const assignedUserParam = `$${params.length}`;
    whereParts.push(`(
      h.teacher_user_id = ${assignedUserParam}
      OR EXISTS (
        SELECT 1
          FROM vip_client_tutor_assignment_history vth
         WHERE vth.organization_id = h.organization_id
           AND vth.class_assignment_id = h.class_assignment_id
           AND vth.tutor_user_id = ${assignedUserParam}
      )
    )`);
  }
  params.push(safeLimit);

  const { rows } = await pool.query(
    `SELECT
       h.id::text AS id,
       h.class_assignment_id::text AS class_assignment_id,
       h.class_name,
       h.teacher_user_id::text AS teacher_user_id,
       COALESCE(NULLIF(TRIM(tu.full_name), ''), NULLIF(TRIM(tu.username), ''), '') AS teacher_name,
       h.assigned_by::text AS assigned_by,
       COALESCE(NULLIF(TRIM(au.full_name), ''), NULLIF(TRIM(au.username), ''), '') AS assigned_by_name,
       h.assigned_at,
       h.changed_by::text AS changed_by,
       COALESCE(NULLIF(TRIM(cu.full_name), ''), NULLIF(TRIM(cu.username), ''), '') AS changed_by_name,
       h.changed_at
      FROM vip_class_teacher_assignment_history h
      JOIN organizations o ON o.id = h.organization_id
      LEFT JOIN users tu
        ON tu.id = h.teacher_user_id
       AND tu.organization_id = h.organization_id
      LEFT JOIN users au
        ON au.id = h.assigned_by
       AND au.organization_id = h.organization_id
      LEFT JOIN users cu
        ON cu.id = h.changed_by
       AND cu.organization_id = h.organization_id
      WHERE ${whereParts.join(" AND ")}
      ORDER BY h.changed_at DESC, h.id DESC
      LIMIT $${params.length}`,
    params
  );

  return rows || [];
}

async function upsertVipClassAssignment({
  organizationId,
  classId = null,
  className,
  teacherUserId,
  updatedBy
}) {
  await ensureVipAssignmentsSchema();

  const normalizedClassName = String(className || "").trim();
  const normalizedTeacherUserId = Number.parseInt(String(teacherUserId || "").trim(), 10) || 0;
  const normalizedClassId = Number.parseInt(String(classId || "").trim(), 10) || 0;

  if (!normalizedClassName || !normalizedTeacherUserId) {
    return null;
  }

  if (normalizedClassId > 0) {
    const { rows } = await pool.query(
      `WITH previous AS (
         SELECT
           vcta.id,
           vcta.class_name,
           vcta.teacher_user_id,
           vcta.created_by,
           vcta.updated_by,
           vcta.created_at,
           vcta.updated_at
         FROM vip_class_teacher_assignments vcta
         WHERE vcta.organization_id = $1
           AND vcta.id = $2
         LIMIT 1
       ),
       updated AS (
         UPDATE vip_class_teacher_assignments vcta
            SET class_name = $3::text,
                teacher_user_id = $4::integer,
                updated_by = $5::integer,
                updated_at = CURRENT_TIMESTAMP
          WHERE vcta.organization_id = $1
            AND vcta.id = $2
          RETURNING
            vcta.id,
            vcta.class_name,
            vcta.teacher_user_id,
            vcta.created_by,
            vcta.created_at,
            vcta.updated_by,
            vcta.updated_at
       ),
       history_inserted AS (
         INSERT INTO vip_class_teacher_assignment_history (
           organization_id,
           class_assignment_id,
           class_name,
           teacher_user_id,
           assigned_by,
           assigned_at,
           changed_by,
           changed_at
         )
         SELECT
           $1,
           p.id,
           p.class_name,
           p.teacher_user_id,
           COALESCE(p.updated_by, p.created_by),
           COALESCE(p.updated_at, p.created_at, CURRENT_TIMESTAMP),
           $5::integer,
           CURRENT_TIMESTAMP
         FROM previous p
         JOIN updated u ON u.id = p.id
         WHERE
           p.class_name IS DISTINCT FROM u.class_name
           OR p.teacher_user_id IS DISTINCT FROM u.teacher_user_id
         RETURNING id
       )
       SELECT
         u.id::text AS id,
         u.class_name,
         u.teacher_user_id::text AS teacher_user_id,
         COALESCE(NULLIF(TRIM(tu.full_name), ''), NULLIF(TRIM(tu.username), ''), '') AS teacher_name,
         (
           SELECT COUNT(*)::int
             FROM vip_client_tutor_assignments vta
            WHERE vta.organization_id = $1
              AND vta.class_assignment_id = u.id
         ) AS children_count,
         u.created_by::text AS created_by,
        COALESCE(NULLIF(TRIM(cu.full_name), ''), NULLIF(TRIM(cu.username), ''), '') AS created_by_name,
        u.created_at
       FROM updated u
       LEFT JOIN users tu
         ON tu.id = u.teacher_user_id
        AND tu.organization_id = $1
       LEFT JOIN users cu
         ON cu.id = u.created_by
        AND cu.organization_id = $1`,
      [
        organizationId,
        normalizedClassId,
        normalizedClassName,
        normalizedTeacherUserId,
        updatedBy || null
      ]
    );
    return rows[0] || null;
  }

  const { rows } = await pool.query(
    `WITH previous AS (
       SELECT
         vcta.id,
         vcta.class_name,
         vcta.teacher_user_id,
         vcta.created_by,
         vcta.updated_by,
         vcta.created_at,
         vcta.updated_at
       FROM vip_class_teacher_assignments vcta
       WHERE vcta.organization_id = $1
         AND vcta.class_name = $2::text
       LIMIT 1
     ),
     upserted AS (
       INSERT INTO vip_class_teacher_assignments (
         organization_id,
         class_name,
         teacher_user_id,
         created_by,
         updated_by
       )
       VALUES (
         $1,
         $2::text,
         $3::integer,
         $4::integer,
         $4::integer
       )
       ON CONFLICT (organization_id, class_name)
       DO UPDATE
         SET teacher_user_id = EXCLUDED.teacher_user_id,
             updated_by = EXCLUDED.updated_by,
             updated_at = CURRENT_TIMESTAMP
       RETURNING
         id,
         class_name,
         teacher_user_id,
         created_by,
         created_at,
         updated_by,
         updated_at
     ),
     history_inserted AS (
       INSERT INTO vip_class_teacher_assignment_history (
         organization_id,
         class_assignment_id,
         class_name,
         teacher_user_id,
         assigned_by,
         assigned_at,
         changed_by,
         changed_at
       )
       SELECT
         $1,
         p.id,
         p.class_name,
         p.teacher_user_id,
         COALESCE(p.updated_by, p.created_by),
         COALESCE(p.updated_at, p.created_at, CURRENT_TIMESTAMP),
         $4::integer,
         CURRENT_TIMESTAMP
       FROM previous p
       JOIN upserted u ON u.id = p.id
       WHERE
         p.class_name IS DISTINCT FROM u.class_name
         OR p.teacher_user_id IS DISTINCT FROM u.teacher_user_id
       RETURNING id
     )
     SELECT
       u.id::text AS id,
       u.class_name,
       u.teacher_user_id::text AS teacher_user_id,
       COALESCE(NULLIF(TRIM(tu.full_name), ''), NULLIF(TRIM(tu.username), ''), '') AS teacher_name,
       (
         SELECT COUNT(*)::int
           FROM vip_client_tutor_assignments vta
          WHERE vta.organization_id = $1
            AND vta.class_assignment_id = u.id
       ) AS children_count,
       u.created_by::text AS created_by,
       COALESCE(NULLIF(TRIM(cu.full_name), ''), NULLIF(TRIM(cu.username), ''), '') AS created_by_name,
       u.created_at
     FROM upserted u
     LEFT JOIN users tu
       ON tu.id = u.teacher_user_id
      AND tu.organization_id = $1
     LEFT JOIN users cu
       ON cu.id = u.created_by
      AND cu.organization_id = $1`,
    [
      organizationId,
      normalizedClassName,
      normalizedTeacherUserId,
      updatedBy || null
    ]
  );

  return rows[0] || null;
}

async function deleteVipClassAssignment({
  organizationId,
  classId
}) {
  await ensureVipAssignmentsSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE vip_client_tutor_assignment_history
          SET class_assignment_id = NULL
        WHERE organization_id = $1
          AND class_assignment_id = $2`,
      [organizationId, classId]
    );
    const result = await client.query(
      `DELETE FROM vip_class_teacher_assignments
        WHERE organization_id = $1
          AND id = $2`,
      [organizationId, classId]
    );
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getVipTutorAssignments({
  organizationId,
  assignedUserId = null,
  limit = 200
}) {
  await ensureVipAssignmentsSchema();

  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 200;
  const normalizedAssignedUserId = Number.parseInt(String(assignedUserId || "").trim(), 10) || null;
  const { rows } = await pool.query(
    `SELECT
       c.id::text AS id,
       c.organization_id::text AS organization_id,
       c.first_name,
       c.last_name,
       c.middle_name,
       c.is_vip,
       vta.class_assignment_id::text AS class_assignment_id,
       vcta.class_name,
       vcta.teacher_user_id::text AS teacher_user_id,
       COALESCE(NULLIF(TRIM(teacher_u.full_name), ''), NULLIF(TRIM(teacher_u.username), ''), '') AS teacher_name,
       vta.tutor_user_id::text AS tutor_user_id,
       COALESCE(NULLIF(TRIM(tutor_u.full_name), ''), NULLIF(TRIM(tutor_u.username), ''), '') AS tutor_name,
       COALESCE(vta.updated_by, vta.created_by)::text AS updated_by,
       COALESCE(NULLIF(TRIM(updated_u.full_name), ''), NULLIF(TRIM(updated_u.username), ''), '') AS updated_by_name,
       vta.created_at,
       vta.updated_at
      FROM clients c
      JOIN organizations o ON o.id = c.organization_id
      LEFT JOIN vip_client_tutor_assignments vta
        ON vta.organization_id = c.organization_id
       AND vta.client_id = c.id
      LEFT JOIN vip_class_teacher_assignments vcta
        ON vcta.organization_id = vta.organization_id
       AND vcta.id = vta.class_assignment_id
      LEFT JOIN users teacher_u
        ON teacher_u.id = vcta.teacher_user_id
       AND teacher_u.organization_id = c.organization_id
      LEFT JOIN users tutor_u
        ON tutor_u.id = vta.tutor_user_id
       AND tutor_u.organization_id = c.organization_id
      LEFT JOIN users updated_u
        ON updated_u.id = COALESCE(vta.updated_by, vta.created_by)
       AND updated_u.organization_id = c.organization_id
      WHERE c.organization_id = $1
        AND o.is_active = TRUE
        AND c.is_vip = TRUE
        AND (
          $3::integer IS NULL
          OR vcta.teacher_user_id = $3::integer
          OR vta.tutor_user_id = $3::integer
        )
      ORDER BY
        LOWER(c.last_name) ASC,
        LOWER(c.first_name) ASC,
        LOWER(COALESCE(c.middle_name, '')) ASC,
        c.id ASC
      LIMIT $2`,
    [organizationId, safeLimit, normalizedAssignedUserId]
  );

  return rows || [];
}

async function getVipNormMonitoringRows({
  organizationId,
  assignedUserId = null,
  limit = 2000
}) {
  await ensureVipAssignmentsSchema();

  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 5000) : 2000;
  const normalizedAssignedUserId = Number.parseInt(String(assignedUserId || "").trim(), 10) || null;

  const cacheKey = `norm:${organizationId}:${normalizedAssignedUserId ?? 0}:${safeLimit}`;
  const cached = vipNormMonitoringCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const { rows } = await pool.query(
    `WITH vip_clients AS (
       SELECT
         c.id AS client_id,
         c.first_name,
         c.last_name,
         c.middle_name,
         vta.class_assignment_id,
         vta.tutor_user_id,
         vcta.class_name,
         vcta.teacher_user_id
       FROM clients c
       JOIN organizations o
         ON o.id = c.organization_id
       LEFT JOIN vip_client_tutor_assignments vta
          ON vta.organization_id = c.organization_id
         AND vta.client_id = c.id
       LEFT JOIN vip_class_teacher_assignments vcta
          ON vcta.organization_id = vta.organization_id
         AND vcta.id = vta.class_assignment_id
      WHERE c.organization_id = $1
        AND o.is_active = TRUE
        AND c.is_vip = TRUE
        AND (
          $3::integer IS NULL
          OR vcta.teacher_user_id = $3::integer
          OR vta.tutor_user_id = $3::integer
        )
     ),
     scheduled_sources AS (
       SELECT
         vc.client_id,
         vc.first_name,
         vc.last_name,
         vc.middle_name,
         vc.class_assignment_id,
         COALESCE(NULLIF(TRIM(vc.class_name), ''), '') AS class_name,
         CASE
           WHEN scheduled_specialist.position_id IS NULL THEN CONCAT('missing-position:scheduled:', vc.client_id::text, ':', s.specialist_id::text)
           ELSE scheduled_specialist.position_id::text
         END AS position_key,
         scheduled_specialist.position_id,
         CASE
           WHEN scheduled_specialist.position_id IS NULL THEN 'Specialist - No position'
           ELSE COALESCE(NULLIF(TRIM(po_scheduled.label), ''), CONCAT('Position #', scheduled_specialist.position_id::text))
         END AS position_label,
         COALESCE(an.max_per_week, 0)::int AS max_per_week,
         s.specialist_id AS linked_specialist_id,
         COALESCE(
           NULLIF(TRIM(scheduled_specialist.full_name), ''),
           NULLIF(TRIM(scheduled_specialist.username), ''),
           CONCAT('User #', s.specialist_id::text)
         ) AS linked_specialist_name,
         CASE
           WHEN scheduled_specialist.position_id IS NULL THEN 'no-position'
           WHEN an.id IS NULL THEN 'no-norm'
           ELSE 'ready'
         END AS setup_state,
         s.status AS schedule_status,
         s.id AS schedule_id
       FROM vip_clients vc
       JOIN appointment_schedules s
         ON s.organization_id = $1
        AND s.client_id = vc.client_id
        AND s.appointment_date >= date_trunc('week', CURRENT_DATE)::date
        AND s.appointment_date < (date_trunc('week', CURRENT_DATE)::date + INTERVAL '7 days')
        AND s.status IN ('pending', 'confirmed', 'cancelled', 'no-show')
       LEFT JOIN users scheduled_specialist
         ON scheduled_specialist.id = s.specialist_id
        AND scheduled_specialist.organization_id = $1
       LEFT JOIN position_options po_scheduled
         ON po_scheduled.id = scheduled_specialist.position_id
        AND po_scheduled.organization_id = $1
       LEFT JOIN appointment_norms an
         ON an.organization_id = $1
        AND an.position_id = scheduled_specialist.position_id
        AND an.is_active = TRUE
     ),
     scheduled_positions AS (
       SELECT
         ss.client_id,
         ss.first_name,
         ss.last_name,
         ss.middle_name,
         ss.class_assignment_id,
         MAX(ss.class_name) AS class_name,
         ss.position_key,
         MAX(ss.position_id) AS position_id,
         MAX(ss.position_label) AS position_label,
         MAX(ss.max_per_week)::int AS max_per_week,
         CASE
           WHEN BOOL_OR(ss.setup_state = 'no-position') THEN 'no-position'
           WHEN BOOL_OR(ss.setup_state = 'no-norm') THEN 'no-norm'
           ELSE 'ready'
         END AS setup_state,
         COUNT(DISTINCT ss.schedule_id)::int AS current_booked,
         COUNT(DISTINCT ss.schedule_id) FILTER (
           WHERE LOWER(TRIM(COALESCE(ss.schedule_status, ''))) = 'confirmed'
         )::int AS confirmed_count,
         COUNT(DISTINCT ss.schedule_id) FILTER (
           WHERE LOWER(TRIM(COALESCE(ss.schedule_status, ''))) IN ('cancelled', 'no-show')
         )::int AS cancelled_count,
         COALESCE(
           jsonb_agg(
             DISTINCT jsonb_build_object(
               'id', ss.linked_specialist_id::text,
               'name', ss.linked_specialist_name
             )
           ) FILTER (WHERE ss.linked_specialist_id IS NOT NULL),
           '[]'::jsonb
         ) AS linked_specialists
       FROM scheduled_sources ss
       GROUP BY
         ss.client_id,
         ss.first_name,
         ss.last_name,
         ss.middle_name,
         ss.class_assignment_id,
         ss.position_key
     ),
     clients_with_scheduled_positions AS (
       SELECT DISTINCT sp.client_id
       FROM scheduled_positions sp
     ),
     fallback_sources AS (
       SELECT
         vc.client_id,
         vc.first_name,
         vc.last_name,
         vc.middle_name,
         NULL::bigint AS class_assignment_id,
         ''::text AS class_name,
         CONCAT('missing-assignment:', vc.client_id::text) AS position_key,
         NULL::integer AS position_id,
         'No assignment'::text AS position_label,
         0::integer AS max_per_week,
         NULL::integer AS linked_specialist_id,
         ''::text AS linked_specialist_name,
         'no-assignment'::text AS setup_state
       FROM vip_clients vc
       LEFT JOIN clients_with_scheduled_positions csp
         ON csp.client_id = vc.client_id
       WHERE csp.client_id IS NULL
         AND vc.class_assignment_id IS NULL

       UNION ALL

       SELECT
         vc.client_id,
         vc.first_name,
         vc.last_name,
         vc.middle_name,
         vc.class_assignment_id,
         COALESCE(NULLIF(TRIM(vc.class_name), ''), '') AS class_name,
         CASE
           WHEN teacher.position_id IS NULL THEN CONCAT('missing-position:teacher:', vc.client_id::text)
           ELSE teacher.position_id::text
         END AS position_key,
         teacher.position_id,
         CASE
           WHEN teacher.position_id IS NULL THEN 'Teacher - No position'
           ELSE COALESCE(NULLIF(TRIM(po_teacher.label), ''), CONCAT('Position #', teacher.position_id::text))
         END AS position_label,
         COALESCE(an.max_per_week, 0)::int AS max_per_week,
         teacher.id AS linked_specialist_id,
         COALESCE(
           NULLIF(TRIM(teacher.full_name), ''),
           NULLIF(TRIM(teacher.username), ''),
           CONCAT('User #', teacher.id::text)
         ) AS linked_specialist_name,
         CASE
           WHEN teacher.position_id IS NULL THEN 'no-position'
           WHEN an.id IS NULL THEN 'no-norm'
           ELSE 'ready'
         END AS setup_state
       FROM vip_clients vc
       LEFT JOIN clients_with_scheduled_positions csp
         ON csp.client_id = vc.client_id
       LEFT JOIN users teacher
         ON teacher.id = vc.teacher_user_id
        AND teacher.organization_id = $1
       LEFT JOIN position_options po_teacher
         ON po_teacher.id = teacher.position_id
        AND po_teacher.organization_id = $1
       LEFT JOIN appointment_norms an
         ON an.organization_id = $1
        AND an.position_id = teacher.position_id
        AND an.is_active = TRUE
       WHERE csp.client_id IS NULL
         AND vc.class_assignment_id IS NOT NULL
         AND vc.teacher_user_id IS NOT NULL

       UNION ALL

       SELECT
         vc.client_id,
         vc.first_name,
         vc.last_name,
         vc.middle_name,
         vc.class_assignment_id,
         COALESCE(NULLIF(TRIM(vc.class_name), ''), '') AS class_name,
         CASE
           WHEN tutor.position_id IS NULL THEN CONCAT('missing-position:tutor:', vc.client_id::text)
           ELSE tutor.position_id::text
         END AS position_key,
         tutor.position_id,
         CASE
           WHEN tutor.position_id IS NULL THEN 'Tutor - No position'
           ELSE COALESCE(NULLIF(TRIM(po_tutor.label), ''), CONCAT('Position #', tutor.position_id::text))
         END AS position_label,
         COALESCE(an.max_per_week, 0)::int AS max_per_week,
         tutor.id AS linked_specialist_id,
         COALESCE(
           NULLIF(TRIM(tutor.full_name), ''),
           NULLIF(TRIM(tutor.username), ''),
           CONCAT('User #', tutor.id::text)
         ) AS linked_specialist_name,
         CASE
           WHEN tutor.position_id IS NULL THEN 'no-position'
           WHEN an.id IS NULL THEN 'no-norm'
           ELSE 'ready'
         END AS setup_state
       FROM vip_clients vc
       LEFT JOIN clients_with_scheduled_positions csp
         ON csp.client_id = vc.client_id
       LEFT JOIN users tutor
         ON tutor.id = vc.tutor_user_id
        AND tutor.organization_id = $1
       LEFT JOIN position_options po_tutor
         ON po_tutor.id = tutor.position_id
        AND po_tutor.organization_id = $1
       LEFT JOIN appointment_norms an
         ON an.organization_id = $1
        AND an.position_id = tutor.position_id
        AND an.is_active = TRUE
       WHERE csp.client_id IS NULL
         AND vc.class_assignment_id IS NOT NULL
         AND vc.tutor_user_id IS NOT NULL
     ),
     fallback_positions AS (
       SELECT
         fs.client_id,
         fs.first_name,
         fs.last_name,
         fs.middle_name,
         fs.class_assignment_id,
         MAX(fs.class_name) AS class_name,
         fs.position_key,
         MAX(fs.position_id) AS position_id,
         MAX(fs.position_label) AS position_label,
         MAX(fs.max_per_week)::int AS max_per_week,
         CASE
           WHEN BOOL_OR(fs.setup_state = 'no-assignment') THEN 'no-assignment'
           WHEN BOOL_OR(fs.setup_state = 'no-position') THEN 'no-position'
           WHEN BOOL_OR(fs.setup_state = 'no-norm') THEN 'no-norm'
           ELSE 'ready'
         END AS setup_state,
         0::int AS current_booked,
         0::int AS confirmed_count,
         0::int AS cancelled_count,
         COALESCE(
           jsonb_agg(
             DISTINCT jsonb_build_object(
               'id', fs.linked_specialist_id::text,
               'name', fs.linked_specialist_name
             )
           ) FILTER (WHERE fs.linked_specialist_id IS NOT NULL),
           '[]'::jsonb
         ) AS linked_specialists
       FROM fallback_sources fs
       GROUP BY
         fs.client_id,
         fs.first_name,
         fs.last_name,
         fs.middle_name,
         fs.class_assignment_id,
         fs.position_key
     ),
     monitoring_rows AS (
       SELECT
         sp.client_id,
         sp.first_name,
         sp.last_name,
         sp.middle_name,
         sp.class_assignment_id,
         sp.class_name,
         sp.position_key,
         sp.position_id,
         sp.position_label,
         sp.max_per_week,
         sp.current_booked,
         sp.confirmed_count,
         sp.cancelled_count,
         sp.linked_specialists,
         sp.linked_specialists AS scheduled_specialists,
         sp.setup_state
       FROM scheduled_positions sp

       UNION ALL

       SELECT
         fp.client_id,
         fp.first_name,
         fp.last_name,
         fp.middle_name,
         fp.class_assignment_id,
         fp.class_name,
         fp.position_key,
         fp.position_id,
         fp.position_label,
         fp.max_per_week,
         fp.current_booked,
         fp.confirmed_count,
         fp.cancelled_count,
         fp.linked_specialists,
         '[]'::jsonb AS scheduled_specialists,
         fp.setup_state
       FROM fallback_positions fp
     )
     SELECT
       mr.client_id::text AS client_id,
       mr.first_name,
       mr.last_name,
       mr.middle_name,
       COALESCE(mr.class_assignment_id::text, '') AS class_assignment_id,
       mr.class_name,
       COALESCE(mr.position_id::text, mr.position_key) AS position_id,
       mr.position_label,
       mr.max_per_week,
       mr.current_booked,
       mr.confirmed_count,
       mr.cancelled_count,
       mr.linked_specialists,
       mr.scheduled_specialists,
       CASE
         WHEN mr.setup_state = 'no-assignment' THEN 'No assignment'
         WHEN mr.setup_state = 'no-position' THEN 'No position'
         WHEN mr.setup_state = 'no-norm' THEN 'No norm configured'
         WHEN mr.current_booked > mr.max_per_week THEN 'Exceeded'
         WHEN mr.current_booked < mr.max_per_week THEN 'Limit reached'
         ELSE 'Normal'
       END AS status,
       CASE
         WHEN mr.setup_state = 'no-assignment' THEN 'no-assignment'
         WHEN mr.setup_state = 'no-position' THEN 'no-position'
         WHEN mr.setup_state = 'no-norm' THEN 'no-norm'
         WHEN mr.current_booked > mr.max_per_week THEN 'exceeded'
         WHEN mr.current_booked < mr.max_per_week THEN 'limit-reached'
         ELSE 'normal'
       END AS status_key
      FROM monitoring_rows mr
      ORDER BY
        LOWER(mr.last_name) ASC,
        LOWER(mr.first_name) ASC,
        LOWER(COALESCE(mr.middle_name, '')) ASC,
        LOWER(mr.position_label) ASC
      LIMIT $2`,
    [organizationId, safeLimit, normalizedAssignedUserId]
  );

  const result = rows || [];
  vipNormMonitoringCache.set(cacheKey, result);
  return result;
}

async function findVipTutorAssignmentByClientId({
  organizationId,
  clientId
}) {
  await ensureVipAssignmentsSchema();

  const normalizedClientId = Number.parseInt(String(clientId || "").trim(), 10) || 0;
  if (!normalizedClientId) {
    return null;
  }

  const { rows } = await pool.query(
    `SELECT
       client_id::text AS client_id,
       class_assignment_id::text AS class_assignment_id,
       tutor_user_id::text AS tutor_user_id
      FROM vip_client_tutor_assignments
      WHERE organization_id = $1
        AND client_id = $2
      LIMIT 1`,
    [organizationId, normalizedClientId]
  );

  return rows[0] || null;
}

async function isVipClassAssignedToUser({
  organizationId,
  classId,
  userId
}) {
  await ensureVipAssignmentsSchema();

  const normalizedClassId = Number.parseInt(String(classId || "").trim(), 10) || 0;
  const normalizedUserId = Number.parseInt(String(userId || "").trim(), 10) || 0;
  if (!normalizedClassId || !normalizedUserId) {
    return false;
  }

  const { rows } = await pool.query(
    `SELECT 1
       FROM vip_class_teacher_assignments vcta
      WHERE vcta.organization_id = $1
        AND vcta.id = $2
        AND (
          vcta.teacher_user_id = $3
          OR EXISTS (
            SELECT 1
              FROM vip_client_tutor_assignments vta
             WHERE vta.organization_id = vcta.organization_id
               AND vta.class_assignment_id = vcta.id
               AND vta.tutor_user_id = $3
          )
        )
      LIMIT 1`,
    [organizationId, normalizedClassId, normalizedUserId]
  );

  return rows.length > 0;
}

async function getVipTutorAssignmentHistory({
  organizationId,
  clientId = null,
  assignedUserId = null,
  limit = 200
}) {
  await ensureVipAssignmentsSchema();

  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 200;
  const whereParts = [
    "h.organization_id = $1",
    "o.is_active = TRUE"
  ];
  const params = [organizationId];
  if (Number.isInteger(clientId) && clientId > 0) {
    params.push(clientId);
    whereParts.push(`h.client_id = $${params.length}`);
  }
  const normalizedAssignedUserId = Number.parseInt(String(assignedUserId || "").trim(), 10) || null;
  if (normalizedAssignedUserId) {
    params.push(normalizedAssignedUserId);
    const assignedUserParam = `$${params.length}`;
    whereParts.push(`(
      h.tutor_user_id = ${assignedUserParam}
      OR EXISTS (
        SELECT 1
          FROM vip_class_teacher_assignments vcta
         WHERE vcta.organization_id = h.organization_id
           AND vcta.id = h.class_assignment_id
           AND vcta.teacher_user_id = ${assignedUserParam}
      )
      OR EXISTS (
        SELECT 1
          FROM vip_class_teacher_assignment_history vch
         WHERE vch.organization_id = h.organization_id
           AND vch.class_assignment_id = h.class_assignment_id
           AND vch.teacher_user_id = ${assignedUserParam}
      )
    )`);
  }
  params.push(safeLimit);

  const { rows } = await pool.query(
    `SELECT
       h.id::text AS id,
       h.client_id::text AS client_id,
       c.first_name,
       c.last_name,
       c.middle_name,
       h.class_assignment_id::text AS class_assignment_id,
       vcta.class_name,
       vcta.teacher_user_id::text AS teacher_user_id,
       COALESCE(NULLIF(TRIM(teacher_u.full_name), ''), NULLIF(TRIM(teacher_u.username), ''), '') AS teacher_name,
       h.tutor_user_id::text AS tutor_user_id,
       COALESCE(NULLIF(TRIM(tutor_u.full_name), ''), NULLIF(TRIM(tutor_u.username), ''), '') AS tutor_name,
       h.assigned_by::text AS assigned_by,
       COALESCE(NULLIF(TRIM(au.full_name), ''), NULLIF(TRIM(au.username), ''), '') AS assigned_by_name,
       h.assigned_at,
       h.changed_by::text AS changed_by,
       COALESCE(NULLIF(TRIM(cu.full_name), ''), NULLIF(TRIM(cu.username), ''), '') AS changed_by_name,
       h.changed_at
      FROM vip_client_tutor_assignment_history h
      JOIN clients c
        ON c.organization_id = h.organization_id
       AND c.id = h.client_id
      JOIN organizations o ON o.id = h.organization_id
      LEFT JOIN vip_class_teacher_assignments vcta
        ON vcta.organization_id = h.organization_id
       AND vcta.id = h.class_assignment_id
      LEFT JOIN users teacher_u
        ON teacher_u.id = vcta.teacher_user_id
       AND teacher_u.organization_id = h.organization_id
      LEFT JOIN users tutor_u
        ON tutor_u.id = h.tutor_user_id
       AND tutor_u.organization_id = h.organization_id
      LEFT JOIN users au
        ON au.id = h.assigned_by
       AND au.organization_id = h.organization_id
      LEFT JOIN users cu
        ON cu.id = h.changed_by
       AND cu.organization_id = h.organization_id
      WHERE ${whereParts.join(" AND ")}
      ORDER BY h.changed_at DESC, h.id DESC
      LIMIT $${params.length}`,
    params
  );

  return rows || [];
}

async function getVipClassDailyRoutines({
  organizationId,
  classId = null,
  dayOfWeek = null,
  assignedUserId = null,
  limit = 1000
}) {
  await ensureVipClassDailyRoutinesSchema();

  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 3000) : 1000;
  const normalizedAssignedUserId = Number.parseInt(String(assignedUserId || "").trim(), 10) || null;
  const whereParts = [
    "r.organization_id = $1",
    "o.is_active = TRUE"
  ];
  const params = [organizationId];

  if (Number.isInteger(classId) && classId > 0) {
    params.push(classId);
    whereParts.push(`r.class_assignment_id = $${params.length}`);
  }

  if (Number.isInteger(dayOfWeek) && dayOfWeek >= 1 && dayOfWeek <= 7) {
    params.push(dayOfWeek);
    whereParts.push(`r.day_of_week = $${params.length}`);
  }

  if (normalizedAssignedUserId) {
    params.push(normalizedAssignedUserId);
    const assignedUserParam = `$${params.length}`;
    whereParts.push(`(
      vcta.teacher_user_id = ${assignedUserParam}
      OR EXISTS (
        SELECT 1
          FROM vip_client_tutor_assignments vta_access
         WHERE vta_access.organization_id = r.organization_id
           AND vta_access.class_assignment_id = r.class_assignment_id
           AND vta_access.tutor_user_id = ${assignedUserParam}
      )
    )`);
  }

  params.push(safeLimit);

  const { rows } = await pool.query(
    `SELECT
       r.id::text AS id,
       r.class_assignment_id::text AS class_assignment_id,
      vcta.class_name,
      vcta.teacher_user_id::text AS teacher_user_id,
      COALESCE(NULLIF(TRIM(teacher_u.full_name), ''), NULLIF(TRIM(teacher_u.username), ''), '') AS teacher_name,
      r.specialist_user_id::text AS specialist_user_id,
      COALESCE(
        NULLIF(TRIM(specialist_u.full_name), ''),
        NULLIF(TRIM(specialist_u.username), ''),
        CASE
          WHEN r.specialist_user_id IS NOT NULL
            THEN CONCAT('User #', r.specialist_user_id::text)
          ELSE ''
        END
      ) AS specialist_name,
      CASE
        WHEN r.specialist_user_id IS NOT NULL THEN COALESCE(
          NULLIF(
            TRIM(CONCAT_WS(' ', NULLIF(TRIM(specialist_p.label), ''), NULLIF(TRIM(specialist_r.label), ''))),
            ''
          ),
          'Specialist'
        )
        ELSE ''
      END AS specialist_role,
      COALESCE(vta_counts.children_count, 0) AS children_count,
      r.day_of_week,
      r.activity_type,
      TO_CHAR(r.start_time, 'HH24:MI') AS start_time,
       TO_CHAR(r.end_time, 'HH24:MI') AS end_time,
       r.mandatory_exercises,
       r.note,
       r.created_by::text AS created_by,
       r.updated_by::text AS updated_by,
       r.created_at,
       r.updated_at
      FROM vip_class_daily_routines r
      JOIN organizations o ON o.id = r.organization_id
      JOIN vip_class_teacher_assignments vcta
        ON vcta.organization_id = r.organization_id
       AND vcta.id = r.class_assignment_id
      LEFT JOIN users teacher_u
        ON teacher_u.id = vcta.teacher_user_id
       AND teacher_u.organization_id = r.organization_id
      LEFT JOIN users specialist_u
        ON specialist_u.id = r.specialist_user_id
       AND specialist_u.organization_id = r.organization_id
      LEFT JOIN role_options specialist_r
        ON specialist_r.id = specialist_u.role_id
      LEFT JOIN position_options specialist_p
        ON specialist_p.id = specialist_u.position_id
      LEFT JOIN (
        SELECT class_assignment_id, COUNT(*)::int AS children_count
          FROM vip_client_tutor_assignments
         WHERE organization_id = $1
         GROUP BY class_assignment_id
      ) vta_counts ON vta_counts.class_assignment_id = r.class_assignment_id
      WHERE ${whereParts.join(" AND ")}
      ORDER BY
        LOWER(vcta.class_name) ASC,
        r.day_of_week ASC,
        r.start_time ASC,
        r.id ASC
      LIMIT $${params.length}`,
    params
  );

  return rows || [];
}

async function getVipClassDailyRoutineSpecialists({
  organizationId,
  classId = null,
  assignedUserId = null,
  limit = 2000
}) {
  await ensureVipClassDailyRoutinesSchema();

  const normalizedClassId = Number.parseInt(String(classId || "").trim(), 10) || 0;
  const normalizedAssignedUserId = Number.parseInt(String(assignedUserId || "").trim(), 10) || 0;
  const params = [organizationId];
  const accessibleWhereParts = [];

  if (normalizedClassId > 0) {
    params.push(normalizedClassId);
    accessibleWhereParts.push(`vcta.id = $${params.length}`);
  }

  if (normalizedAssignedUserId > 0) {
    params.push(normalizedAssignedUserId);
    accessibleWhereParts.push(
      `(vcta.teacher_user_id = $${params.length}
        OR EXISTS (
          SELECT 1
            FROM vip_client_tutor_assignments vta_scope
           WHERE vta_scope.organization_id = vcta.organization_id
             AND vta_scope.class_assignment_id = vcta.id
             AND vta_scope.tutor_user_id = $${params.length}
        ))`
    );
  }

  params.push(Math.max(1, Math.min(Number.parseInt(String(limit || "").trim(), 10) || 2000, 5000)));
  const accessibleWhereSql = accessibleWhereParts.length > 0
    ? `AND ${accessibleWhereParts.join("\n          AND ")}`
    : "";

  const { rows } = await pool.query(
    `WITH accessible_classes AS (
       SELECT vcta.id, vcta.organization_id
         FROM vip_class_teacher_assignments vcta
         JOIN organizations o ON o.id = vcta.organization_id
        WHERE vcta.organization_id = $1
          AND o.is_active = TRUE
          ${accessibleWhereSql}
     ),
     organization_specialists AS (
       SELECT
         u.id::text AS specialist_user_id,
         COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), CONCAT('User #', u.id::text)) AS specialist_name,
         COALESCE(
           NULLIF(
             TRIM(CONCAT_WS(' ', NULLIF(TRIM(p.label), ''), NULLIF(TRIM(r.label), ''))),
             ''
           ),
           'Specialist'
         ) AS specialist_role
        FROM users u
        JOIN organizations o
          ON o.id = u.organization_id
        JOIN role_options r
          ON r.id = u.role_id
        LEFT JOIN position_options p
          ON p.id = u.position_id
       WHERE u.organization_id = $1
         AND o.is_active = TRUE
         AND r.is_active = TRUE
         AND (
           LOWER(TRIM(r.label)) LIKE '%specialist%'
           OR LOWER(TRIM(r.label)) LIKE '%spetsialist%'
           OR LOWER(TRIM(r.label)) LIKE '%mutaxassis%'
           OR LOWER(TRIM(r.label)) LIKE '%специалист%'
           OR LOWER(TRIM(COALESCE(p.label, ''))) LIKE '%specialist%'
           OR LOWER(TRIM(COALESCE(p.label, ''))) LIKE '%spetsialist%'
           OR LOWER(TRIM(COALESCE(p.label, ''))) LIKE '%mutaxassis%'
           OR LOWER(TRIM(COALESCE(p.label, ''))) LIKE '%специалист%'
         )
     )
     SELECT
       ac.id::text AS class_assignment_id,
       os.specialist_user_id,
       os.specialist_name,
       os.specialist_role
      FROM accessible_classes ac
      JOIN organization_specialists os
        ON TRUE
     ORDER BY
       ac.id ASC,
       LOWER(os.specialist_name) ASC,
       os.specialist_user_id ASC
     LIMIT $${params.length}`,
    params
  );

  return (rows || []).map((row) => ({
    class_assignment_id: row?.class_assignment_id,
    specialist_user_id: row?.specialist_user_id,
    specialist_name: row?.specialist_name,
    specialist_role: row?.specialist_role
  }));
}

async function findVipClassDailyRoutineConflictForSpecialist({
  organizationId,
  routineId = null,
  specialistId,
  dayOfWeek,
  startTime,
  endTime,
  db = pool
}) {
  await ensureVipClassDailyRoutinesSchema();

  const normalizedRoutineId = Number.parseInt(String(routineId || "").trim(), 10) || 0;
  const normalizedSpecialistId = Number.parseInt(String(specialistId || "").trim(), 10) || 0;
  const normalizedDayOfWeek = normalizeVipDailyRoutineDayOfWeek(dayOfWeek);
  const normalizedStartTime = String(startTime || "").trim();
  const normalizedEndTime = String(endTime || "").trim();

  if (
    !normalizedSpecialistId
    || !normalizedDayOfWeek
    || !normalizedStartTime
    || !normalizedEndTime
  ) {
    return null;
  }

  const params = [
    organizationId,
    normalizedSpecialistId,
    normalizedDayOfWeek,
    normalizedStartTime,
    normalizedEndTime
  ];
  const excludeCurrentRoutineSql = normalizedRoutineId > 0
    ? `AND r.id <> $${params.push(normalizedRoutineId)}`
    : "";

  const { rows } = await (db || pool).query(
    `SELECT
       r.id::text AS id,
       r.class_assignment_id::text AS class_assignment_id,
       COALESCE(NULLIF(TRIM(vcta.class_name), ''), CONCAT('Class #', r.class_assignment_id::text)) AS class_name,
       r.activity_type,
       TO_CHAR(r.start_time, 'HH24:MI') AS start_time,
       TO_CHAR(r.end_time, 'HH24:MI') AS end_time
      FROM vip_class_daily_routines r
      LEFT JOIN vip_class_teacher_assignments vcta
        ON vcta.organization_id = r.organization_id
       AND vcta.id = r.class_assignment_id
      WHERE r.organization_id = $1
        AND r.day_of_week = $3
        AND ($4::time < r.end_time)
        AND (r.start_time < $5::time)
        AND r.specialist_user_id = $2
        ${excludeCurrentRoutineSql}
      ORDER BY
        r.start_time ASC,
        r.id ASC
      LIMIT 1`,
    params
  );

  if (!rows[0]) {
    return null;
  }

  return {
    routineId: String(rows[0]?.id || "").trim(),
    classId: String(rows[0]?.class_assignment_id || "").trim(),
    className: String(rows[0]?.class_name || "").trim(),
    activityType: normalizeVipClassDailyRoutineActivityType(rows[0]?.activity_type),
    startTime: String(rows[0]?.start_time || "").trim(),
    endTime: String(rows[0]?.end_time || "").trim()
  };
}

async function findVipClassDailyRoutineConflictForClass({
  organizationId,
  routineId = null,
  classId,
  dayOfWeek,
  startTime,
  endTime,
  db = pool
}) {
  await ensureVipClassDailyRoutinesSchema();

  const normalizedRoutineId = Number.parseInt(String(routineId || "").trim(), 10) || 0;
  const normalizedClassId = Number.parseInt(String(classId || "").trim(), 10) || 0;
  const normalizedDayOfWeek = normalizeVipDailyRoutineDayOfWeek(dayOfWeek);
  const normalizedStartTime = String(startTime || "").trim();
  const normalizedEndTime = String(endTime || "").trim();

  if (
    !normalizedClassId
    || !normalizedDayOfWeek
    || !normalizedStartTime
    || !normalizedEndTime
  ) {
    return null;
  }

  const params = [
    organizationId,
    normalizedClassId,
    normalizedDayOfWeek,
    normalizedStartTime,
    normalizedEndTime
  ];
  const excludeCurrentRoutineSql = normalizedRoutineId > 0
    ? `AND r.id <> $${params.push(normalizedRoutineId)}`
    : "";

  const { rows } = await (db || pool).query(
    `SELECT
       r.id::text AS id,
       r.class_assignment_id::text AS class_assignment_id,
       COALESCE(NULLIF(TRIM(vcta.class_name), ''), CONCAT('Class #', r.class_assignment_id::text)) AS class_name,
       r.activity_type,
       TO_CHAR(r.start_time, 'HH24:MI') AS start_time,
       TO_CHAR(r.end_time, 'HH24:MI') AS end_time
      FROM vip_class_daily_routines r
      LEFT JOIN vip_class_teacher_assignments vcta
        ON vcta.organization_id = r.organization_id
       AND vcta.id = r.class_assignment_id
      WHERE r.organization_id = $1
        AND r.class_assignment_id = $2
        AND r.day_of_week = $3
        AND ($4::time < r.end_time)
        AND (r.start_time < $5::time)
        ${excludeCurrentRoutineSql}
      ORDER BY
        r.start_time ASC,
        r.id ASC
      LIMIT 1`,
    params
  );

  if (!rows[0]) {
    return null;
  }

  return {
    routineId: String(rows[0]?.id || "").trim(),
    classId: String(rows[0]?.class_assignment_id || "").trim(),
    className: String(rows[0]?.class_name || "").trim(),
    activityType: normalizeVipClassDailyRoutineActivityType(rows[0]?.activity_type),
    startTime: String(rows[0]?.start_time || "").trim(),
    endTime: String(rows[0]?.end_time || "").trim()
  };
}

async function upsertVipClassDailyRoutine({
  organizationId,
  routineId = null,
  classId,
  specialistId,
  dayOfWeek,
  activityType,
  startTime,
  endTime,
  mandatoryExercises = "",
  note = "",
  updatedBy
}) {
  await ensureVipClassDailyRoutinesSchema();

  const normalizedRoutineId = Number.parseInt(String(routineId || "").trim(), 10) || 0;
  const normalizedClassId = Number.parseInt(String(classId || "").trim(), 10) || 0;
  const normalizedSpecialistId = Number.parseInt(String(specialistId || "").trim(), 10) || 0;
  const normalizedDayOfWeek = normalizeVipDailyRoutineDayOfWeek(dayOfWeek);
  const normalizedActivityType = normalizeVipClassDailyRoutineActivityType(activityType);
  const normalizedStartTime = String(startTime || "").trim();
  const normalizedEndTime = String(endTime || "").trim();
  const normalizedMandatoryExercises = String(mandatoryExercises || "").trim();
  const normalizedNote = String(note || "").trim();

  if (
    !normalizedClassId
    || !normalizedDayOfWeek
    || !normalizedActivityType
    || !normalizedStartTime
    || !normalizedEndTime
  ) {
    return null;
  }

  if (normalizedRoutineId > 0) {
    const { rows } = await pool.query(
      `WITH target_class AS (
         SELECT va.id
           FROM vip_class_teacher_assignments va
           JOIN organizations o ON o.id = va.organization_id
          WHERE va.organization_id = $1
            AND va.id = $3
            AND o.is_active = TRUE
          LIMIT 1
       ),
       updated AS (
         UPDATE vip_class_daily_routines r
           SET class_assignment_id = tc.id,
                specialist_user_id = $4::integer,
                day_of_week = $5::smallint,
                activity_type = $6::text,
                start_time = $7::time,
                end_time = $8::time,
                note = NULLIF($9::text, ''),
                mandatory_exercises = NULLIF($10::text, ''),
                updated_by = $11::integer,
                updated_at = CURRENT_TIMESTAMP
           FROM target_class tc
          WHERE r.organization_id = $1
            AND r.id = $2
          RETURNING r.*
       )
       SELECT
         u.id::text AS id,
         u.class_assignment_id::text AS class_assignment_id,
         vcta.class_name,
         vcta.teacher_user_id::text AS teacher_user_id,
         COALESCE(NULLIF(TRIM(teacher_u.full_name), ''), NULLIF(TRIM(teacher_u.username), ''), '') AS teacher_name,
          u.specialist_user_id::text AS specialist_user_id,
          COALESCE(NULLIF(TRIM(specialist_u.full_name), ''), NULLIF(TRIM(specialist_u.username), ''), CONCAT('User #', u.specialist_user_id::text)) AS specialist_name,
          CASE
            WHEN u.specialist_user_id IS NOT NULL THEN COALESCE(
              NULLIF(
                TRIM(CONCAT_WS(' ', NULLIF(TRIM(specialist_p.label), ''), NULLIF(TRIM(specialist_r.label), ''))),
                ''
              ),
              'Specialist'
            )
            ELSE ''
          END AS specialist_role,
          (
            SELECT COUNT(*)
              FROM vip_client_tutor_assignments vta
             WHERE vta.organization_id = $1
               AND vta.class_assignment_id = u.class_assignment_id
          )::integer AS children_count,
          u.day_of_week,
          u.activity_type,
          TO_CHAR(u.start_time, 'HH24:MI') AS start_time,
          TO_CHAR(u.end_time, 'HH24:MI') AS end_time,
          u.mandatory_exercises,
          u.note,
          u.created_by::text AS created_by,
          u.updated_by::text AS updated_by,
          u.created_at,
          u.updated_at
        FROM updated u
        JOIN vip_class_teacher_assignments vcta
          ON vcta.organization_id = $1
         AND vcta.id = u.class_assignment_id
        LEFT JOIN users teacher_u
          ON teacher_u.id = vcta.teacher_user_id
         AND teacher_u.organization_id = $1
        LEFT JOIN users specialist_u
          ON specialist_u.id = u.specialist_user_id
         AND specialist_u.organization_id = $1
        LEFT JOIN role_options specialist_r
          ON specialist_r.id = specialist_u.role_id
        LEFT JOIN position_options specialist_p
          ON specialist_p.id = specialist_u.position_id`,
      [
        organizationId,
        normalizedRoutineId,
        normalizedClassId,
        normalizedSpecialistId || null,
        normalizedDayOfWeek,
        normalizedActivityType,
        normalizedStartTime,
        normalizedEndTime,
        normalizedNote,
        normalizedMandatoryExercises,
        updatedBy || null
      ]
    );

    return rows[0] || null;
  }

  const { rows } = await pool.query(
    `WITH target_class AS (
       SELECT va.id
         FROM vip_class_teacher_assignments va
         JOIN organizations o ON o.id = va.organization_id
        WHERE va.organization_id = $1
          AND va.id = $2
          AND o.is_active = TRUE
        LIMIT 1
     ),
     inserted AS (
       INSERT INTO vip_class_daily_routines (
         organization_id,
         class_assignment_id,
         specialist_user_id,
         day_of_week,
         activity_type,
         start_time,
         end_time,
         mandatory_exercises,
         note,
         created_by,
         updated_by
       )
       SELECT
         $1,
         tc.id,
         $3::integer,
         $4::smallint,
         $5::text,
         $6::time,
         $7::time,
         NULLIF($8::text, ''),
         NULLIF($9::text, ''),
         $10::integer,
         $10::integer
       FROM target_class tc
       RETURNING *
     )
     SELECT
       i.id::text AS id,
       i.class_assignment_id::text AS class_assignment_id,
       vcta.class_name,
       vcta.teacher_user_id::text AS teacher_user_id,
       COALESCE(NULLIF(TRIM(teacher_u.full_name), ''), NULLIF(TRIM(teacher_u.username), ''), '') AS teacher_name,
       i.specialist_user_id::text AS specialist_user_id,
       COALESCE(NULLIF(TRIM(specialist_u.full_name), ''), NULLIF(TRIM(specialist_u.username), ''), CONCAT('User #', i.specialist_user_id::text)) AS specialist_name,
       CASE
         WHEN i.specialist_user_id IS NOT NULL THEN COALESCE(
           NULLIF(
             TRIM(CONCAT_WS(' ', NULLIF(TRIM(specialist_p.label), ''), NULLIF(TRIM(specialist_r.label), ''))),
             ''
           ),
           'Specialist'
         )
         ELSE ''
       END AS specialist_role,
        (
          SELECT COUNT(*)
            FROM vip_client_tutor_assignments vta
           WHERE vta.organization_id = $1
             AND vta.class_assignment_id = i.class_assignment_id
        )::integer AS children_count,
        i.day_of_week,
        i.activity_type,
        TO_CHAR(i.start_time, 'HH24:MI') AS start_time,
        TO_CHAR(i.end_time, 'HH24:MI') AS end_time,
        i.mandatory_exercises,
        i.note,
        i.created_by::text AS created_by,
        i.updated_by::text AS updated_by,
        i.created_at,
        i.updated_at
      FROM inserted i
      JOIN vip_class_teacher_assignments vcta
        ON vcta.organization_id = $1
       AND vcta.id = i.class_assignment_id
      LEFT JOIN users teacher_u
        ON teacher_u.id = vcta.teacher_user_id
       AND teacher_u.organization_id = $1
      LEFT JOIN users specialist_u
        ON specialist_u.id = i.specialist_user_id
       AND specialist_u.organization_id = $1
      LEFT JOIN role_options specialist_r
        ON specialist_r.id = specialist_u.role_id
      LEFT JOIN position_options specialist_p
        ON specialist_p.id = specialist_u.position_id`,
    [
      organizationId,
      normalizedClassId,
      normalizedSpecialistId || null,
      normalizedDayOfWeek,
      normalizedActivityType,
      normalizedStartTime,
      normalizedEndTime,
      normalizedMandatoryExercises,
      normalizedNote,
      updatedBy || null
    ]
  );

  return rows[0] || null;
}

async function deleteVipClassDailyRoutine({
  organizationId,
  routineId
}) {
  await ensureVipClassDailyRoutinesSchema();
  return pool.query(
    `DELETE FROM vip_class_daily_routines
      WHERE organization_id = $1
        AND id = $2`,
    [organizationId, routineId]
  );
}

async function getVipAttendanceHistory({
  organizationId,
  fromDate = null,
  toDate = null,
  classId = null,
  teacherId = null,
  tutorId = null,
  clientId = null,
  assignedUserId = null,
  limit = 1000
}) {
  await ensureVipAttendanceSchema();
  await ensureVipAssignmentsSchema();

  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 3000) : 1000;
  const whereParts = [
    "vca.organization_id = $1",
    "o.is_active = TRUE",
    "c.is_vip = TRUE"
  ];
  const params = [organizationId];

  const normalizedFromDate = String(fromDate || "").trim();
  if (normalizedFromDate) {
    params.push(normalizedFromDate);
    whereParts.push(`vca.attendance_date >= $${params.length}::date`);
  }

  const normalizedToDate = String(toDate || "").trim();
  if (normalizedToDate) {
    params.push(normalizedToDate);
    whereParts.push(`vca.attendance_date <= $${params.length}::date`);
  }

  if (Number.isInteger(classId) && classId > 0) {
    params.push(classId);
    whereParts.push(`vcta.id = $${params.length}`);
  }

  if (Number.isInteger(teacherId) && teacherId > 0) {
    params.push(teacherId);
    whereParts.push(`vcta.teacher_user_id = $${params.length}`);
  }

  if (Number.isInteger(tutorId) && tutorId > 0) {
    params.push(tutorId);
    whereParts.push(`vta.tutor_user_id = $${params.length}`);
  }

  if (Number.isInteger(clientId) && clientId > 0) {
    params.push(clientId);
    whereParts.push(`c.id = $${params.length}`);
  }

  const normalizedAssignedUserId = Number.parseInt(String(assignedUserId || "").trim(), 10);
  if (Number.isInteger(normalizedAssignedUserId) && normalizedAssignedUserId > 0) {
    params.push(normalizedAssignedUserId);
    whereParts.push(`(
      vcta.teacher_user_id = $${params.length}
      OR vta.tutor_user_id = $${params.length}
    )`);
  }

  params.push(safeLimit);

  const { rows } = await pool.query(
    `SELECT
       vca.id::text AS id,
       vca.client_id::text AS client_id,
       c.first_name,
       c.last_name,
       c.middle_name,
       vcta.id::text AS class_id,
       vcta.class_name,
       vcta.teacher_user_id::text AS teacher_user_id,
       COALESCE(NULLIF(TRIM(teacher_u.full_name), ''), NULLIF(TRIM(teacher_u.username), ''), '') AS teacher_name,
       vta.tutor_user_id::text AS tutor_user_id,
       COALESCE(NULLIF(TRIM(tutor_u.full_name), ''), NULLIF(TRIM(tutor_u.username), ''), '') AS tutor_name,
       vca.attendance_date,
       vca.status,
       vca.arrived_at,
       vca.left_at,
       vca.note,
       vca.updated_at
      FROM vip_client_attendance vca
      JOIN clients c
        ON c.organization_id = vca.organization_id
       AND c.id = vca.client_id
      JOIN organizations o ON o.id = vca.organization_id
      LEFT JOIN vip_client_tutor_assignments vta
        ON vta.organization_id = c.organization_id
       AND vta.client_id = c.id
      LEFT JOIN vip_class_teacher_assignments vcta
        ON vcta.organization_id = vta.organization_id
       AND vcta.id = vta.class_assignment_id
      LEFT JOIN users teacher_u
        ON teacher_u.id = vcta.teacher_user_id
       AND teacher_u.organization_id = c.organization_id
      LEFT JOIN users tutor_u
        ON tutor_u.id = vta.tutor_user_id
       AND tutor_u.organization_id = c.organization_id
      WHERE ${whereParts.join(" AND ")}
      ORDER BY
        vca.attendance_date DESC,
        LOWER(c.last_name) ASC,
        LOWER(c.first_name) ASC,
        LOWER(COALESCE(c.middle_name, '')) ASC,
        vca.id DESC
      LIMIT $${params.length}`,
    params
  );

  return rows || [];
}

async function findVipClientAttendanceByDate({
  organizationId,
  clientId,
  attendanceDate
}) {
  await ensureVipAttendanceSchema();

  const normalizedClientId = Number.parseInt(String(clientId || "").trim(), 10) || 0;
  const normalizedAttendanceDate = String(attendanceDate || "").trim();
  if (!normalizedClientId || !normalizedAttendanceDate) {
    return null;
  }

  const { rows } = await pool.query(
    `SELECT
       client_id::text AS client_id,
       attendance_date,
       status
      FROM vip_client_attendance
      WHERE organization_id = $1
        AND client_id = $2
        AND attendance_date = $3::date
      LIMIT 1`,
    [organizationId, normalizedClientId, normalizedAttendanceDate]
  );

  return rows[0] || null;
}

async function findVipClassDailyRoutineById({
  organizationId,
  routineId
}) {
  await ensureVipClassDailyRoutinesSchema();

  const normalizedRoutineId = Number.parseInt(String(routineId || "").trim(), 10) || 0;
  if (!normalizedRoutineId) {
    return null;
  }

  const { rows } = await pool.query(
    `SELECT
       id::text AS id,
       class_assignment_id::text AS class_assignment_id,
       day_of_week,
       activity_type
      FROM vip_class_daily_routines
      WHERE organization_id = $1
        AND id = $2
      LIMIT 1`,
    [organizationId, normalizedRoutineId]
  );

  return rows[0] || null;
}

export async function isVipClientAssignedToUser({
  organizationId,
  clientId,
  userId
}) {
  await ensureVipAssignmentsSchema();

  const normalizedClientId = Number.parseInt(String(clientId || "").trim(), 10);
  const normalizedUserId = Number.parseInt(String(userId || "").trim(), 10);
  if (!Number.isInteger(normalizedClientId) || normalizedClientId <= 0) {
    return false;
  }
  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    return false;
  }

  const { rows } = await pool.query(
    `SELECT 1
       FROM vip_client_tutor_assignments vta
       JOIN vip_class_teacher_assignments vcta
         ON vcta.organization_id = vta.organization_id
        AND vcta.id = vta.class_assignment_id
      WHERE vta.organization_id = $1
        AND vta.client_id = $2
        AND (
          vcta.teacher_user_id = $3
          OR vta.tutor_user_id = $3
        )
      LIMIT 1`,
    [organizationId, normalizedClientId, normalizedUserId]
  );
  return rows.length > 0;
}

function normalizeSearchToken(value) {
  return String(value || "").trim().toLowerCase();
}

function isDateYmd(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

async function hasAppointmentCalendarTables() {
  if (!appointmentCalendarTablesReadyPromise) {
    appointmentCalendarTablesReadyPromise = pool.query(
      `SELECT
         to_regclass('public.appointment_settings') IS NOT NULL AS has_settings_table,
         to_regclass('public.appointment_working_hours') IS NOT NULL AS has_working_hours_table`
    )
      .then((result) => {
        const row = result?.rows?.[0] || {};
        return Boolean(row.has_settings_table) && Boolean(row.has_working_hours_table);
      })
      .catch(() => {
        appointmentCalendarTablesReadyPromise = null;
        return false;
      });
  }
  return appointmentCalendarTablesReadyPromise;
}

function getUtcDayOfWeekFromYmd(value) {
  const normalized = String(value || "").trim();
  if (!isDateYmd(normalized)) {
    return 0;
  }
  const [yearRaw, monthRaw, dayRaw] = normalized.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime())
    || date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return 0;
  }
  const utcDay = date.getUTCDay();
  return utcDay === 0 ? 7 : utcDay;
}

async function shouldBackfillVipAttendanceAbsentForDate({ organizationId, attendanceDate }) {
  const normalizedDate = String(attendanceDate || "").trim();
  if (!isDateYmd(normalizedDate)) {
    return false;
  }

  const canUseCalendarTables = await hasAppointmentCalendarTables();
  if (!canUseCalendarTables) {
    // Keep legacy behavior when appointment calendar tables are unavailable.
    return true;
  }

  const dayOfWeek = getUtcDayOfWeekFromYmd(normalizedDate);
  if (!dayOfWeek) {
    return false;
  }

  try {
    const { rows } = await pool.query(
      `WITH settings AS (
         SELECT visible_week_days
           FROM appointment_settings
          WHERE organization_id = $1
          LIMIT 1
       )
       SELECT
         COALESCE(
           (SELECT visible_week_days FROM settings),
           ARRAY[1,2,3,4,5,6]::smallint[]
         ) AS visible_week_days,
         awh.is_active,
         awh.start_time,
         awh.end_time
       FROM (SELECT 1) seed
       LEFT JOIN appointment_working_hours awh
         ON awh.organization_id = $1
        AND awh.day_of_week = $2
        AND awh.user_id IS NULL
        AND awh.rule_scope = 'weekly'
       LIMIT 1`,
      [organizationId, dayOfWeek]
    );

    const row = rows?.[0] || null;
    const visibleWeekDays = Array.isArray(row?.visible_week_days)
      ? row.visible_week_days
          .map((item) => Number.parseInt(String(item ?? "").trim(), 10))
          .filter((item) => Number.isInteger(item) && item >= 1 && item <= 7)
      : [1, 2, 3, 4, 5, 6];
    if (!visibleWeekDays.includes(dayOfWeek)) {
      return false;
    }

    const hasWorkingHoursRow = row?.is_active === true || row?.is_active === false;
    if (!hasWorkingHoursRow) {
      // Strict mode: missing working-hours row means day is not eligible for auto-backfill.
      return false;
    }

    const startTime = row?.start_time ? String(row.start_time).slice(0, 5) : "";
    const endTime = row?.end_time ? String(row.end_time).slice(0, 5) : "";
    return row.is_active === true && Boolean(startTime) && Boolean(endTime) && startTime < endTime;
  } catch {
    // Do not block attendance processing if calendar lookup fails.
    return true;
  }
}

async function backfillVipAttendanceAbsentForDate({ organizationId, attendanceDate }) {
  const normalizedDate = String(attendanceDate || "").trim();
  if (!isDateYmd(normalizedDate)) {
    return;
  }

  await pool.query(
    `INSERT INTO vip_client_attendance (
       organization_id,
       client_id,
       attendance_date,
       status,
       note
     )
     SELECT
       c.organization_id,
       c.id,
       $2::date,
       'absent',
       NULL
     FROM clients c
     JOIN organizations o ON o.id = c.organization_id
     LEFT JOIN vip_client_attendance vca
       ON vca.organization_id = c.organization_id
      AND vca.client_id = c.id
      AND vca.attendance_date = $2::date
    WHERE c.organization_id = $1
      AND c.is_vip = TRUE
      AND o.is_active = TRUE
      AND vca.id IS NULL
    ON CONFLICT (organization_id, client_id, attendance_date)
    DO NOTHING`,
    [organizationId, normalizedDate]
  );
}

async function backfillVipAttendanceLeftByWorkingHoursForDate({ organizationId, attendanceDate }) {
  const normalizedDate = String(attendanceDate || "").trim();
  if (!isDateYmd(normalizedDate)) {
    return;
  }

  const dayOfWeek = getUtcDayOfWeekFromYmd(normalizedDate);
  if (!dayOfWeek) {
    return;
  }

  await pool.query(
    `UPDATE vip_client_attendance vca
        SET left_at = CASE
              WHEN ($2::date + awh.end_time) >= vca.arrived_at
                THEN ($2::date + awh.end_time)
              ELSE vca.arrived_at
            END,
            updated_at = CURRENT_TIMESTAMP
       FROM appointment_working_hours awh
      WHERE vca.organization_id = $1
        AND awh.organization_id = vca.organization_id
       AND awh.day_of_week = $3
       AND awh.user_id IS NULL
       AND awh.rule_scope = 'weekly'
        AND awh.is_active = TRUE
        AND awh.start_time IS NOT NULL
        AND awh.end_time IS NOT NULL
        AND awh.start_time < awh.end_time
        AND vca.attendance_date = $2::date
        AND vca.status = 'present'
        AND vca.arrived_at IS NOT NULL
        AND vca.left_at IS NULL`,
    [organizationId, normalizedDate, dayOfWeek]
  );
}

export async function getClientsPage({
  organizationId,
  page,
  limit,
  search = "",
  firstName = "",
  lastName = "",
  middleName = "",
  clientId = null,
  activeOnly = false
}) {
  const whereParts = ["c.organization_id = $1", "o.is_active = TRUE"];
  const params = [organizationId];

  if (activeOnly) {
    whereParts.push("c.is_vip = TRUE");
  }

  const normalizedFirstName = normalizeSearchToken(firstName);
  if (normalizedFirstName) {
    params.push(`${normalizedFirstName}%`);
    whereParts.push(`LOWER(COALESCE(c.first_name, '')) LIKE $${params.length}`);
  }

  const normalizedLastName = normalizeSearchToken(lastName);
  if (normalizedLastName) {
    params.push(`${normalizedLastName}%`);
    whereParts.push(`LOWER(COALESCE(c.last_name, '')) LIKE $${params.length}`);
  }

  const normalizedMiddleName = normalizeSearchToken(middleName);
  if (normalizedMiddleName) {
    params.push(`${normalizedMiddleName}%`);
    whereParts.push(`LOWER(COALESCE(c.middle_name, '')) LIKE $${params.length}`);
  }

  if (Number.isInteger(clientId) && clientId > 0) {
    params.push(clientId);
    whereParts.push(`c.id = $${params.length}`);
  }

  const normalizedSearch = normalizeSearchToken(search);
  if (normalizedSearch) {
    const isNumericSearch = /^\d+$/.test(normalizedSearch);
    const usePrefixOnly = normalizedSearch.length < 4;
    params.push(`${normalizedSearch}%`);
    const prefixParamIndex = params.length;
    let numericSearchParamIndex = 0;
    if (isNumericSearch) {
      params.push(Number.parseInt(normalizedSearch, 10));
      numericSearchParamIndex = params.length;
    }

    if (usePrefixOnly) {
      whereParts.push(`(
        LOWER(COALESCE(c.first_name, '')) LIKE $${prefixParamIndex}
        OR LOWER(COALESCE(c.last_name, '')) LIKE $${prefixParamIndex}
        OR LOWER(COALESCE(c.middle_name, '')) LIKE $${prefixParamIndex}
        OR COALESCE(c.phone_number, '') LIKE $${prefixParamIndex}
        ${numericSearchParamIndex ? `OR c.id = $${numericSearchParamIndex}` : ""}
      )`);
    } else {
      params.push(`%${normalizedSearch}%`);
      const containsParamIndex = params.length;
      whereParts.push(`(
        LOWER(COALESCE(c.first_name, '')) LIKE $${prefixParamIndex}
        OR LOWER(COALESCE(c.last_name, '')) LIKE $${prefixParamIndex}
        OR LOWER(COALESCE(c.middle_name, '')) LIKE $${prefixParamIndex}
        OR COALESCE(c.phone_number, '') LIKE $${prefixParamIndex}
        OR LOWER(COALESCE(c.tg_mail, '')) LIKE $${containsParamIndex}
        OR LOWER(COALESCE(c.note, '')) LIKE $${containsParamIndex}
        ${numericSearchParamIndex ? `OR c.id = $${numericSearchParamIndex}` : ""}
      )`);
    }
  }

  const whereSql = `WHERE ${whereParts.join(" AND ")}`;
  const requestedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const limitParamRef = `$${params.length + 1}`;
  const pageParamRef = `$${params.length + 2}`;
  const rowsResult = await pool.query(
    `WITH filtered_clients AS (
       SELECT
         c.id::text AS id,
         c.id AS _sort_client_id,
         c.organization_id::text AS organization_id,
         c.first_name,
         c.last_name,
         c.middle_name,
         c.birthday,
         c.phone_number,
         c.tg_mail,
         c.is_vip,
         c.created_by::text AS created_by,
         c.updated_by::text AS updated_by,
         COALESCE(
           NULLIF(TRIM(u.full_name), ''),
           NULLIF(TRIM(u.username), ''),
           c.created_by::text
         ) AS created_by_name,
         COALESCE(
           NULLIF(TRIM(uu.full_name), ''),
           NULLIF(TRIM(uu.username), ''),
           c.updated_by::text
         ) AS updated_by_name,
         c.created_at,
         c.updated_at,
         c.note
        FROM clients c
        JOIN organizations o ON o.id = c.organization_id
        LEFT JOIN users u ON u.id = c.created_by
         AND u.organization_id = c.organization_id
        LEFT JOIN users uu ON uu.id = c.updated_by
         AND uu.organization_id = c.organization_id
        ${whereSql}
     ),
     meta AS (
       SELECT
         COUNT(*)::int AS total,
         GREATEST(1, CEIL(COUNT(*)::numeric / ${limitParamRef})::int) AS total_pages
        FROM filtered_clients
     )
     SELECT
       meta.total,
       meta.total_pages,
       paged.*
      FROM meta
      LEFT JOIN LATERAL (
        SELECT *
          FROM filtered_clients
         ORDER BY created_at DESC, _sort_client_id DESC
         LIMIT ${limitParamRef}
        OFFSET CASE
          WHEN meta.total = 0 THEN 0
          WHEN ${pageParamRef} < 1 THEN 0
          WHEN ${pageParamRef} > meta.total_pages THEN (meta.total_pages - 1) * ${limitParamRef}
          ELSE (${pageParamRef} - 1) * ${limitParamRef}
        END
      ) paged ON TRUE`,
    [...params, limit, requestedPage]
  );

  return buildPagedRowsResult(rowsResult.rows, {
    limit,
    requestedPage,
    omitKeys: ["_sort_client_id"]
  });
}

async function getClientSummaryById({
  organizationId,
  clientId
}) {
  const { rows } = await pool.query(
    `SELECT
       c.id::text AS id,
       c.organization_id::text AS organization_id,
       c.first_name,
       c.last_name,
       c.middle_name,
       c.birthday,
       c.is_vip,
       c.created_at,
       c.updated_at
      FROM clients c
      JOIN organizations o ON o.id = c.organization_id
     WHERE c.organization_id = $1
       AND c.id = $2
       AND o.is_active = TRUE
     LIMIT 1`,
    [organizationId, clientId]
  );

  return rows[0] || null;
}

export async function searchClientsForSchedule({
  organizationId,
  clientId = null,
  firstName = "",
  lastName = "",
  middleName = "",
  query = "",
  limit = 50
}) {
  const whereParts = [
    "c.organization_id = $1",
    "o.is_active = TRUE"
  ];
  const params = [organizationId];
  const normalizedFirstName = normalizeSearchToken(firstName);
  if (normalizedFirstName) {
    params.push(`${normalizedFirstName}%`);
    whereParts.push(`LOWER(COALESCE(c.first_name, '')) LIKE $${params.length}`);
  }

  const normalizedLastName = normalizeSearchToken(lastName);
  if (normalizedLastName) {
    params.push(`${normalizedLastName}%`);
    whereParts.push(`LOWER(COALESCE(c.last_name, '')) LIKE $${params.length}`);
  }

  const normalizedMiddleName = normalizeSearchToken(middleName);
  if (normalizedMiddleName) {
    params.push(`${normalizedMiddleName}%`);
    whereParts.push(`LOWER(COALESCE(c.middle_name, '')) LIKE $${params.length}`);
  }

  const normalizedClientId = Number.parseInt(String(clientId || "").trim(), 10);
  if (Number.isInteger(normalizedClientId) && normalizedClientId > 0) {
    params.push(normalizedClientId);
    whereParts.push(`c.id = $${params.length}`);
  }

  const normalizedQuery = normalizeSearchToken(query);
  if (normalizedQuery) {
    const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
    queryTokens.forEach((token) => {
      params.push(`${token}%`);
      const prefixParamRef = `$${params.length}`;
      const tokenConditions = [
        `LOWER(COALESCE(c.first_name, '')) LIKE ${prefixParamRef}`,
        `LOWER(COALESCE(c.last_name, '')) LIKE ${prefixParamRef}`,
        `LOWER(COALESCE(c.middle_name, '')) LIKE ${prefixParamRef}`
      ];

      if (/^\d+$/.test(token)) {
        params.push(`${token}%`);
        tokenConditions.push(`c.id::text LIKE $${params.length}`);
      }

      whereParts.push(`(${tokenConditions.join(" OR ")})`);
    });
  }

  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 50;
  params.push(safeLimit);

  const { rows } = await pool.query(
    `SELECT
       c.id::text AS id,
       c.organization_id::text AS organization_id,
       c.first_name,
       c.last_name,
       c.middle_name,
       c.birthday,
       c.phone_number,
       c.tg_mail,
       c.is_vip,
       c.created_by::text AS created_by,
       c.updated_by::text AS updated_by,
       COALESCE(
         NULLIF(TRIM(cu.full_name), ''),
         NULLIF(TRIM(cu.username), ''),
         c.created_by::text
       ) AS created_by_name,
       COALESCE(
         NULLIF(TRIM(uu.full_name), ''),
         NULLIF(TRIM(uu.username), ''),
         c.updated_by::text
       ) AS updated_by_name,
       c.note,
       NULL::date AS attendance_date,
       NULL::text AS attendance_status,
       NULL::timestamp AS arrived_at,
       NULL::timestamp AS left_at,
       NULL::text AS attendance_note
      FROM clients c
      JOIN organizations o ON o.id = c.organization_id
      LEFT JOIN users cu ON cu.id = c.created_by
       AND cu.organization_id = c.organization_id
      LEFT JOIN users uu ON uu.id = c.updated_by
       AND uu.organization_id = c.organization_id
     WHERE ${whereParts.join("\n       AND ")}
     ORDER BY
       LOWER(c.last_name) ASC,
       LOWER(c.first_name) ASC,
       LOWER(COALESCE(c.middle_name, '')) ASC,
       c.id ASC
     LIMIT $${params.length}`,
    params
  );

  return rows || [];
}

async function upsertVipClientAttendance({
  organizationId,
  clientId,
  attendanceDate,
  status,
  note = "",
  markLeft = false,
  arrivedAt = null,
  leftAt = null,
  updatedBy
}) {
  await ensureVipAttendanceSchema();

  const normalizedStatus = normalizeSearchToken(status) === "present"
    ? "present"
    : "absent";
  const normalizedNote = String(note || "").trim();
  const normalizedMarkLeft = markLeft === true;
  const normalizedArrivedAt = String(arrivedAt || "").trim() || null;
  const normalizedLeftAt = String(leftAt || "").trim() || null;
  const attendanceNowExpression = "TIMEZONE('Asia/Tashkent', NOW())";

  const { rows } = await pool.query(
    `WITH target_client AS (
       SELECT c.id
         FROM clients c
         JOIN organizations o ON o.id = c.organization_id
        WHERE c.organization_id = $1
          AND c.id = $2
          AND c.is_vip = TRUE
          AND o.is_active = TRUE
        LIMIT 1
     ),
     upserted AS (
       INSERT INTO vip_client_attendance (
         organization_id,
         client_id,
         attendance_date,
         status,
         arrived_at,
         left_at,
         note,
         created_by,
         updated_by
       )
       SELECT
         $1,
         tc.id,
         $3::date,
         $4::text,
         CASE
           WHEN $4::text = 'present'
             THEN COALESCE($8::timestamp, ${attendanceNowExpression})
           ELSE NULL
         END,
         CASE
           WHEN $4::text = 'present'
             THEN CASE
               WHEN $9::timestamp IS NOT NULL THEN $9::timestamp
               WHEN $7::boolean THEN ${attendanceNowExpression}
               ELSE NULL
             END
           ELSE NULL
         END,
         NULLIF($5::text, ''),
         $6,
         $6
       FROM target_client tc
       ON CONFLICT (organization_id, client_id, attendance_date)
       DO UPDATE
         SET status = EXCLUDED.status,
             arrived_at = CASE
               WHEN EXCLUDED.status = 'present'
                 THEN COALESCE($8::timestamp, vip_client_attendance.arrived_at, EXCLUDED.arrived_at)
               ELSE NULL
             END,
             left_at = CASE
               WHEN EXCLUDED.status = 'present'
                 THEN CASE
                   WHEN $9::timestamp IS NOT NULL THEN $9::timestamp
                   WHEN $7::boolean THEN ${attendanceNowExpression}
                   WHEN $8::timestamp IS NOT NULL THEN NULL
                   ELSE vip_client_attendance.left_at
                 END
               ELSE NULL
             END,
             note = NULLIF(EXCLUDED.note, ''),
             updated_by = EXCLUDED.updated_by,
             updated_at = CURRENT_TIMESTAMP
       RETURNING
         client_id::text AS client_id,
         attendance_date,
         status,
         arrived_at,
         left_at,
         note
     ),
     appointment_targets AS (
       SELECT
         s.organization_id,
         s.id AS appointment_schedule_id,
         s.status AS previous_status,
         s.appointment_date,
         s.start_time,
         s.end_time
       FROM appointment_schedules s
       JOIN upserted u
         ON u.status = 'absent'
        AND s.organization_id = $1
        AND s.client_id = u.client_id::integer
        AND s.appointment_date = u.attendance_date
        AND u.attendance_date = TIMEZONE('Asia/Tashkent', NOW())::date
       WHERE s.status IN ('pending', 'confirmed')
     ),
     updated_appointments AS (
       UPDATE appointment_schedules s
          SET status = 'no-show',
              updated_by = $6,
              updated_at = CURRENT_TIMESTAMP
         FROM appointment_targets t
        WHERE s.organization_id = t.organization_id
          AND s.id = t.appointment_schedule_id
       RETURNING
         s.organization_id,
         s.id
     ),
     history_inserted AS (
       INSERT INTO appointment_status_history (
         organization_id,
         appointment_schedule_id,
         event_type,
         previous_status,
         next_status,
         changed_fields,
         details,
         changed_by
       )
       SELECT
         t.organization_id,
         t.appointment_schedule_id,
         'status-changed',
         t.previous_status,
         'no-show',
         ARRAY['status']::text[],
         jsonb_build_object(
           'source', 'vip-attendance',
           'reason', 'absent-auto-no-show',
           'attendanceDate', t.appointment_date,
           'startTime', t.start_time,
           'endTime', t.end_time
         ),
         $6::integer
       FROM appointment_targets t
       JOIN updated_appointments ua
         ON ua.organization_id = t.organization_id
        AND ua.id = t.appointment_schedule_id
     )
     SELECT * FROM upserted`,
    [
      organizationId,
      clientId,
      attendanceDate,
      normalizedStatus,
      normalizedNote,
      updatedBy || null,
      normalizedMarkLeft,
      normalizedArrivedAt,
      normalizedLeftAt
    ]
  );

  return rows[0] || null;
}

async function upsertVipTutorAssignment({
  organizationId,
  clientId,
  classAssignmentId,
  tutorUserId,
  updatedBy
}) {
  await ensureVipAssignmentsSchema();

  const normalizedClassAssignmentId = Number.parseInt(String(classAssignmentId || "").trim(), 10) || 0;
  const normalizedTutorUserId = Number.parseInt(String(tutorUserId || "").trim(), 10) || 0;

  if (!normalizedClassAssignmentId || !normalizedTutorUserId) {
    return null;
  }

  const { rows } = await pool.query(
    `WITH target_client AS (
       SELECT c.id
         FROM clients c
         JOIN organizations o ON o.id = c.organization_id
        WHERE c.organization_id = $1
          AND c.id = $2
          AND c.is_vip = TRUE
          AND o.is_active = TRUE
        LIMIT 1
     ),
     target_class AS (
       SELECT
         vcta.id
       FROM vip_class_teacher_assignments vcta
       JOIN organizations o ON o.id = vcta.organization_id
       WHERE vcta.organization_id = $1
         AND vcta.id = $3
         AND o.is_active = TRUE
       LIMIT 1
     ),
     previous_assignment AS (
       SELECT
         vta.client_id,
         vta.class_assignment_id,
         vta.tutor_user_id,
         vta.created_by,
         vta.updated_by,
         vta.created_at,
         vta.updated_at
       FROM vip_client_tutor_assignments vta
       JOIN target_client tc ON tc.id = vta.client_id
       WHERE vta.organization_id = $1
       LIMIT 1
     ),
     upserted AS (
       INSERT INTO vip_client_tutor_assignments (
         organization_id,
         client_id,
         class_assignment_id,
         tutor_user_id,
         created_by,
         updated_by
       )
       SELECT
         $1,
         tc.id,
         tcl.id,
         $4::integer,
         $5::integer,
         $5::integer
       FROM target_client tc
       JOIN target_class tcl ON TRUE
       ON CONFLICT (organization_id, client_id)
       DO UPDATE
         SET class_assignment_id = EXCLUDED.class_assignment_id,
             tutor_user_id = EXCLUDED.tutor_user_id,
             updated_by = EXCLUDED.updated_by,
             updated_at = CURRENT_TIMESTAMP
       RETURNING
         client_id,
         class_assignment_id,
         tutor_user_id,
         created_by,
         created_at,
         updated_by,
         updated_at
     ),
     history_inserted AS (
       INSERT INTO vip_client_tutor_assignment_history (
         organization_id,
         client_id,
         class_assignment_id,
         tutor_user_id,
         assigned_by,
         assigned_at,
         changed_by,
         changed_at
       )
       SELECT
         $1,
         u.client_id,
         u.class_assignment_id,
         u.tutor_user_id,
         COALESCE(pa.updated_by, pa.created_by, $5::integer),
         COALESCE(pa.updated_at, pa.created_at, CURRENT_TIMESTAMP),
         $5::integer,
         CURRENT_TIMESTAMP
       FROM upserted u
       LEFT JOIN previous_assignment pa
         ON pa.client_id = u.client_id
       WHERE
         pa.client_id IS NULL
         OR pa.class_assignment_id IS DISTINCT FROM u.class_assignment_id
         OR pa.tutor_user_id IS DISTINCT FROM u.tutor_user_id
       RETURNING id
     )
     SELECT
       u.client_id::text AS client_id,
       u.class_assignment_id::text AS class_assignment_id,
       vcta.class_name,
       vcta.teacher_user_id::text AS teacher_user_id,
       COALESCE(NULLIF(TRIM(tu.full_name), ''), NULLIF(TRIM(tu.username), ''), '') AS teacher_name,
       u.tutor_user_id::text AS tutor_user_id,
       COALESCE(NULLIF(TRIM(tru.full_name), ''), NULLIF(TRIM(tru.username), ''), '') AS tutor_name,
       COALESCE(u.updated_by, u.created_by)::text AS updated_by,
       COALESCE(NULLIF(TRIM(cu.full_name), ''), NULLIF(TRIM(cu.username), ''), '') AS updated_by_name,
       u.created_at,
       u.updated_at
     FROM upserted u
     LEFT JOIN vip_class_teacher_assignments vcta
       ON vcta.organization_id = $1
      AND vcta.id = u.class_assignment_id
     LEFT JOIN users tu
       ON tu.id = vcta.teacher_user_id
      AND tu.organization_id = $1
     LEFT JOIN users tru
       ON tru.id = u.tutor_user_id
      AND tru.organization_id = $1
     LEFT JOIN users cu
       ON cu.id = COALESCE(u.updated_by, u.created_by)
      AND cu.organization_id = $1`,
    [
      organizationId,
      clientId,
      normalizedClassAssignmentId,
      normalizedTutorUserId,
      updatedBy || null
    ]
  );

  return rows[0] || null;
}

async function resetVipClientAttendanceByDate({
  organizationId,
  clientId,
  attendanceDate
}) {
  await ensureVipAttendanceSchema();

  const { rows } = await pool.query(
    `WITH target_client AS (
       SELECT c.id
         FROM clients c
         JOIN organizations o ON o.id = c.organization_id
        WHERE c.organization_id = $1
          AND c.id = $2
          AND c.is_vip = TRUE
          AND o.is_active = TRUE
        LIMIT 1
     ),
     deleted AS (
       DELETE FROM vip_client_attendance vca
        USING target_client tc
        WHERE vca.organization_id = $1
          AND vca.client_id = tc.id
          AND vca.attendance_date = $3::date
        RETURNING 1
     )
     SELECT
       tc.id::text AS client_id,
       $3::date AS attendance_date,
       EXISTS (SELECT 1 FROM deleted) AS deleted
     FROM target_client tc`,
    [organizationId, clientId, attendanceDate]
  );

  return rows[0] || null;
}

export async function createClient({
  organizationId,
  firstName,
  lastName,
  middleName,
  birthday,
  phone,
  tgMail,
  note,
  isVip = false,
  createdBy
}) {
  const createSql = `INSERT INTO clients (
    organization_id,
    first_name,
    last_name,
    middle_name,
    birthday,
    phone_number,
    tg_mail,
    is_vip,
    created_by,
    updated_by,
    note
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  RETURNING
    id::text AS id,
    organization_id::text AS organization_id,
    first_name,
    last_name,
    middle_name,
    birthday,
    phone_number,
    tg_mail,
    is_vip,
    created_by::text AS created_by,
    updated_by::text AS updated_by,
    created_at,
    updated_at,
    note`;

  const createParams = [
    organizationId,
    firstName,
    lastName,
    middleName || null,
    birthday,
    phone || null,
    tgMail || null,
    Boolean(isVip),
    createdBy || null,
    createdBy || null,
    note || null
  ];

  async function runInsert() {
    const { rows } = await pool.query(createSql, createParams);
    return rows[0] || null;
  }

  try {
    return await runInsert();
  } catch (error) {
    const isClientPkConflict = (
      error?.code === "23505"
      && String(error?.constraint || "").toLowerCase() === "clients_pkey"
    );
    if (!isClientPkConflict) {
      throw error;
    }

    // Auto-heal when clients sequence is behind max(id), then retry once.
    await pool.query(
      `SELECT setval(
         pg_get_serial_sequence('clients', 'id'),
         GREATEST(COALESCE((SELECT MAX(id) FROM clients), 999), 999),
         true
       )`
    );
    return runInsert();
  }
}

export async function findDuplicateClientByName({
  organizationId,
  firstName,
  lastName,
  middleName,
  excludeClientId = null
}) {
  const normalizedFirstName = normalizeSearchToken(firstName);
  const normalizedLastName = normalizeSearchToken(lastName);
  const normalizedMiddleName = normalizeSearchToken(middleName);

  if (!normalizedFirstName || !normalizedLastName) {
    return null;
  }

  const params = [
    organizationId,
    normalizedFirstName,
    normalizedLastName,
    normalizedMiddleName
  ];
  let excludeClause = "";
  const normalizedExcludeClientId = Number.parseInt(String(excludeClientId || ""), 10);
  if (Number.isInteger(normalizedExcludeClientId) && normalizedExcludeClientId > 0) {
    params.push(normalizedExcludeClientId);
    excludeClause = `AND c.id <> $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT
       c.id::text AS id,
       c.first_name,
       c.last_name,
       c.middle_name
      FROM clients c
      WHERE c.organization_id = $1
        AND LOWER(TRIM(c.first_name)) = $2
        AND LOWER(TRIM(c.last_name)) = $3
        AND LOWER(TRIM(COALESCE(c.middle_name, ''))) = $4
        ${excludeClause}
      LIMIT 1`,
    params
  );

  return rows[0] || null;
}

export async function updateClientById({
  id,
  organizationId,
  firstName,
  lastName,
  middleName,
  birthday,
  phone,
  tgMail,
  note,
  isVip = false,
  updatedBy
}) {
  const params = [
    firstName,
    lastName,
    middleName || null,
    birthday,
    phone || null,
    tgMail || null,
    note || null,
    Boolean(isVip),
    updatedBy || null,
    id,
    organizationId
  ];

  const { rows } = await pool.query(
    `WITH target_client AS (
       SELECT c.id, c.is_vip AS was_vip
         FROM clients c
        WHERE c.id = $10
          AND c.organization_id = $11
     ),
     updated_client AS (
       UPDATE clients c
          SET first_name = $1,
              last_name = $2,
              middle_name = $3,
              birthday = $4,
              phone_number = $5,
              tg_mail = $6,
              note = $7,
              is_vip = $8,
              updated_by = $9,
              updated_at = CURRENT_TIMESTAMP
        FROM target_client tc
        WHERE c.id = $10
          AND c.organization_id = $11
          AND c.id = tc.id
        RETURNING
          c.id::text AS id,
          c.organization_id::text AS organization_id,
          c.first_name,
          c.last_name,
          c.middle_name,
          c.birthday,
          c.phone_number,
          c.tg_mail,
          c.is_vip,
          c.created_by::text AS created_by,
          c.updated_by::text AS updated_by,
          c.created_at,
          c.updated_at,
          c.note
     ),
     deleted_client_appointments AS (
       DELETE FROM appointment_schedules s
        USING target_client tc
        WHERE $8::boolean = FALSE
          AND tc.was_vip IS TRUE
          AND s.organization_id = $11
          AND s.client_id = $10
          AND s.client_id = tc.id
          AND s.status = 'pending'
          AND s.appointment_date >= TIMEZONE('Asia/Tashkent', NOW())::date
          AND NOT EXISTS (
            SELECT 1
              FROM finance_tickets ft
             WHERE ft.organization_id = s.organization_id
               AND ft.appointment_schedule_id = s.id
          )
          AND EXISTS (SELECT 1 FROM updated_client)
       RETURNING s.*
     ),
     deleted_client_appointment_rows AS (
       SELECT
         d.id,
         d.organization_id,
         d.specialist_id,
         d.client_id,
         d.appointment_date::text AS appointment_date,
         COALESCE(TO_CHAR(d.start_time, 'HH24:MI'), '') AS start_time,
         COALESCE(TO_CHAR(d.end_time, 'HH24:MI'), '') AS end_time,
         d.service_name,
         d.status,
         d.note,
         uc.first_name,
         uc.last_name,
         uc.middle_name,
         COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), 'Specialist #' || d.specialist_id::text) AS specialist_name
        FROM deleted_client_appointments d
        JOIN updated_client uc
          ON uc.id::integer = d.client_id
         AND uc.organization_id::integer = d.organization_id
        LEFT JOIN users u
          ON u.id = d.specialist_id
         AND u.organization_id = d.organization_id
     ),
     history_inserted AS (
       INSERT INTO appointment_status_history (
         organization_id,
         appointment_schedule_id,
         event_type,
         previous_status,
         next_status,
         changed_fields,
         details,
         changed_by
       )
       SELECT
         d.organization_id,
         d.id,
         'deleted',
         d.status,
         NULL,
         ARRAY['deleted']::text[],
         jsonb_build_object(
           'source', 'client-deactivated',
           'before', jsonb_build_object(
             'specialistId', d.specialist_id,
             'clientId', d.client_id,
             'appointmentDate', d.appointment_date,
             'startTime', d.start_time,
             'endTime', d.end_time,
             'status', d.status
           ),
           'after', NULL
         ),
         $9::integer
       FROM deleted_client_appointments d
     )
     SELECT
       updated_client.*,
       (SELECT COUNT(*)::integer FROM deleted_client_appointments) AS deleted_appointment_count,
       COALESCE(
         (
           SELECT jsonb_agg(to_jsonb(dar) ORDER BY dar.appointment_date ASC, dar.start_time ASC, dar.id ASC)
             FROM deleted_client_appointment_rows dar
         ),
         '[]'::jsonb
       ) AS deleted_appointments
      FROM updated_client`,
    params
  );

  const row = rows[0] || null;
  if (row) {
    clearAppointmentPlannerReportFilterCaches();
    const clientLessonsDeletedNotification = buildClientLessonsDeletedNotification({
      organizationId,
      clientName: [lastName, firstName, middleName].filter(Boolean).join(" "),
      items: row.deleted_appointments
    });
    await sendClientLessonsDeletedNotification(clientLessonsDeletedNotification);
  }
  return row;
}

export async function deleteClientById({ id, organizationId }) {
  return pool.query(
    "DELETE FROM clients WHERE id = $1 AND organization_id = $2",
    [id, organizationId]
  );
}
