import pool from "../../config/db.js";
import { PERMISSIONS } from "./users.constants.js";

const DEFAULT_PERMISSIONS_SYNC_LOCK_KEY = 41003001;

const BASE_PERMISSION_DEFINITIONS = [
  { code: PERMISSIONS.PROFILE_READ, label: "Read Profile", sortOrder: 10 },
  { code: PERMISSIONS.PROFILE_UPDATE, label: "Update Profile", sortOrder: 20 },
  { code: PERMISSIONS.CLIENTS_MENU, label: "Open Clients Menu", sortOrder: 25 },
  { code: PERMISSIONS.USERS_READ, label: "Read Users", sortOrder: 30 },
  { code: PERMISSIONS.USERS_CREATE, label: "Create Users", sortOrder: 31 },
  { code: PERMISSIONS.USERS_UPDATE, label: "Update Users", sortOrder: 32 },
  { code: PERMISSIONS.USERS_DELETE, label: "Delete Users", sortOrder: 33 },
  { code: PERMISSIONS.CLIENTS_READ, label: "Read Clients", sortOrder: 40 },
  { code: PERMISSIONS.CLIENTS_CREATE, label: "Create Clients", sortOrder: 41 },
  { code: PERMISSIONS.CLIENTS_UPDATE, label: "Update Clients", sortOrder: 42 },
  { code: PERMISSIONS.CLIENTS_DELETE, label: "Delete Clients", sortOrder: 43 },
  { code: PERMISSIONS.APPOINTMENTS_MENU, label: "Open Appointments Menu", sortOrder: 49 },
  { code: PERMISSIONS.APPOINTMENTS_READ, label: "Read Appointments", sortOrder: 50 },
  { code: PERMISSIONS.APPOINTMENTS_CREATE, label: "Create Appointments", sortOrder: 51 },
  { code: PERMISSIONS.APPOINTMENTS_UPDATE, label: "Update Appointments", sortOrder: 52 },
  { code: PERMISSIONS.APPOINTMENTS_DELETE, label: "Delete Appointments", sortOrder: 53 },
  { code: PERMISSIONS.APPOINTMENTS_SUBMENU_SCHEDULE, label: "Appointments Schedule Submenu", sortOrder: 54 },
  { code: PERMISSIONS.APPOINTMENTS_SUBMENU_BREAKS, label: "Appointments Breaks Submenu", sortOrder: 55 },
  { code: PERMISSIONS.APPOINTMENTS_SUBMENU_VIP_CLIENTS, label: "Appointments VIP Clients Submenu", sortOrder: 56 },
  { code: PERMISSIONS.APPOINTMENTS_CLIENT_SEARCH, label: "Search Clients In Appointments", sortOrder: 57 },
  { code: PERMISSIONS.NOTIFICATIONS_SEND, label: "Send Notifications", sortOrder: 58 },
  { code: PERMISSIONS.NOTIFICATIONS_NOTIFY_TO_MANAGER, label: "Notify To Manager", sortOrder: 59 },
  { code: PERMISSIONS.NOTIFICATIONS_NOTIFY_TO_SPECIALIST, label: "Notify To Specialist", sortOrder: 60 }
];

const LEGACY_PERMISSION_CODE_MIGRATIONS = Object.freeze([
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
  }
]);

const LEGACY_PERMISSION_CODE_PATTERNS = Object.freeze([
  "appointments.notify.%",
  "notifications.schedule.%"
]);

function toBoundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function toBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export async function ensureSystemPermissions(options = {}) {
  const useAdvisoryLock = toBoolean(options?.useAdvisoryLock, true);
  const advisoryLockKey = toBoundedInteger(
    options?.advisoryLockKey,
    DEFAULT_PERMISSIONS_SYNC_LOCK_KEY,
    1,
    2147483647
  );
  const skipIfLockUnavailable = toBoolean(options?.skipIfLockUnavailable, true);
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
      [BASE_PERMISSION_DEFINITIONS.map((permission) => String(permission.code || "").trim().toLowerCase())]
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

    await client.query(
      `UPDATE permissions
          SET is_active = FALSE
        WHERE LOWER(code) LIKE ANY($1::text[])`,
      [LEGACY_PERMISSION_CODE_PATTERNS]
    );

    await client.query(
      `DELETE FROM role_permissions rp
       USING permissions p
       WHERE p.id = rp.permission_id
         AND LOWER(p.code) LIKE ANY($1::text[])`,
      [LEGACY_PERMISSION_CODE_PATTERNS]
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
