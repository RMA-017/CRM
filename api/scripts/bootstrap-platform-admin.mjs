import argon2 from "argon2";
import pool from "../src/config/db.js";

function parseCliArgs(argv) {
  const values = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      continue;
    }
    const eqIndex = arg.indexOf("=");
    if (eqIndex === -1) {
      values.set(arg.slice(2).trim(), "true");
      continue;
    }
    const key = arg.slice(2, eqIndex).trim();
    const value = arg.slice(eqIndex + 1).trim();
    values.set(key, value);
  }
  return values;
}

function pickArg(args, key, fallback) {
  const value = String(args.get(key) || "").trim();
  return value || fallback;
}

function printUsage() {
  process.stdout.write(
    [
      "Usage:",
      "  node --env-file=.env scripts/bootstrap-platform-admin.mjs [options]",
      "",
      "Options:",
      "  --username=<value>    Default: superadmin",
      "  --password=<value>    Default: Admin@12345",
      "  --fullName=<value>    Default: Katta Admin",
      "  --orgCode=<value>     Default: aaron-main",
      "  --orgName=<value>     Default: Aaron CRM",
      "  --help                Show this help"
    ].join("\n")
  );
  process.stdout.write("\n");
}

async function ensureOrganization(client, { orgCode, orgName }) {
  const existing = await client.query(
    `SELECT id
       FROM organizations
      WHERE LOWER(code) = LOWER($1)
      LIMIT 1`,
    [orgCode]
  );

  if (existing.rowCount > 0) {
    const organizationId = Number(existing.rows[0].id);
    await client.query(
      `UPDATE organizations
          SET name = $1,
              is_active = TRUE,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $2`,
      [orgName, organizationId]
    );
    return organizationId;
  }

  const inserted = await client.query(
    `INSERT INTO organizations (code, name, is_active, created_by, updated_by)
     VALUES ($1, $2, TRUE, NULL, NULL)
     RETURNING id`,
    [orgCode, orgName]
  );

  return Number(inserted.rows[0].id);
}

async function ensureOrganizationAdminRole(client, { organizationId }) {
  const roleLabel = "Platform_Admin";
  const legacyRoleLabel = "Katta Admin";
  const existing = await client.query(
    `SELECT id, label
       FROM role_options
      WHERE organization_id = $1
        AND (
          LOWER(label) = LOWER($2)
          OR LOWER(label) = LOWER($3)
        )
      ORDER BY
        CASE
          WHEN LOWER(label) = LOWER($2) THEN 0
          ELSE 1
        END,
        id ASC
      LIMIT 1`,
    [organizationId, roleLabel, legacyRoleLabel]
  );

  let roleId = 0;
  if (existing.rowCount > 0) {
    roleId = Number(existing.rows[0].id);
    await client.query(
      `UPDATE role_options
          SET label = $2,
              is_admin = TRUE,
              is_active = TRUE,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [roleId, roleLabel]
    );
  } else {
    const inserted = await client.query(
      `INSERT INTO role_options (
         organization_id,
         label,
         sort_order,
         is_admin,
         is_active,
         created_by,
         updated_by
       )
       VALUES ($1, $2, 0, TRUE, TRUE, NULL, NULL)
       RETURNING id`,
      [organizationId, roleLabel]
    );
    roleId = Number(inserted.rows[0].id);
  }

  await client.query(
    `INSERT INTO role_permissions (role_id, permission_id, created_by, updated_by)
     SELECT $1, p.id, NULL, NULL
       FROM permissions p
      WHERE p.is_active = TRUE
        AND NOT EXISTS (
          SELECT 1
            FROM role_permissions rp
           WHERE rp.role_id = $1
             AND rp.permission_id = p.id
        )`,
    [roleId]
  );

  return roleId;
}

async function upsertPlatformAdminUser(client, {
  organizationId,
  roleId,
  username,
  fullName,
  passwordHash
}) {
  const existing = await client.query(
    `SELECT id
       FROM users
      WHERE LOWER(username) = LOWER($1)
      LIMIT 1`,
    [username]
  );

  if (existing.rowCount > 0) {
    const userId = Number(existing.rows[0].id);
    await client.query(
      `UPDATE users
          SET organization_id = $1,
              username = $2,
              full_name = $3,
              password_hash = $4,
              role_id = $5,
              position_id = NULL,
              is_platform_admin = TRUE,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $6`,
      [organizationId, username, fullName, passwordHash, roleId, userId]
    );
    return userId;
  }

  const inserted = await client.query(
    `INSERT INTO users (
       organization_id,
       username,
       email,
       full_name,
       birthday,
       password_hash,
       phone_number,
       position_id,
       role_id,
       is_platform_admin,
       created_by,
       updated_by
     )
     VALUES ($1, $2, NULL, $3, NULL, $4, NULL, NULL, $5, TRUE, NULL, NULL)
     RETURNING id`,
    [organizationId, username, fullName, passwordHash, roleId]
  );

  return Number(inserted.rows[0].id);
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.has("help")) {
    printUsage();
    return;
  }

  const username = pickArg(args, "username", "superadmin");
  const password = pickArg(args, "password", "Admin@12345");
  const fullName = pickArg(args, "fullName", "Katta Admin");
  const orgCode = pickArg(args, "orgCode", "aaron-main");
  const orgName = pickArg(args, "orgName", "Aaron CRM");

  if (!username) {
    throw new Error("username is required");
  }
  if (!password) {
    throw new Error("password is required");
  }

  const passwordHash = await argon2.hash(password);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const organizationId = await ensureOrganization(client, { orgCode, orgName });
    const roleId = await ensureOrganizationAdminRole(client, { organizationId });
    const userId = await upsertPlatformAdminUser(client, {
      organizationId,
      roleId,
      username,
      fullName,
      passwordHash
    });

    await client.query("COMMIT");

    process.stdout.write("[katta-admin] ready\n");
    process.stdout.write(`organization_code: ${orgCode}\n`);
    process.stdout.write(`organization_id: ${organizationId}\n`);
    process.stdout.write(`role_id: ${roleId}\n`);
    process.stdout.write(`user_id: ${userId}\n`);
    process.stdout.write(`username: ${username}\n`);
    process.stdout.write(`password: ${password}\n`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(`[katta-admin] failed: ${error?.message || error}\n`);
  process.exit(1);
});
