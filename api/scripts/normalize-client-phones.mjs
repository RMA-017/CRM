import pool from "../src/config/db.js";
import { isValidNormalizedPhoneNumber, normalizePhoneNumber } from "../src/lib/phone-number.js";

const applyChanges = process.argv.includes("--apply");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const printLimit = Math.max(0, Number.parseInt(limitArg?.split("=")[1] || "80", 10) || 80);

function getClientName(row) {
  return [row.last_name, row.first_name, row.middle_name]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ")
    || `Client #${row.id}`;
}

function buildChange(row) {
  const original = String(row.phone_number || "").trim();
  const normalized = normalizePhoneNumber(original);
  const isValid = isValidNormalizedPhoneNumber(normalized) && normalized.length <= 15;

  return {
    id: row.id,
    organizationId: row.organization_id,
    name: getClientName(row),
    original,
    normalized,
    isValid,
    shouldUpdate: isValid && original !== normalized
  };
}

function printRows(title, rows) {
  console.log(`\n${title}: ${rows.length}`);
  for (const row of rows.slice(0, printLimit)) {
    console.log(`#${row.id} ${row.name}: ${row.original || "(empty)"} -> ${row.normalized || "(empty)"}`);
  }
  if (rows.length > printLimit) {
    console.log(`...and ${rows.length - printLimit} more. Use --limit=${rows.length} to print all.`);
  }
}

async function main() {
  const { rows } = await pool.query(`
    SELECT id, organization_id, first_name, last_name, middle_name, phone_number
    FROM clients
    WHERE NULLIF(TRIM(COALESCE(phone_number, '')), '') IS NOT NULL
    ORDER BY id ASC
  `);

  const analyzed = rows.map(buildChange);
  const changes = analyzed.filter((row) => row.shouldUpdate);
  const invalid = analyzed.filter((row) => !row.isValid);
  const unchanged = analyzed.filter((row) => row.isValid && !row.shouldUpdate);

  console.log(`Mode: ${applyChanges ? "apply" : "dry-run"}`);
  console.log(`Checked clients with phone: ${analyzed.length}`);
  console.log(`Already standard: ${unchanged.length}`);
  console.log(`Will update: ${changes.length}`);
  console.log(`Skipped invalid/too long: ${invalid.length}`);

  printRows("Updates", changes);
  printRows("Skipped", invalid);

  if (!applyChanges) {
    console.log("\nNo data changed. Re-run with --apply to update phone numbers.");
    return;
  }

  if (changes.length === 0) {
    console.log("\nNothing to update.");
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const change of changes) {
      await client.query(
        `UPDATE clients
         SET phone_number = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
           AND organization_id = $3`,
        [change.normalized, change.id, change.organizationId]
      );
    }
    await client.query("COMMIT");
    console.log(`\nUpdated clients: ${changes.length}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

try {
  await main();
} finally {
  await pool.end();
}
