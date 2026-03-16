import pool from "../../config/db.js";
import { toBooleanFlag } from "../../lib/boolean.js";
import {
  isPermissionAllowedByOrgFeatures,
  normalizeAllowedFeatures
} from "../../lib/org-features.js";
import {
  normalizePermissionCode,
  normalizePermissionCodes
} from "../../lib/permission-codes.js";
import { UNIQUE_PERMISSION_DEFINITIONS } from "../../../../shared/access-registry.js";
import { PERMISSIONS } from "./users.constants.js";

const DEFAULT_PERMISSIONS_SYNC_LOCK_KEY = 41003001;

const BASE_PERMISSION_DEFINITIONS = UNIQUE_PERMISSION_DEFINITIONS.map((permission) => ({
  code: permission.code,
  label: permission.label,
  sortOrder: permission.sortOrder
}));
const BASE_PERMISSION_CODES = normalizePermissionCodes(
  BASE_PERMISSION_DEFINITIONS.map((permission) => permission.code)
);

const LEGACY_PERMISSION_CODE_MIGRATIONS = Object.freeze([
  {
    from: "clients.menu",
    to: PERMISSIONS.CLIENTS_READ
  },
  {
    from: "appointments.menu",
    to: PERMISSIONS.APPOINTMENTS_PLANNER_READ
  },
  {
    from: "appointments.menu",
    to: PERMISSIONS.APPOINTMENTS_BREAKS_READ
  },
  {
    from: "appointments.vip-clients",
    to: PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_READ
  },
  {
    from: "appointments.assignments",
    to: PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_CLASS_READ
  },
  {
    from: "appointments.assignments",
    to: PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_TUTOR_READ
  },
  {
    from: "appointments.assignments.read",
    to: PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_CLASS_READ
  },
  {
    from: "appointments.assignments.read",
    to: PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_TUTOR_READ
  },
  {
    from: "appointments.assignments.create",
    to: PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_CLASS_CREATE
  },
  {
    from: "appointments.assignments.create",
    to: PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_TUTOR_CREATE
  },
  {
    from: "appointments.assignments.update",
    to: PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_CLASS_UPDATE
  },
  {
    from: "appointments.assignments.update",
    to: PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_TUTOR_UPDATE
  },
  {
    from: "appointments.assignments.delete",
    to: PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_CLASS_DELETE
  },
  {
    from: "appointments.assignments.delete",
    to: PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_TUTOR_DELETE
  },
  {
    from: "appointments.statistics",
    to: PERMISSIONS.APPOINTMENTS_STATISTICS_CLASS_ATTENDANCE
  },
  {
    from: "appointments.statistics",
    to: PERMISSIONS.APPOINTMENTS_STATISTICS_PLANNER_REPORT
  },
  {
    from: "appointments.statistics.read",
    to: PERMISSIONS.APPOINTMENTS_STATISTICS_CLASS_ATTENDANCE
  },
  {
    from: "appointments.statistics.read",
    to: PERMISSIONS.APPOINTMENTS_STATISTICS_PLANNER_REPORT
  },
  {
    from: "appointments.notify.to-manager",
    to: PERMISSIONS.NOTIFICATIONS_NOTIFY_TO_MANAGER
  },
  {
    from: "appointments.notify.to-specialist",
    to: PERMISSIONS.NOTIFICATIONS_NOTIFY_TO_SPECIALIST
  },
  {
    from: "notifications.schedule.to-manager",
    to: PERMISSIONS.NOTIFICATIONS_NOTIFY_TO_MANAGER
  },
  {
    from: "notifications.schedule.to-specialist",
    to: PERMISSIONS.NOTIFICATIONS_NOTIFY_TO_SPECIALIST
  },
  {
    from: "appointments.schedule.scope.all",
    to: PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_SCOPE_ALL
  },
  {
    from: "appointments.schedule.scope.assigned",
    to: PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_SCOPE_ASSIGNED
  }
]);

const ROLE_PERMISSION_COPY_MIGRATIONS = Object.freeze([
  {
    from: PERMISSIONS.APPOINTMENTS_SUBMENU_SCHEDULE,
    to: PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_MY_CLASS
  },
  {
    from: PERMISSIONS.APPOINTMENTS_SUBMENU_SCHEDULE,
    to: PERMISSIONS.APPOINTMENTS_PLANNER_READ
  },
  {
    from: PERMISSIONS.APPOINTMENTS_SUBMENU_BREAKS,
    to: PERMISSIONS.APPOINTMENTS_BREAKS_READ
  },
  {
    from: "appointments.vip-clients",
    to: PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_DAILY_ROUTINES
  }
]);

import { toBoundedInteger } from "../../lib/bounded-integer.js";

