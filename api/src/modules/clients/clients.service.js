import pool from "../../config/db.js";
import { getTodayYmd } from "../../lib/date.js";

let vipAttendanceSchemaInitPromise = null;
let vipAssignmentsSchemaInitPromise = null;
let vipClassDailyRoutinesSchemaInitPromise = null;
let appointmentCalendarTablesReadyPromise = null;

const VIP_CLASS_DAILY_ROUTINE_ACTIVITY_SET = new Set(["lesson", "sleep", "meal", "other"]);

async function ensureVipAttendanceSchema() {
  if (!vipAttendanceSchemaInitPromise) {
    vipAttendanceSchemaInitPromise = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS vip_client_attendance (
           id BIGSERIAL PRIMARY KEY,
           organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
           client_id INTEGER NOT NULL,
           attendance_date DATE NOT NULL,
           status VARCHAR(16) NOT NULL DEFAULT 'absent'
             CHECK (status IN ('present', 'absent')),
           arrived_at TIMESTAMP,
           left_at TIMESTAMP,
           note VARCHAR(255),
           created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
           updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
           created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
           CONSTRAINT fk_vip_client_attendance_client_org
             FOREIGN KEY (organization_id, client_id)
             REFERENCES clients(organization_id, id) ON DELETE CASCADE,
           CONSTRAINT uq_vip_client_attendance_client_date
             UNIQUE (organization_id, client_id, attendance_date),
           CHECK (
             (status = 'present' AND arrived_at IS NOT NULL)
             OR
             (status = 'absent' AND arrived_at IS NULL AND left_at IS NULL)
           ),
           CHECK (left_at IS NULL OR arrived_at IS NULL OR left_at >= arrived_at)
         )`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_vip_client_attendance_org_date_client
           ON vip_client_attendance (organization_id, attendance_date, client_id)`
      );
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
      await pool.query(
        `CREATE TABLE IF NOT EXISTS vip_class_teacher_assignments (
           id BIGSERIAL PRIMARY KEY,
           organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
           class_name VARCHAR(64) NOT NULL,
           teacher_user_id INTEGER NOT NULL,
           created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
           updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
           created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
           CONSTRAINT fk_vip_class_teacher_assignments_teacher_org
             FOREIGN KEY (organization_id, teacher_user_id)
             REFERENCES users(organization_id, id) ON DELETE RESTRICT,
           CONSTRAINT uq_vip_class_teacher_assignments_class_org
             UNIQUE (organization_id, class_name),
           CONSTRAINT uq_vip_class_teacher_assignments_org_id
             UNIQUE (organization_id, id)
         )`
      );
      await pool.query(
        `CREATE TABLE IF NOT EXISTS vip_client_tutor_assignments (
           id BIGSERIAL PRIMARY KEY,
           organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
           client_id INTEGER NOT NULL,
           class_assignment_id BIGINT NOT NULL,
           tutor_user_id INTEGER NOT NULL,
           created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
           updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
           created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
           CONSTRAINT fk_vip_client_tutor_assignments_client_org
             FOREIGN KEY (organization_id, client_id)
             REFERENCES clients(organization_id, id) ON DELETE CASCADE,
           CONSTRAINT fk_vip_client_tutor_assignments_class_org
             FOREIGN KEY (organization_id, class_assignment_id)
             REFERENCES vip_class_teacher_assignments(organization_id, id) ON DELETE RESTRICT,
           CONSTRAINT fk_vip_client_tutor_assignments_tutor_org
             FOREIGN KEY (organization_id, tutor_user_id)
             REFERENCES users(organization_id, id) ON DELETE RESTRICT,
           CONSTRAINT uq_vip_client_tutor_assignments_client_org
             UNIQUE (organization_id, client_id)
         )`
      );
      await pool.query(
        `CREATE TABLE IF NOT EXISTS vip_class_teacher_assignment_history (
           id BIGSERIAL PRIMARY KEY,
           organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
           class_assignment_id BIGINT,
           class_name VARCHAR(64) NOT NULL,
           teacher_user_id INTEGER,
           assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
           assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
           changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
           changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
           CONSTRAINT fk_vip_class_teacher_assignment_history_class_org
             FOREIGN KEY (organization_id, class_assignment_id)
             REFERENCES vip_class_teacher_assignments(organization_id, id) ON DELETE SET NULL,
           CONSTRAINT fk_vip_class_teacher_assignment_history_teacher_org
             FOREIGN KEY (organization_id, teacher_user_id)
             REFERENCES users(organization_id, id) ON DELETE SET NULL
         )`
      );
      await pool.query(
        `CREATE TABLE IF NOT EXISTS vip_client_tutor_assignment_history (
           id BIGSERIAL PRIMARY KEY,
           organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
           client_id INTEGER NOT NULL,
           class_assignment_id BIGINT,
           tutor_user_id INTEGER NOT NULL,
           assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
           assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
           changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
           changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
           CONSTRAINT fk_vip_client_tutor_assignment_history_client_org
             FOREIGN KEY (organization_id, client_id)
             REFERENCES clients(organization_id, id) ON DELETE CASCADE,
           CONSTRAINT fk_vip_client_tutor_assignment_history_class_org
             FOREIGN KEY (organization_id, class_assignment_id)
             REFERENCES vip_class_teacher_assignments(organization_id, id) ON DELETE RESTRICT,
           CONSTRAINT fk_vip_client_tutor_assignment_history_tutor_org
             FOREIGN KEY (organization_id, tutor_user_id)
             REFERENCES users(organization_id, id) ON DELETE RESTRICT
         )`
      );
      await pool.query(
        `DO $$
         DECLARE fk_delete_rule TEXT;
         BEGIN
           IF EXISTS (
             SELECT 1
               FROM information_schema.columns c
              WHERE c.table_schema = 'public'
                AND c.table_name = 'vip_client_tutor_assignment_history'
                AND c.column_name = 'class_assignment_id'
                AND c.is_nullable = 'NO'
           ) THEN
             ALTER TABLE vip_client_tutor_assignment_history
               ALTER COLUMN class_assignment_id DROP NOT NULL;
           END IF;

           SELECT rc.delete_rule
             INTO fk_delete_rule
             FROM information_schema.referential_constraints rc
             JOIN information_schema.table_constraints tc
               ON tc.constraint_catalog = rc.constraint_catalog
              AND tc.constraint_schema = rc.constraint_schema
              AND tc.constraint_name = rc.constraint_name
            WHERE tc.table_schema = 'public'
              AND tc.table_name = 'vip_client_tutor_assignment_history'
              AND tc.constraint_name = 'fk_vip_client_tutor_assignment_history_class_org';

           IF fk_delete_rule IS DISTINCT FROM 'RESTRICT' THEN
             IF fk_delete_rule IS NOT NULL THEN
               ALTER TABLE vip_client_tutor_assignment_history
                 DROP CONSTRAINT fk_vip_client_tutor_assignment_history_class_org;
             END IF;
             ALTER TABLE vip_client_tutor_assignment_history
               ADD CONSTRAINT fk_vip_client_tutor_assignment_history_class_org
                 FOREIGN KEY (organization_id, class_assignment_id)
                 REFERENCES vip_class_teacher_assignments(organization_id, id) ON DELETE RESTRICT;
           END IF;
         END $$`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_vip_class_teacher_assignments_org_class
           ON vip_class_teacher_assignments (organization_id, class_name, id)`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_vip_class_teacher_assignments_org_teacher
           ON vip_class_teacher_assignments (organization_id, teacher_user_id)`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_vip_class_teacher_assignment_history_org_assignment_changed
           ON vip_class_teacher_assignment_history (organization_id, class_assignment_id, changed_at DESC, id DESC)`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_vip_class_teacher_assignment_history_org_class_changed
           ON vip_class_teacher_assignment_history (organization_id, class_name, changed_at DESC, id DESC)`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_vip_client_tutor_assignments_org_class
           ON vip_client_tutor_assignments (organization_id, class_assignment_id, client_id)`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_vip_client_tutor_assignments_org_tutor
           ON vip_client_tutor_assignments (organization_id, tutor_user_id, client_id)`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_vip_client_tutor_assignment_history_org_client_changed
           ON vip_client_tutor_assignment_history (organization_id, client_id, changed_at DESC, id DESC)`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_vip_client_tutor_assignment_history_org_class_changed
           ON vip_client_tutor_assignment_history (organization_id, class_assignment_id, changed_at DESC, id DESC)`
      );
      await pool.query(
        `DO $$
         DECLARE source_assignments_table TEXT;
         BEGIN
           IF EXISTS (
             SELECT 1
               FROM information_schema.tables
              WHERE table_schema = 'public'
                AND table_name = 'vip_client_assignment_class'
           ) THEN
             source_assignments_table := 'vip_client_assignment_class';
           ELSIF EXISTS (
             SELECT 1
               FROM information_schema.tables
              WHERE table_schema = 'public'
                AND table_name = 'vip_client_assignments'
           ) THEN
             source_assignments_table := 'vip_client_assignments';
           ELSE
             source_assignments_table := NULL;
           END IF;

           IF source_assignments_table IS NOT NULL THEN
             EXECUTE format(
               $sql$
               INSERT INTO vip_class_teacher_assignments (
                 organization_id,
                 class_name,
                 teacher_user_id,
                 created_by,
                 updated_by,
                 created_at,
                 updated_at
               )
               SELECT
                 va.organization_id,
                 TRIM(va.class_name),
                 va.teacher_user_id,
                 va.created_by,
                 COALESCE(va.updated_by, va.created_by),
                 COALESCE(va.created_at, CURRENT_TIMESTAMP),
                 COALESCE(va.updated_at, va.created_at, CURRENT_TIMESTAMP)
                 FROM %I va
                WHERE NULLIF(TRIM(va.class_name), '') IS NOT NULL
                  AND va.teacher_user_id IS NOT NULL
               ON CONFLICT (organization_id, class_name)
               DO UPDATE
                 SET teacher_user_id = EXCLUDED.teacher_user_id,
                     updated_by = EXCLUDED.updated_by,
                     updated_at = CURRENT_TIMESTAMP
               $sql$,
               source_assignments_table
             );

             EXECUTE format(
               $sql$
               INSERT INTO vip_client_tutor_assignments (
                 organization_id,
                 client_id,
                 class_assignment_id,
                 tutor_user_id,
                 created_by,
                 updated_by,
                 created_at,
                 updated_at
               )
               SELECT
                 va.organization_id,
                 va.client_id,
                 vcta.id,
                 va.tutor_user_id,
                 va.created_by,
                 COALESCE(va.updated_by, va.created_by),
                 COALESCE(va.created_at, CURRENT_TIMESTAMP),
                 COALESCE(va.updated_at, va.created_at, CURRENT_TIMESTAMP)
                 FROM %I va
                 JOIN vip_class_teacher_assignments vcta
                   ON vcta.organization_id = va.organization_id
                  AND LOWER(vcta.class_name) = LOWER(TRIM(va.class_name))
                WHERE va.client_id IS NOT NULL
                  AND va.tutor_user_id IS NOT NULL
                  AND NULLIF(TRIM(va.class_name), '') IS NOT NULL
               ON CONFLICT (organization_id, client_id)
               DO UPDATE
                 SET class_assignment_id = EXCLUDED.class_assignment_id,
                     tutor_user_id = EXCLUDED.tutor_user_id,
                     updated_by = EXCLUDED.updated_by,
                     updated_at = CURRENT_TIMESTAMP
               $sql$,
               source_assignments_table
             );
           END IF;

           IF EXISTS (
             SELECT 1
               FROM information_schema.tables
              WHERE table_schema = 'public'
                AND table_name = 'vip_client_assignment_history'
           ) THEN
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
             SELECT DISTINCT
               vh.organization_id,
               vcta.id,
               TRIM(vh.class_name),
               vh.teacher_user_id,
               vh.assigned_by,
               COALESCE(vh.assigned_at, vh.changed_at, CURRENT_TIMESTAMP),
               vh.changed_by,
               COALESCE(vh.changed_at, CURRENT_TIMESTAMP)
               FROM vip_client_assignment_history vh
               LEFT JOIN vip_class_teacher_assignments vcta
                 ON vcta.organization_id = vh.organization_id
                AND LOWER(vcta.class_name) = LOWER(TRIM(vh.class_name))
              WHERE vh.teacher_user_id IS NOT NULL
                AND NULLIF(TRIM(vh.class_name), '') IS NOT NULL;

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
               vh.organization_id,
               vh.client_id,
               vcta.id,
               vh.tutor_user_id,
               vh.assigned_by,
               COALESCE(vh.assigned_at, vh.changed_at, CURRENT_TIMESTAMP),
               vh.changed_by,
               COALESCE(vh.changed_at, CURRENT_TIMESTAMP)
               FROM vip_client_assignment_history vh
               JOIN vip_class_teacher_assignments vcta
                 ON vcta.organization_id = vh.organization_id
                AND LOWER(vcta.class_name) = LOWER(TRIM(vh.class_name))
              WHERE vh.client_id IS NOT NULL
                AND vh.tutor_user_id IS NOT NULL
                AND NULLIF(TRIM(vh.class_name), '') IS NOT NULL;
           END IF;

           DROP TABLE IF EXISTS vip_client_assignment_history;
           DROP TABLE IF EXISTS vip_client_assignment_class;
           DROP TABLE IF EXISTS vip_client_assignments;
         END
         $$`
      );
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
      await pool.query(
        `CREATE TABLE IF NOT EXISTS vip_class_daily_routines (
           id BIGSERIAL PRIMARY KEY,
           organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
           class_assignment_id BIGINT NOT NULL,
           day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
           activity_type VARCHAR(16) NOT NULL CHECK (activity_type IN ('lesson', 'sleep', 'meal', 'other')),
           start_time TIME NOT NULL,
           end_time TIME NOT NULL,
           note VARCHAR(255),
           created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
           updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
           created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
           CONSTRAINT fk_vip_class_daily_routines_class_org
             FOREIGN KEY (organization_id, class_assignment_id)
             REFERENCES vip_class_teacher_assignments(organization_id, id) ON DELETE CASCADE,
           CONSTRAINT uq_vip_class_daily_routines_exact_slot
             UNIQUE (organization_id, class_assignment_id, day_of_week, start_time, end_time, activity_type),
           CHECK (start_time < end_time)
         )`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_vip_class_daily_routines_org_class_day_time
           ON vip_class_daily_routines (organization_id, class_assignment_id, day_of_week, start_time, id)`
      );
      await pool.query(
        `DROP INDEX IF EXISTS idx_vip_class_daily_routines_org_day_active`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_vip_class_daily_routines_org_day_time
           ON vip_class_daily_routines (organization_id, day_of_week, start_time, id)`
      );
      await pool.query(
        `ALTER TABLE vip_class_daily_routines
           DROP COLUMN IF EXISTS title,
           DROP COLUMN IF EXISTS is_active,
           DROP COLUMN IF EXISTS sort_order`
      );
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
      role_label: roleLabel,
      position_label: positionLabel
    };
  }

  const { userId, organizationId } = authContext;
  const { rows } = await pool.query(
    `SELECT
       u.id,
       u.role_id,
       COALESCE(r.is_admin, FALSE) AS is_admin,
       COALESCE(NULLIF(TRIM(r.label), ''), '') AS role_label,
       COALESCE(NULLIF(TRIM(p.label), ''), '') AS position_label
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
       LEFT JOIN role_options r ON r.id = u.role_id
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
        .map((keyword) => String(keyword || "").trim().toLowerCase())
        .filter(Boolean)
    : [];
  if (normalizedKeywords.length === 0) {
    return [];
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
  return rows || [];
}

export async function getVipAttendanceTeachersByOrganization(organizationId) {
  return getVipAssignableUsersByKeywords(organizationId, [
    "teacher",
    "tutor",
    "oqituvchi",
    "o'qituvchi",
    "ustoz"
  ]);
}

export async function getVipClientOptionsByOrganization({
  organizationId,
  limit = 1000
}) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 2000) : 1000;
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
  return rows || [];
}

export async function getVipAssignmentOptionsByOrganization(organizationId) {
  const [teachers, tutors] = await Promise.all([
    getVipAssignableUsersByKeywords(organizationId, [
      "teacher",
      "oqituvchi",
      "o'qituvchi",
      "ustoz"
    ]),
    getVipAssignableUsersByKeywords(organizationId, [
      "tutor",
      "assistant",
      "murabbiy"
    ])
  ]);
  return {
    teachers,
    tutors
  };
}

export async function getVipClassAssignments({
  organizationId,
  limit = 200
}) {
  await ensureVipAssignmentsSchema();

  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 200;
  const { rows } = await pool.query(
    `SELECT
       va.id::text AS id,
       va.class_name,
       va.teacher_user_id::text AS teacher_user_id,
       COALESCE(NULLIF(TRIM(tu.full_name), ''), NULLIF(TRIM(tu.username), ''), '') AS teacher_name,
       (
         SELECT COUNT(*)::int
           FROM vip_client_tutor_assignments vta
          WHERE vta.organization_id = va.organization_id
            AND vta.class_assignment_id = va.id
       ) AS children_count,
       va.created_by::text AS created_by,
       COALESCE(NULLIF(TRIM(vcu.full_name), ''), NULLIF(TRIM(vcu.username), ''), '') AS created_by_name,
       va.created_at
      FROM vip_class_teacher_assignments va
      JOIN organizations o ON o.id = va.organization_id
      LEFT JOIN users tu
        ON tu.id = va.teacher_user_id
       AND tu.organization_id = va.organization_id
      LEFT JOIN users vcu
        ON vcu.id = va.created_by
       AND vcu.organization_id = va.organization_id
      WHERE va.organization_id = $1
        AND o.is_active = TRUE
      ORDER BY
        LOWER(va.class_name) ASC,
        va.id ASC
      LIMIT $2`,
    [organizationId, safeLimit]
  );

  return rows || [];
}

export async function getVipClassAssignmentOptions({
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
      LEFT JOIN users tu
        ON tu.id = va.teacher_user_id
       AND tu.organization_id = va.organization_id
      WHERE va.organization_id = $1
        AND o.is_active = TRUE
        AND (
          $3::integer IS NULL
          OR va.teacher_user_id = $3::integer
          OR EXISTS (
            SELECT 1
              FROM vip_client_tutor_assignments vta
             WHERE vta.organization_id = va.organization_id
               AND vta.class_assignment_id = va.id
               AND vta.tutor_user_id = $3::integer
          )
        )
      ORDER BY LOWER(va.class_name) ASC, va.id ASC
      LIMIT $2`,
    [organizationId, safeLimit, normalizedAssignedUserId]
  );

  return rows || [];
}

