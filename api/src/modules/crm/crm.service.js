import pool from "../../config/db.js";
import { normalizePositiveInteger } from "../../lib/number.js";
import { normalizePhoneDigits, normalizePhoneNumber } from "../../lib/phone-number.js";

const LEAD_STATUSES = new Set(["new", "contacted", "converted", "lost"]);
const LEAD_SOURCES = new Set(["website", "telegram"]);

function normalizeLeadStatus(value, fallback = "new") {
  const normalized = String(value || "").trim().toLowerCase();
  return LEAD_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeLeadSource(value, fallback = "website") {
  const normalized = String(value || "").trim().toLowerCase();
  return LEAD_SOURCES.has(normalized) ? normalized : fallback;
}

function normalizeText(value, maxLength = 180) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function mapLeadRow(row) {
  return {
    id: String(row?.id || ""),
    organizationId: normalizePositiveInteger(row?.organization_id),
    fullName: String(row?.full_name || "").trim(),
    phoneNumber: String(row?.phone_number || "").trim(),
    phoneDigits: String(row?.phone_digits || "").trim(),
    source: String(row?.source || "").trim(),
    status: String(row?.status || "").trim(),
    note: String(row?.note || "").trim(),
    telegramUserId: row?.telegram_user_id ? String(row.telegram_user_id) : "",
    telegramChatId: row?.telegram_chat_id ? String(row.telegram_chat_id) : "",
    payload: row?.payload && typeof row.payload === "object" ? row.payload : {},
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null
  };
}

export async function getDefaultLeadOrganizationId(db = pool) {
  const { rows } = await db.query(
    `SELECT id
       FROM organizations
      WHERE is_active = TRUE
      ORDER BY id ASC
      LIMIT 1`
  );
  return normalizePositiveInteger(rows?.[0]?.id);
}

export async function createOrUpdateCrmLead({
  organizationId,
  fullName,
  phoneNumber,
  source = "website",
  note = "",
  telegramUserId = null,
  telegramChatId = null,
  payload = {},
  db = pool
}) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId) || await getDefaultLeadOrganizationId(db);
  const normalizedFullName = normalizeText(fullName || "Telegram contact", 180);
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  const phoneDigits = normalizePhoneDigits(phoneNumber);
  const normalizedSource = normalizeLeadSource(source);
  const normalizedNote = normalizeText(note, 2000);
  const normalizedTelegramUserId = normalizePositiveInteger(telegramUserId) || null;
  const normalizedTelegramChatId = normalizePositiveInteger(telegramChatId) || null;
  const normalizedPayload = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};

  if (!normalizedOrganizationId || !normalizedFullName || phoneDigits.length < 7) {
    return null;
  }

  const { rows } = await db.query(
    `INSERT INTO crm_leads (
       organization_id,
       full_name,
       phone_number,
       phone_digits,
       source,
       note,
       telegram_user_id,
       telegram_chat_id,
       payload
     ) VALUES ($1,$2,$3,$4,$5,NULLIF($6::text, ''),$7,$8,$9::jsonb)
     ON CONFLICT (organization_id, phone_digits)
     DO UPDATE SET
       full_name = CASE
         WHEN crm_leads.full_name = 'Telegram contact' THEN EXCLUDED.full_name
         ELSE crm_leads.full_name
       END,
       phone_number = EXCLUDED.phone_number,
       source = EXCLUDED.source,
       note = COALESCE(NULLIF(EXCLUDED.note, ''), crm_leads.note),
       telegram_user_id = COALESCE(EXCLUDED.telegram_user_id, crm_leads.telegram_user_id),
       telegram_chat_id = COALESCE(EXCLUDED.telegram_chat_id, crm_leads.telegram_chat_id),
       payload = crm_leads.payload || EXCLUDED.payload,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      normalizedOrganizationId,
      normalizedFullName,
      normalizedPhoneNumber,
      phoneDigits,
      normalizedSource,
      normalizedNote,
      normalizedTelegramUserId,
      normalizedTelegramChatId,
      JSON.stringify(normalizedPayload)
    ]
  );
  return mapLeadRow(rows[0]);
}

export async function getCrmLeadsPage({
  organizationId,
  status = "",
  source = "",
  search = "",
  limit = 100,
  db = pool
}) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId);
  if (!normalizedOrganizationId) {
    return [];
  }
  const normalizedStatus = normalizeLeadStatus(status, "");
  const normalizedSource = normalizeLeadSource(source, "");
  const normalizedSearch = normalizeText(search, 80).toLowerCase();
  const normalizedLimit = Math.min(Math.max(normalizePositiveInteger(limit) || 100, 1), 200);
  const params = [normalizedOrganizationId];
  const where = ["organization_id = $1"];
  if (normalizedStatus) {
    params.push(normalizedStatus);
    where.push(`status = $${params.length}`);
  }
  if (normalizedSource) {
    params.push(normalizedSource);
    where.push(`source = $${params.length}`);
  }
  if (normalizedSearch) {
    params.push(`%${normalizedSearch}%`);
    where.push(`(LOWER(full_name) LIKE $${params.length} OR phone_digits LIKE $${params.length})`);
  }
  params.push(normalizedLimit);
  const { rows } = await db.query(
    `SELECT *
       FROM crm_leads
      WHERE ${where.join(" AND ")}
      ORDER BY
        CASE status
          WHEN 'new' THEN 0
          WHEN 'contacted' THEN 1
          WHEN 'converted' THEN 2
          ELSE 3
        END ASC,
        updated_at DESC,
        id DESC
      LIMIT $${params.length}::integer`,
    params
  );
  return rows.map(mapLeadRow);
}

export async function updateCrmLeadById({
  organizationId,
  id,
  status,
  note,
  db = pool
}) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId);
  const normalizedId = normalizePositiveInteger(id);
  const normalizedStatus = normalizeLeadStatus(status, "");
  const normalizedNote = note === undefined ? undefined : normalizeText(note, 2000);
  if (!normalizedOrganizationId || !normalizedId) {
    return null;
  }
  const updates = [];
  const params = [normalizedOrganizationId, normalizedId];
  if (normalizedStatus) {
    params.push(normalizedStatus);
    updates.push(`status = $${params.length}`);
  }
  if (normalizedNote !== undefined) {
    params.push(normalizedNote);
    updates.push(`note = NULLIF($${params.length}::text, '')`);
  }
  if (updates.length === 0) {
    return null;
  }
  updates.push("updated_at = CURRENT_TIMESTAMP");
  const { rows } = await db.query(
    `UPDATE crm_leads
        SET ${updates.join(", ")}
      WHERE organization_id = $1
        AND id = $2
      RETURNING *`,
    params
  );
  return rows[0] ? mapLeadRow(rows[0]) : null;
}
