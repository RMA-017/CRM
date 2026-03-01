import pool from "../config/db.js";

export function isUniqueOrExclusionConflict(error) {
  return error?.code === "23505" || error?.code === "23P01";
}

export async function executeTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
