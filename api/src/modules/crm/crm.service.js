import pool from "../../config/db.js";
import { normalizePositiveInteger } from "../../lib/number.js";
import { normalizeOrganizationCode } from "../../lib/organization-code.js";
import { normalizePhoneDigits, normalizePhoneNumber } from "../../lib/phone-number.js";

const LEAD_STATUSES = new Set(["new", "contacted", "converted", "lost"]);
const LEAD_SOURCES = new Set(["website", "telegram"]);
const CLIENT_PHONE_DIGITS_SQL = `(
  CASE
    WHEN regexp_replace(COALESCE(c.phone_number, ''), '\\D', '', 'g') LIKE '00%'
      THEN SUBSTRING(regexp_replace(COALESCE(c.phone_number, ''), '\\D', '', 'g') FROM 3)
    WHEN LENGTH(regexp_replace(COALESCE(c.phone_number, ''), '\\D', '', 'g')) = 9
      THEN '998' || regexp_replace(COALESCE(c.phone_number, ''), '\\D', '', 'g')
    WHEN LENGTH(regexp_replace(COALESCE(c.phone_number, ''), '\\D', '', 'g')) = 10
      THEN '7' || regexp_replace(COALESCE(c.phone_number, ''), '\\D', '', 'g')
    WHEN LENGTH(regexp_replace(COALESCE(c.phone_number, ''), '\\D', '', 'g')) = 11
      AND regexp_replace(COALESCE(c.phone_number, ''), '\\D', '', 'g') LIKE '8%'
      THEN '7' || SUBSTRING(regexp_replace(COALESCE(c.phone_number, ''), '\\D', '', 'g') FROM 2)
    ELSE regexp_replace(COALESCE(c.phone_number, ''), '\\D', '', 'g')
  END
)`;

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

function normalizeDateYmd(value) {
  const normalized = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
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

function getConfiguredPublicOrganizationCodes() {
  return [
    process.env.CRM_PUBLIC_ORGANIZATION_CODE,
    process.env.PUBLIC_CRM_ORGANIZATION_CODE,
    process.env.PUBLIC_ORGANIZATION_CODE,
    process.env.DEFAULT_ORGANIZATION_CODE,
    "aaron",
    "aaron-academy-kids",
    "aaron_academy_kids",
    "aaron-academy",
    "aaronacademy"
  ]
    .map((code) => normalizeOrganizationCode(code))
    .filter(Boolean);
}

export async function getDefaultLeadOrganizationId(db = pool) {
  const candidateCodes = getConfiguredPublicOrganizationCodes();
  if (candidateCodes.length > 0) {
    const { rows } = await db.query(
      `SELECT id
         FROM organizations
        WHERE is_active = TRUE
          AND LOWER(code) = ANY($1::text[])
        ORDER BY array_position($1::text[], LOWER(code)), id ASC
        LIMIT 1`,
      [candidateCodes]
    );
    const configuredOrganizationId = normalizePositiveInteger(rows?.[0]?.id);
    if (configuredOrganizationId) {
      return configuredOrganizationId;
    }
  }

  const { rows: siteRows } = await db.query(
    `SELECT o.id
       FROM organizations o
       JOIN site_content_items sci
         ON sci.organization_id = o.id
        AND sci.is_active = TRUE
      WHERE o.is_active = TRUE
      GROUP BY o.id
      ORDER BY COUNT(*) DESC, o.id ASC
      LIMIT 1`
  );
  const siteOrganizationId = normalizePositiveInteger(siteRows?.[0]?.id);
  if (siteOrganizationId) {
    return siteOrganizationId;
  }

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
  organizationCode = "",
  fullName,
  phoneNumber,
  source = "website",
  note = "",
  telegramUserId = null,
  telegramChatId = null,
  payload = {},
  db = pool
}) {
  let normalizedOrganizationId = normalizePositiveInteger(organizationId);
  const normalizedOrganizationCode = normalizeOrganizationCode(organizationCode);
  if (!normalizedOrganizationId && normalizedOrganizationCode) {
    const { rows } = await db.query(
      `SELECT id
         FROM organizations
        WHERE is_active = TRUE
          AND LOWER(code) = LOWER($1)
        LIMIT 1`,
      [normalizedOrganizationCode]
    );
    normalizedOrganizationId = normalizePositiveInteger(rows?.[0]?.id);
  }
  normalizedOrganizationId = normalizedOrganizationId || await getDefaultLeadOrganizationId(db);
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
     )
     SELECT $1,$2,$3,$4,$5,NULLIF($6::text, ''),$7,$8,$9::jsonb
      WHERE NOT EXISTS (
        SELECT 1
          FROM clients c
         WHERE c.organization_id = $1
           AND ${CLIENT_PHONE_DIGITS_SQL} = $4
      )
     ON CONFLICT (organization_id, phone_digits)
     DO NOTHING
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
  return rows[0] ? mapLeadRow(rows[0]) : null;
}

export async function getCrmLeadsPage({
  organizationId,
  status = "",
  source = "",
  search = "",
  dateFrom = "",
  dateTo = "",
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
  const normalizedDateFrom = normalizeDateYmd(dateFrom);
  const normalizedDateTo = normalizeDateYmd(dateTo);
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
  if (normalizedDateFrom) {
    params.push(normalizedDateFrom);
    where.push(`created_at >= $${params.length}::date`);
  }
  if (normalizedDateTo) {
    params.push(normalizedDateTo);
    where.push(`created_at < ($${params.length}::date + INTERVAL '1 day')`);
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
  fullName,
  status,
  note,
  db = pool
}) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId);
  const normalizedId = normalizePositiveInteger(id);
  const normalizedFullName = fullName === undefined ? undefined : normalizeText(fullName, 180);
  const normalizedStatus = normalizeLeadStatus(status, "");
  const normalizedNote = note === undefined ? undefined : normalizeText(note, 2000);
  if (!normalizedOrganizationId || !normalizedId) {
    return null;
  }
  const updates = [];
  const params = [normalizedOrganizationId, normalizedId];
  if (normalizedFullName !== undefined) {
    params.push(normalizedFullName);
    updates.push(`full_name = $${params.length}`);
  }
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
