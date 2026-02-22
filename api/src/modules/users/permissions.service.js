import pool from "../../config/db.js";
import { PERMISSIONS } from "./users.constants.js";

const BASE_PERMISSION_DEFINITIONS = [
  { code: PERMISSIONS.PROFILE_READ, label: "Read Profile", sortOrder: 10 },
  { code: PERMISSIONS.PROFILE_UPDATE, label: "Update Profile", sortOrder: 20 },
  { code: PERMISSIONS.USERS_READ, label: "Read Users", sortOrder: 30 },
  { code: PERMISSIONS.USERS_CREATE, label: "Create Users", sortOrder: 31 },
  { code: PERMISSIONS.USERS_UPDATE, label: "Update Users", sortOrder: 32 },
  { code: PERMISSIONS.USERS_DELETE, label: "Delete Users", sortOrder: 33 },
  { code: PERMISSIONS.CLIENTS_READ, label: "Read Clients", sortOrder: 40 },
  { code: PERMISSIONS.CLIENTS_CREATE, label: "Create Clients", sortOrder: 41 },
  { code: PERMISSIONS.CLIENTS_UPDATE, label: "Update Clients", sortOrder: 42 },
  { code: PERMISSIONS.CLIENTS_DELETE, label: "Delete Clients", sortOrder: 43 },
  { code: PERMISSIONS.APPOINTMENTS_READ, label: "Read Appointments", sortOrder: 50 },
  { code: PERMISSIONS.APPOINTMENTS_CREATE, label: "Create Appointments", sortOrder: 51 },
  { code: PERMISSIONS.APPOINTMENTS_UPDATE, label: "Update Appointments", sortOrder: 52 },
  { code: PERMISSIONS.APPOINTMENTS_DELETE, label: "Delete Appointments", sortOrder: 53 }
];

export async function ensureSystemPermissions() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

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
               sort_order = EXCLUDED.sort_order`,
        params
      );
    }

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
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