export async function getVipClassAssignmentHistory({
  organizationId,
  classId = null,
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

export async function upsertVipClassAssignment({
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

export async function deleteVipClassAssignment({
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

export async function getVipTutorAssignments({
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

export async function getVipTutorAssignmentHistory({
  organizationId,
  clientId = null,
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

export async function getVipClassDailyRoutines({
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
       (
         SELECT COUNT(*)
           FROM vip_client_tutor_assignments vta
          WHERE vta.organization_id = r.organization_id
            AND vta.class_assignment_id = r.class_assignment_id
       )::integer AS children_count,
       r.day_of_week,
       r.activity_type,
       TO_CHAR(r.start_time, 'HH24:MI') AS start_time,
       TO_CHAR(r.end_time, 'HH24:MI') AS end_time,
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

export async function upsertVipClassDailyRoutine({
  organizationId,
  routineId = null,
  classId,
  dayOfWeek,
  activityType,
  startTime,
  endTime,
  note = "",
  updatedBy
}) {
  await ensureVipClassDailyRoutinesSchema();

  const normalizedRoutineId = Number.parseInt(String(routineId || "").trim(), 10) || 0;
  const normalizedClassId = Number.parseInt(String(classId || "").trim(), 10) || 0;
  const normalizedDayOfWeek = normalizeVipDailyRoutineDayOfWeek(dayOfWeek);
  const normalizedActivityType = normalizeVipClassDailyRoutineActivityType(activityType);
  const normalizedStartTime = String(startTime || "").trim();
  const normalizedEndTime = String(endTime || "").trim();
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
                day_of_week = $4::smallint,
                activity_type = $5::text,
                start_time = $6::time,
                end_time = $7::time,
                note = NULLIF($8::text, ''),
                updated_by = $9::integer,
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
         AND teacher_u.organization_id = $1`,
      [
        organizationId,
        normalizedRoutineId,
        normalizedClassId,
        normalizedDayOfWeek,
        normalizedActivityType,
        normalizedStartTime,
        normalizedEndTime,
        normalizedNote,
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
         day_of_week,
         activity_type,
         start_time,
         end_time,
         note,
         created_by,
         updated_by
       )
       SELECT
         $1,
         tc.id,
         $3::smallint,
         $4::text,
         $5::time,
         $6::time,
         NULLIF($7::text, ''),
         $8::integer,
         $8::integer
       FROM target_class tc
       RETURNING *
     )
     SELECT
       i.id::text AS id,
       i.class_assignment_id::text AS class_assignment_id,
       vcta.class_name,
       vcta.teacher_user_id::text AS teacher_user_id,
       COALESCE(NULLIF(TRIM(teacher_u.full_name), ''), NULLIF(TRIM(teacher_u.username), ''), '') AS teacher_name,
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
       AND teacher_u.organization_id = $1`,
    [
      organizationId,
      normalizedClassId,
      normalizedDayOfWeek,
      normalizedActivityType,
      normalizedStartTime,
      normalizedEndTime,
      normalizedNote,
      updatedBy || null
    ]
  );

  return rows[0] || null;
}

export async function deleteVipClassDailyRoutine({
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

export async function getVipAttendanceHistory({
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

function normalizeVipClassDailyRoutineActivityType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return VIP_CLASS_DAILY_ROUTINE_ACTIVITY_SET.has(normalized) ? normalized : "";
}

function normalizeVipDailyRoutineDayOfWeek(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 7) {
    return parsed;
  }
  return 0;
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
  isVip = null
}) {
  const whereParts = ["c.organization_id = $1", "o.is_active = TRUE"];
  const params = [organizationId];

  const normalizedFirstName = String(firstName || "").trim().toLowerCase();
  if (normalizedFirstName) {
    params.push(`${normalizedFirstName}%`);
    whereParts.push(`LOWER(COALESCE(c.first_name, '')) LIKE $${params.length}`);
  }

  const normalizedLastName = String(lastName || "").trim().toLowerCase();
  if (normalizedLastName) {
    params.push(`${normalizedLastName}%`);
    whereParts.push(`LOWER(COALESCE(c.last_name, '')) LIKE $${params.length}`);
  }

  const normalizedMiddleName = String(middleName || "").trim().toLowerCase();
  if (normalizedMiddleName) {
    params.push(`${normalizedMiddleName}%`);
    whereParts.push(`LOWER(COALESCE(c.middle_name, '')) LIKE $${params.length}`);
  }

  if (typeof isVip === "boolean") {
    params.push(isVip);
    whereParts.push(`c.is_vip = $${params.length}`);
  }

  const normalizedSearch = String(search || "").trim().toLowerCase();
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

  const totalResult = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM clients c
       JOIN organizations o ON o.id = c.organization_id
      ${whereSql}`,
    params
  );

  const total = Number(totalResult.rows[0]?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;

  const rowsResult = await pool.query(
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
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return {
    total,
    totalPages,
    page: safePage,
    rows: rowsResult.rows
  };
}

export async function searchClientsForSchedule({
  organizationId,
  firstName = "",
  lastName = "",
  middleName = "",
  isVip = null,
  attendanceDate = null,
  assignedUserId = null,
  limit = 50
}) {
  await ensureVipAttendanceSchema();
  await ensureVipAssignmentsSchema();

  const normalizedFirstName = normalizeSearchToken(firstName);
  const normalizedLastName = normalizeSearchToken(lastName);
  const normalizedMiddleName = normalizeSearchToken(middleName);
  const normalizedAttendanceDate = String(attendanceDate || "").trim() || null;
  const parsedAssignedUserId = Number.parseInt(String(assignedUserId || "").trim(), 10);
  const normalizedAssignedUserId = Number.isInteger(parsedAssignedUserId) && parsedAssignedUserId > 0
    ? parsedAssignedUserId
    : null;
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 50;
  const isVipOnlySearch = isVip === true;
  const canUseMyChildrenFastPath = (
    isVipOnlySearch
    && Number.isInteger(normalizedAssignedUserId)
    && normalizedAssignedUserId > 0
    && !normalizedFirstName
    && !normalizedLastName
    && !normalizedMiddleName
    && !normalizedAttendanceDate
  );

  if (canUseMyChildrenFastPath) {
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
         c.note,
         COALESCE(
           NULLIF(TRIM(cu.full_name), ''),
           NULLIF(TRIM(cu.username), ''),
           c.created_by::text
         ) AS created_by_name,
         COALESCE(NULLIF(TRIM(cr.label), ''), '') AS creator_role_label,
         COALESCE(NULLIF(TRIM(cp.label), ''), '') AS creator_position_label,
         vcta.id::text AS class_id,
         vcta.class_name AS vip_class_name,
         vcta.teacher_user_id::text AS teacher_id,
         COALESCE(NULLIF(TRIM(vat.full_name), ''), NULLIF(TRIM(vat.username), ''), '') AS teacher_name,
         vta.tutor_user_id::text AS tutor_id,
         COALESCE(NULLIF(TRIM(vatu.full_name), ''), NULLIF(TRIM(vatu.username), ''), '') AS tutor_name,
         NULL::date AS attendance_date,
         NULL::text AS attendance_status,
         NULL::timestamp AS arrived_at,
         NULL::timestamp AS left_at,
         NULL::text AS attendance_note
        FROM vip_client_tutor_assignments vta
        JOIN vip_class_teacher_assignments vcta
          ON vcta.organization_id = vta.organization_id
         AND vcta.id = vta.class_assignment_id
        JOIN clients c
          ON c.organization_id = vta.organization_id
         AND c.id = vta.client_id
        JOIN organizations o ON o.id = c.organization_id
        LEFT JOIN users cu
          ON cu.id = c.created_by
         AND cu.organization_id = c.organization_id
        LEFT JOIN role_options cr ON cr.id = cu.role_id
        LEFT JOIN position_options cp ON cp.id = cu.position_id
        LEFT JOIN users vat
          ON vat.id = vcta.teacher_user_id
         AND vat.organization_id = c.organization_id
        LEFT JOIN users vatu
          ON vatu.id = vta.tutor_user_id
         AND vatu.organization_id = c.organization_id
       WHERE vta.organization_id = $1
         AND o.is_active = TRUE
         AND c.is_vip = TRUE
         AND (
           vcta.teacher_user_id = $2
           OR vta.tutor_user_id = $2
         )
       ORDER BY
         LOWER(c.last_name) ASC,
         LOWER(c.first_name) ASC,
         LOWER(COALESCE(c.middle_name, '')) ASC,
         c.id ASC
       LIMIT $3`,
      [
        organizationId,
        normalizedAssignedUserId,
        safeLimit
      ]
    );

    return rows || [];
  }

  if (isVipOnlySearch && isDateYmd(normalizedAttendanceDate) && normalizedAttendanceDate < getTodayYmd()) {
    const shouldBackfill = await shouldBackfillVipAttendanceAbsentForDate({
      organizationId,
      attendanceDate: normalizedAttendanceDate
    });
    if (shouldBackfill) {
      await backfillVipAttendanceAbsentForDate({
        organizationId,
        attendanceDate: normalizedAttendanceDate
      });
      await backfillVipAttendanceLeftByWorkingHoursForDate({
        organizationId,
        attendanceDate: normalizedAttendanceDate
      });
    }
  }

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
       c.note,
       COALESCE(
         NULLIF(TRIM(cu.full_name), ''),
         NULLIF(TRIM(cu.username), ''),
         c.created_by::text
       ) AS created_by_name,
       COALESCE(NULLIF(TRIM(cr.label), ''), '') AS creator_role_label,
       COALESCE(NULLIF(TRIM(cp.label), ''), '') AS creator_position_label,
       vcta.id::text AS class_id,
       vcta.class_name AS vip_class_name,
       vcta.teacher_user_id::text AS teacher_id,
       COALESCE(NULLIF(TRIM(vat.full_name), ''), NULLIF(TRIM(vat.username), ''), '') AS teacher_name,
       vta.tutor_user_id::text AS tutor_id,
       COALESCE(NULLIF(TRIM(vatu.full_name), ''), NULLIF(TRIM(vatu.username), ''), '') AS tutor_name,
       vca.attendance_date,
       vca.status AS attendance_status,
       vca.arrived_at,
       vca.left_at,
       vca.note AS attendance_note
      FROM clients c
      JOIN organizations o ON o.id = c.organization_id
      LEFT JOIN users cu ON cu.id = c.created_by
       AND cu.organization_id = c.organization_id
      LEFT JOIN role_options cr ON cr.id = cu.role_id
      LEFT JOIN position_options cp ON cp.id = cu.position_id
      LEFT JOIN vip_client_tutor_assignments vta
        ON vta.organization_id = c.organization_id
       AND vta.client_id = c.id
      LEFT JOIN vip_class_teacher_assignments vcta
        ON vcta.organization_id = vta.organization_id
       AND vcta.id = vta.class_assignment_id
      LEFT JOIN users vat
        ON vat.id = vcta.teacher_user_id
       AND vat.organization_id = c.organization_id
      LEFT JOIN users vatu
        ON vatu.id = vta.tutor_user_id
       AND vatu.organization_id = c.organization_id
      LEFT JOIN vip_client_attendance vca
        ON vca.organization_id = c.organization_id
       AND vca.client_id = c.id
       AND vca.attendance_date = COALESCE($6::date, CURRENT_DATE)
     WHERE c.organization_id = $1
       AND o.is_active = TRUE
       AND ($2 = '' OR LOWER(c.first_name) LIKE $2 || '%')
       AND ($3 = '' OR LOWER(c.last_name) LIKE $3 || '%')
       AND ($4 = '' OR (c.middle_name IS NOT NULL AND LOWER(c.middle_name) LIKE $4 || '%'))
       AND ($5::boolean IS NULL OR c.is_vip = $5::boolean)
       AND (
         $8::integer IS NULL
         OR vcta.teacher_user_id = $8::integer
         OR vta.tutor_user_id = $8::integer
       )
     ORDER BY
       LOWER(c.last_name) ASC,
       LOWER(c.first_name) ASC,
       LOWER(COALESCE(c.middle_name, '')) ASC,
       c.id ASC
     LIMIT $7`,
    [
      organizationId,
      normalizedFirstName,
      normalizedLastName,
      normalizedMiddleName,
      typeof isVip === "boolean" ? isVip : null,
      normalizedAttendanceDate,
      safeLimit,
      normalizedAssignedUserId
    ]
  );

  return rows || [];
}

export async function upsertVipClientAttendance({
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

  const normalizedStatus = String(status || "").trim().toLowerCase() === "present"
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

export async function upsertVipTutorAssignment({
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

export async function resetVipClientAttendanceByDate({
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
  isVip,
  note,
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

export async function updateClientById({
  id,
  organizationId,
  firstName,
  lastName,
  middleName,
  birthday,
  phone,
  tgMail,
  isVip,
  note,
  updatedBy
}) {
  const { rows } = await pool.query(
    `UPDATE clients
        SET first_name = $1,
            last_name = $2,
            middle_name = $3,
            birthday = $4,
            phone_number = $5,
            tg_mail = $6,
            note = $7,
            is_vip = COALESCE($8, is_vip),
            updated_by = $9,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $10
        AND organization_id = $11
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
        note`,
    [
      firstName,
      lastName,
      middleName || null,
      birthday,
      phone || null,
      tgMail || null,
      note || null,
      isVip ?? null,
      updatedBy || null,
      id,
      organizationId
    ]
  );
  return rows[0] || null;
}

export async function deleteClientById({ id, organizationId }) {
  return pool.query(
    "DELETE FROM clients WHERE id = $1 AND organization_id = $2",
    [id, organizationId]
  );
}
