import pool from "../src/config/db.js";
import { getFinanceSchemaReadiness } from "../src/config/finance-schema-readiness.js";

function formatErrorLine(error, index = null) {
  const parts = [];
  if (index !== null) {
    parts.push(`#${index}`);
  }
  if (error?.name) {
    parts.push(error.name);
  }
  if (error?.code) {
    parts.push(`code=${error.code}`);
  }
  if (error?.address) {
    parts.push(`address=${error.address}`);
  }
  if (error?.port) {
    parts.push(`port=${error.port}`);
  }
  if (error?.message) {
    parts.push(error.message);
  }
  return parts.join(" ");
}

function formatCheckError(error) {
  const lines = [formatErrorLine(error) || String(error)];
  const nestedErrors = Array.isArray(error?.errors) ? error.errors : [];
  nestedErrors.forEach((nestedError, index) => {
    lines.push(`  ${formatErrorLine(nestedError, index + 1) || String(nestedError)}`);
  });
  if (error?.cause) {
    lines.push(`  cause: ${formatErrorLine(error.cause) || String(error.cause)}`);
  }
  return lines.join("\n");
}

try {
  const report = await getFinanceSchemaReadiness({ db: pool });
  for (const warning of report.warnings) {
    console.warn(`[finance-schema:warn] ${warning}`);
  }
  if (report.errors.length > 0) {
    for (const error of report.errors) {
      console.error(`[finance-schema:error] ${error}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      "[finance-schema:ok] "
      + `tables=${report.tableCount}/${report.requiredTableCount}; `
      + `constraints=${report.constraintCount}/${report.requiredConstraintCount}; `
      + `indexes=${report.indexCount}/${report.requiredIndexCount}`
    );
  }
} catch (error) {
  console.error(`[finance-schema:error] ${formatCheckError(error)}`);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}