async function pruneAdminRolePermissionsByOrgFeatures(client) {
  const { rows } = await client.query(
    `SELECT
       r.id AS role_id,
       o.allowed_features
      FROM role_options r
      JOIN organizations o ON o.id = r.organization_id
     WHERE r.is_admin = TRUE
       AND r.is_active = TRUE`
  );

  for (const row of rows) {
    const roleId = Number(row?.role_id || 0);
    if (!roleId) {
      continue;
    }

    const allowedFeatures = normalizeAllowedFeatures(row?.allowed_features);
    if (!Array.isArray(allowedFeatures)) {
      continue;
    }

    const disallowedCodes = BASE_PERMISSION_DEFINITIONS
      .map((permission) => normalizePermissionCode(permission.code))
      .filter(Boolean)
      .filter((code) => !isPermissionAllowedByOrgFeatures(code, allowedFeatures));

    if (disallowedCodes.length === 0) {
      continue;
    }

    await client.query(
      `DELETE FROM role_permissions rp
        USING permissions p
       WHERE rp.role_id = $1
         AND rp.permission_id = p.id
         AND LOWER(p.code) = ANY($2::text[])`,
      [roleId, disallowedCodes]
    );
  }
}

export async function ensureSystemPermissions(options = {}) {
  const useAdvisoryLock = toBooleanFlag(options?.useAdvisoryLock, true, { acceptOn: true });
  const advisoryLockKey = toBoundedInteger(
    options?.advisoryLockKey,
    DEFAULT_PERMISSIONS_SYNC_LOCK_KEY,
    1,
    2147483647
  );
  const skipIfLockUnavailable = toBooleanFlag(options?.skipIfLockUnavailable, true, { acceptOn: true });
  const logger = options?.logger && typeof options.logger === "object" ? options.logger : null;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (useAdvisoryLock) {
      const { rows } = await client.query(
        "SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired",
        [advisoryLockKey]
      );
      const acquired = Boolean(rows?.[0]?.acquired);
      if (!acquired) {
        if (skipIfLockUnavailable) {
          await client.query("ROLLBACK");
          logger?.info?.(
            { advisoryLockKey },
            "Skipped permissions sync because advisory lock is held by another instance"
          );
          return {
            skipped: true,
            reason: "lock-unavailable"
          };
        }
        throw new Error("Permissions sync lock is held by another instance.");
      }
    }

    const valuesSql = [];
    const params = [];

    BASE_PERMISSION_DEFINITIONS.forEach((permission, index) => {
      const baseParam = index * 3;
      valuesSql.push(`($${baseParam + 1}, $${baseParam + 2}, $${baseParam + 3})`);
      params.push(permission.code, permission.label, permission.sortOrder);
    });

    if (valuesSql.length > 0) {
      await client.query(
        `INSERT INTO permissions (code, label, sort_order)
         VALUES ${valuesSql.join(", ")}
         ON CONFLICT (code) DO UPDATE
           SET label = EXCLUDED.label,
               sort_order = EXCLUDED.sort_order,
               is_active = TRUE`,
        params
      );
    }

    await client.query(
      `UPDATE permissions
          SET is_active = TRUE
        WHERE LOWER(code) = ANY($1::text[])`,
      [BASE_PERMISSION_CODES]
    );

    for (const migration of LEGACY_PERMISSION_CODE_MIGRATIONS) {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT rp.role_id, target_permission.id
           FROM role_permissions rp
           JOIN permissions legacy_permission ON legacy_permission.id = rp.permission_id
           JOIN permissions target_permission ON target_permission.code = $2
          WHERE legacy_permission.code = $1
         ON CONFLICT (role_id, permission_id) DO NOTHING`,
        [migration.from, migration.to]
      );
    }

    for (const migration of ROLE_PERMISSION_COPY_MIGRATIONS) {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT rp.role_id, target_permission.id
           FROM role_permissions rp
           JOIN permissions source_permission ON source_permission.id = rp.permission_id
           JOIN permissions target_permission ON target_permission.code = $2
          WHERE source_permission.code = $1
         ON CONFLICT (role_id, permission_id) DO NOTHING`,
        [migration.from, migration.to]
      );
    }

    await client.query(
      `UPDATE permissions
          SET is_active = FALSE
        WHERE LOWER(code) <> ALL($1::text[])`,
      [BASE_PERMISSION_CODES]
    );

    await client.query(
      `DELETE FROM role_permissions rp
       USING permissions p
       WHERE p.id = rp.permission_id
         AND LOWER(p.code) <> ALL($1::text[])`,
      [BASE_PERMISSION_CODES]
    );

    // Keep admin roles aligned with all active permissions.
    await client.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT r.id, p.id
         FROM role_options r
         JOIN permissions p ON p.is_active = TRUE
        WHERE r.is_admin = TRUE
          AND r.is_active = TRUE
        ON CONFLICT (role_id, permission_id) DO NOTHING`
    );

    await pruneAdminRolePermissionsByOrgFeatures(client);

    await client.query("COMMIT");
    return {
      skipped: false
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
