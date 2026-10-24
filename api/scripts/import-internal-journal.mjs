import { readFile, writeFile } from "node:fs/promises";
import pool from "../src/config/db.js";
import { importInternalJournal } from "../src/modules/internal-lessons/internal-journal-import.service.js";

const args = process.argv.slice(2);
const option = (name) => args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
let db;
try {
  const file = option("--file");
  if (!file) throw new Error("Use --file=prepared.json [--organization=ID] [--apply] [--report=report.json]");
  const input = JSON.parse(await readFile(file, "utf8"));
  db = await pool.connect();
  await db.query("BEGIN");
  const organizations = await db.query("SELECT id FROM organizations WHERE is_active = TRUE ORDER BY id");
  const requested = option("--organization");
  const organizationId = requested ? Number(requested) : organizations.rows.length === 1 ? organizations.rows[0].id : null;
  if (!organizationId || !organizations.rows.some((o) => Number(o.id) === Number(organizationId))) throw new Error("Specify an active --organization=ID");
  const report = await importInternalJournal({ organizationId, source: input.source, rows: input.rows, apply: args.includes("--apply"), db });
  await db.query(report.errors.length || !report.applied ? "ROLLBACK" : "COMMIT");
  const output = { source: input.source, organizationId, ...report };
  if (option("--report")) await writeFile(option("--report"), JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ ...output, errorCount: report.errors.length, errors: report.errors.slice(0, 20),
    reportFile: option("--report") || null }, null, 2));
  if (report.errors.length) process.exitCode = 1;
} catch (error) {
  if (db) await db.query("ROLLBACK").catch(() => {});
  console.error(`[import] ${error.code || error.message}`);
  process.exitCode = 1;
} finally { db?.release(); await pool.end(); }
