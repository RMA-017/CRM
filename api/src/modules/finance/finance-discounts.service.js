import pool from "../../config/db.js";
import { parsePositiveInteger } from "../../lib/number.js";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const CLIENT_DISCOUNT_MAX_LIMIT_COUNT = 22;

function normalizeText(value, maxLength = 255) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeAmount(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function normalizePage(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function normalizePageSize(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(parsed, MAX_PAGE_SIZE);
}

function normalizeDiscountType(value) {
  return String(value || "").trim().toLowerCase() === "percent" ? "percent" : "amount";
}

function calculateDiscountUzs({ priceUzs, discountType, discountValue }) {
  const price = normalizeAmount(priceUzs, 0);
  const value = normalizeAmount(discountValue, 0);
  if (discountType === "percent") {
    return Math.min(price, Math.floor((price * Math.min(value, 100)) / 100));
  }
  return Math.min(price, value);
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function mapClientOption(row) {
  return {
    id: row.id,
    fullName: row.full_name || "",
    phone: row.phone_number || ""
  };
}

function mapServiceOption(row) {
  return {
    id: row.id,
    name: row.name || "",
    priceUzs: row.price_uzs ?? 0,
    positionId: row.position_id || null,
    positionLabel: row.position_label || ""
  };
}

function normalizeServiceRows(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const limitCount = item.limitCount === null || item.limit_count === null
        ? null
        : normalizeAmount(item.limitCount ?? item.limit_count, 0);
      const usedCount = normalizeAmount(item.usedCount ?? item.used_count, 0);
      const isUnlimited = limitCount === null;
      const remainingCount = isUnlimited ? null : Math.max(limitCount - usedCount, 0);
      return {
        id: item.id,
        serviceId: item.serviceId ?? item.service_id,
        serviceName: item.serviceName ?? item.service_name ?? "",
        limitCount,
        usedCount,
        remainingCount,
        status: isUnlimited ? "unlimited" : remainingCount > 0 ? "active" : "completed"
      };
    });
}

function getRuleStatus({ isActive, services }) {
  if (!isActive) return "disabled";
  const serviceRows = Array.isArray(services) ? services : [];
  if (serviceRows.length === 0) return "completed";
  if (serviceRows.every((item) => item.limitCount === null)) return "unlimited";
  return serviceRows.some((item) => item.limitCount === null || item.remainingCount > 0)
    ? "active"
    : "completed";
}

function mapDiscountRule(row) {
  if (!row) return null;
  const services = normalizeServiceRows(row.services);
  const finiteServices = services.filter((item) => item.limitCount !== null);
  const totalLimitCount = finiteServices.reduce((sum, item) => sum + normalizeAmount(item.limitCount, 0), 0);
  const usedCount = finiteServices.reduce((sum, item) => sum + normalizeAmount(item.usedCount, 0), 0);
  const remainingCount = finiteServices.reduce((sum, item) => sum + normalizeAmount(item.remainingCount, 0), 0);
  const hasUnlimited = services.some((item) => item.limitCount === null);
  const isActive = Boolean(row.is_active);
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name || "",
    discountType: row.discount_type || "amount",
    discountValue: row.discount_value ?? 0,
    note: row.note || "",
    isActive,
    status: getRuleStatus({ isActive, services }),
    services,
    totalLimitCount: hasUnlimited ? null : totalLimitCount,
    usedCount,
    remainingCount: hasUnlimited ? null : remainingCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapDiscountUsage(row) {
  return {
    id: row.id,
    ruleId: row.rule_id,
    ruleServiceId: row.rule_service_id,
    ticketId: row.ticket_id,
    ticketNumber: row.ticket_number,
    ticketDate: row.ticket_date,
    appointmentScheduleId: row.appointment_schedule_id,
    appointmentDate: row.appointment_date,
    serviceId: row.service_id,
    serviceName: row.service_name || "",
    specialistName: row.specialist_name || "",
    priceUzs: row.price_uzs ?? 0,
    discountUzs: row.discount_uzs ?? 0,
    finalAmountUzs: row.final_amount_uzs ?? 0,
    quantity: row.quantity ?? 1,
    isReversed: Boolean(row.reversed_at),
    reversedAt: row.reversed_at,
    createdAt: row.created_at
  };
}

export async function searchFinanceDiscountClients({ organizationId, query, limit = 30 }) {
  const normalizedQuery = normalizeText(query, 96);
  const normalizedLimit = Math.max(1, Math.min(Number.parseInt(String(limit || 30), 10) || 30, 50));
  if (!normalizedQuery || (!/^\d+$/.test(normalizedQuery) && normalizedQuery.length < 3)) {
    return [];
  }
  const normalizedPhoneDigits = normalizedQuery.replace(/\D/g, "");
  const result = await pool.query(
    `SELECT id,
            CONCAT_WS(' ', last_name, first_name, middle_name) AS full_name,
            phone_number
       FROM clients
      WHERE organization_id = $1
        AND (
          LOWER(CONCAT_WS(' ', last_name, first_name, middle_name)) LIKE $2
          OR phone_number LIKE $3
          OR ($4 <> '' AND regexp_replace(COALESCE(phone_number, ''), '[^0-9]', '', 'g') LIKE $4)
          OR id::text = $5
        )
      ORDER BY last_name ASC, first_name ASC, id ASC
      LIMIT $6`,
    [
      organizationId,
      `%${normalizedQuery.toLowerCase()}%`,
      `${normalizedQuery}%`,
      normalizedPhoneDigits ? `%${normalizedPhoneDigits}%` : "",
      normalizedQuery,
      normalizedLimit
    ]
  );
  return result.rows.map(mapClientOption);
}

export async function getFinanceDiscountReferences({ organizationId }) {
  const servicesResult = await pool.query(
    `SELECT sc.id,
            sc.name,
            sc.price_uzs,
            sc.position_id,
            p.label AS position_label
       FROM service_catalog sc
       JOIN position_options p
         ON p.organization_id = sc.organization_id
        AND p.id = sc.position_id
      WHERE sc.organization_id = $1
        AND sc.is_active = TRUE
        AND p.is_active = TRUE
      ORDER BY p.sort_order ASC, p.label ASC, sc.name ASC, sc.id ASC`,
    [organizationId]
  );
  return { services: servicesResult.rows.map(mapServiceOption) };
}

async function queryDiscountRules({ organizationId, whereSql = "", params = [], limit = null, offset = null }) {
  const queryParams = [organizationId, ...params];
  let pagingSql = "";
  if (limit !== null) {
    queryParams.push(limit);
    pagingSql += ` LIMIT $${queryParams.length}`;
  }
  if (offset !== null) {
    queryParams.push(offset);
    pagingSql += ` OFFSET $${queryParams.length}`;
  }
  const result = await pool.query(
    `WITH usage_counts AS (
       SELECT organization_id,
              rule_service_id,
              COALESCE(SUM(quantity), 0)::integer AS used_count
         FROM finance_client_discount_usages
        WHERE organization_id = $1
          AND reversed_at IS NULL
        GROUP BY organization_id, rule_service_id
     )
     SELECT r.id,
            r.client_id,
            CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name) AS client_name,
            r.discount_type,
            r.discount_value,
            r.note,
            r.is_active,
            r.created_at,
            r.updated_at,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', rs.id,
                  'serviceId', rs.service_id,
                  'serviceName', rs.service_name,
                  'limitCount', rs.limit_count,
                  'usedCount', COALESCE(uc.used_count, 0)
                )
                ORDER BY rs.id ASC
              ) FILTER (WHERE rs.id IS NOT NULL),
              '[]'::json
            ) AS services
       FROM finance_client_discount_rules r
       JOIN clients c ON c.organization_id = r.organization_id AND c.id = r.client_id
       LEFT JOIN finance_client_discount_rule_services rs
         ON rs.organization_id = r.organization_id
        AND rs.rule_id = r.id
       LEFT JOIN usage_counts uc
         ON uc.organization_id = rs.organization_id
        AND uc.rule_service_id = rs.id
      WHERE r.organization_id = $1
        ${whereSql}
      GROUP BY r.id, c.last_name, c.first_name, c.middle_name
      ORDER BY r.created_at DESC, r.id DESC${pagingSql}`,
    queryParams
  );
  return result.rows.map(mapDiscountRule);
}

export async function getFinanceClientDiscounts({ organizationId, filters = {} }) {
  const page = normalizePage(filters.page);
  const pageSize = normalizePageSize(filters.pageSize ?? filters.page_size);
  const search = normalizeText(filters.q ?? filters.query ?? filters.search, 96).toLowerCase();
  const where = [];
  const params = [];
  if (search) {
    params.push(`%${search}%`, search);
    where.push(`AND (
      LOWER(CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name)) LIKE $2
      OR r.id::text = $3
    )`);
  }
  const countResult = await pool.query(
    `SELECT COUNT(*)::integer AS total
       FROM finance_client_discount_rules r
       JOIN clients c ON c.organization_id = r.organization_id AND c.id = r.client_id
      WHERE r.organization_id = $1
        ${where.join("\n")}`,
    [organizationId, ...params]
  );
  const totalItems = Number.parseInt(String(countResult.rows[0]?.total || "0"), 10) || 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const normalizedPage = Math.min(page, totalPages);
  const items = await queryDiscountRules({
    organizationId,
    whereSql: where.join("\n"),
    params,
    limit: pageSize,
    offset: (normalizedPage - 1) * pageSize
  });
  return {
    items,
    page: normalizedPage,
    pageSize,
    totalItems,
    totalPages
  };
}

export async function getFinanceClientDiscountById({ organizationId, id }) {
  const ruleId = parsePositiveInteger(id);
  if (!ruleId) return null;
  const [item] = await queryDiscountRules({
    organizationId,
    whereSql: "AND r.id = $2",
    params: [ruleId],
    limit: 1,
    offset: null
  });
  if (!item) return null;
  const usagesResult = await pool.query(
    `SELECT u.id,
            u.rule_id,
            u.rule_service_id,
            u.ticket_id,
            ft.ticket_number,
            ft.ticket_date,
            u.appointment_schedule_id,
            a.appointment_date,
            u.service_id,
            COALESCE(fti.service_name, rs.service_name) AS service_name,
            COALESCE(NULLIF(TRIM(sp.full_name), ''), NULLIF(TRIM(sp.username), ''), '') AS specialist_name,
            COALESCE(fti.price_uzs, 0) AS price_uzs,
            u.discount_uzs,
            COALESCE(fti.final_amount_uzs, 0) AS final_amount_uzs,
            u.quantity,
            u.reversed_at,
            u.created_at
       FROM finance_client_discount_usages u
       JOIN finance_client_discount_rule_services rs
         ON rs.organization_id = u.organization_id
        AND rs.id = u.rule_service_id
       JOIN finance_tickets ft
         ON ft.organization_id = u.organization_id
        AND ft.id = u.ticket_id
       LEFT JOIN finance_ticket_items fti
         ON fti.organization_id = u.organization_id
        AND fti.id = u.ticket_item_id
       LEFT JOIN appointment_schedules a ON a.id = u.appointment_schedule_id
       LEFT JOIN users sp
         ON sp.organization_id = u.organization_id
        AND sp.id = COALESCE(fti.specialist_id, a.specialist_id)
      WHERE u.organization_id = $1
        AND u.rule_id = $2
      ORDER BY u.created_at DESC, u.id DESC`,
    [organizationId, ruleId]
  );
  return {
    item,
    usages: usagesResult.rows.map(mapDiscountUsage)
  };
}

export async function createFinanceClientDiscount({ organizationId, payload, actorUserId }) {
  const clientId = parsePositiveInteger(payload?.clientId ?? payload?.client_id);
  const discountType = normalizeDiscountType(payload?.discountType ?? payload?.discount_type);
  const discountValue = normalizeAmount(payload?.discountValue ?? payload?.discount_value, 0);
  const note = normalizeText(payload?.note, 255);
  const rawServices = Array.isArray(payload?.services) ? payload.services : [];

  if (!clientId) {
    const error = new Error("Client is required.");
    error.statusCode = 400;
    throw error;
  }
  if (discountValue <= 0) {
    const error = new Error("Discount is required.");
    error.statusCode = 400;
    throw error;
  }
  if (discountType === "percent" && discountValue > 100) {
    const error = new Error("Percent discount cannot exceed 100.");
    error.statusCode = 400;
    throw error;
  }

  const serviceInputs = [];
  const seenServiceIds = new Set();
  rawServices.forEach((item) => {
    const serviceId = parsePositiveInteger(item?.serviceId ?? item?.service_id);
    if (!serviceId || seenServiceIds.has(serviceId)) return;
    seenServiceIds.add(serviceId);
    const isUnlimited = normalizeBoolean(item?.isUnlimited ?? item?.is_unlimited, false);
    const rawLimit = item?.limitCount ?? item?.limit_count;
    const limitCount = isUnlimited || rawLimit === null ? null : normalizeAmount(rawLimit, 0);
    serviceInputs.push({ serviceId, limitCount });
  });
  if (serviceInputs.length === 0) {
    const error = new Error("At least one service is required.");
    error.statusCode = 400;
    throw error;
  }
  if (serviceInputs.some((item) => item.limitCount !== null && item.limitCount <= 0)) {
    const error = new Error("Service count is required.");
    error.statusCode = 400;
    throw error;
  }
  if (serviceInputs.some((item) => item.limitCount !== null && item.limitCount > CLIENT_DISCOUNT_MAX_LIMIT_COUNT)) {
    const error = new Error("Service count cannot exceed 22.");
    error.statusCode = 400;
    throw error;
  }

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const clientResult = await db.query(
      `SELECT id
         FROM clients
        WHERE organization_id = $1
          AND id = $2
        LIMIT 1`,
      [organizationId, clientId]
    );
    if (!clientResult.rows[0]) {
      const error = new Error("Client not found.");
      error.statusCode = 404;
      throw error;
    }

    const serviceIds = serviceInputs.map((item) => item.serviceId);
    const servicesResult = await db.query(
      `SELECT id, name
         FROM service_catalog
        WHERE organization_id = $1
          AND id = ANY($2::int[])
          AND is_active = TRUE`,
      [organizationId, serviceIds]
    );
    const serviceById = new Map(servicesResult.rows.map((row) => [String(row.id), row]));
    if (serviceById.size !== serviceInputs.length) {
      const error = new Error("Service not found.");
      error.statusCode = 404;
      throw error;
    }

    const insertResult = await db.query(
      `INSERT INTO finance_client_discount_rules (
         organization_id, client_id, discount_type, discount_value, note, created_by, updated_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       RETURNING id`,
      [organizationId, clientId, discountType, discountValue, note || null, actorUserId || null]
    );
    const ruleId = insertResult.rows[0].id;
    for (const item of serviceInputs) {
      const service = serviceById.get(String(item.serviceId));
      await db.query(
        `INSERT INTO finance_client_discount_rule_services (
           organization_id, rule_id, service_id, service_name, limit_count
         )
         VALUES ($1, $2, $3, $4, $5)`,
        [organizationId, ruleId, item.serviceId, service.name, item.limitCount]
      );
    }
    await db.query("COMMIT");
    const detail = await getFinanceClientDiscountById({ organizationId, id: ruleId });
    return detail?.item || null;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}

export async function updateFinanceClientDiscount({ organizationId, id, payload, actorUserId }) {
  const ruleId = parsePositiveInteger(id);
  if (!ruleId) {
    const error = new Error("Discount not found.");
    error.statusCode = 404;
    throw error;
  }
  const isActive = normalizeBoolean(payload?.isActive ?? payload?.is_active, true);
  const result = await pool.query(
    `UPDATE finance_client_discount_rules
        SET is_active = $3,
            updated_by = $4,
            updated_at = CURRENT_TIMESTAMP
      WHERE organization_id = $1
        AND id = $2
      RETURNING id`,
    [organizationId, ruleId, isActive, actorUserId || null]
  );
  if (!result.rows[0]) {
    const error = new Error("Discount not found.");
    error.statusCode = 404;
    throw error;
  }
  const detail = await getFinanceClientDiscountById({ organizationId, id: ruleId });
  return detail?.item || null;
}

async function getDiscountCandidatesForService(db, { organizationId, clientId, serviceId }) {
  const result = await db.query(
    `SELECT r.id AS rule_id,
            rs.id AS rule_service_id,
            r.discount_type,
            r.discount_value,
            rs.limit_count,
            COALESCE(usage_counts.used_count, 0)::integer AS used_count
       FROM finance_client_discount_rule_services rs
       JOIN finance_client_discount_rules r
         ON r.organization_id = rs.organization_id
        AND r.id = rs.rule_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(u.quantity), 0)::integer AS used_count
           FROM finance_client_discount_usages u
          WHERE u.organization_id = rs.organization_id
            AND u.rule_service_id = rs.id
            AND u.reversed_at IS NULL
       ) usage_counts ON TRUE
      WHERE rs.organization_id = $1
        AND r.client_id = $2
        AND rs.service_id = $3
        AND r.is_active = TRUE
      ORDER BY r.created_at ASC, r.id ASC, rs.id ASC
      LIMIT 20
      FOR UPDATE OF r, rs`,
    [organizationId, clientId, serviceId]
  );
  return result.rows;
}

export async function applyClientDiscountsToTicketItems(db, { organizationId, clientId, items }) {
  const sourceItems = Array.isArray(items) ? items : [];
  const reservations = new Map();
  const nextItems = [];
  for (const item of sourceItems) {
    const serviceId = parsePositiveInteger(item?.serviceId ?? item?.service_id);
    if (!serviceId) {
      nextItems.push(item);
      continue;
    }
    const candidates = await getDiscountCandidatesForService(db, { organizationId, clientId, serviceId });
    const selected = candidates.find((candidate) => {
      if (candidate.limit_count === null || candidate.limit_count === undefined) return true;
      const reserved = reservations.get(String(candidate.rule_service_id)) || 0;
      return normalizeAmount(candidate.used_count, 0) + reserved < normalizeAmount(candidate.limit_count, 0);
    });
    if (!selected) {
      nextItems.push(item);
      continue;
    }
    const discountType = normalizeDiscountType(selected.discount_type);
    const discountValue = normalizeAmount(selected.discount_value, 0);
    const priceUzs = normalizeAmount(item.priceUzs ?? item.price_uzs, 0);
    const discountUzs = calculateDiscountUzs({ priceUzs, discountType, discountValue });
    if (discountUzs <= 0) {
      nextItems.push(item);
      continue;
    }
    reservations.set(String(selected.rule_service_id), (reservations.get(String(selected.rule_service_id)) || 0) + 1);
    nextItems.push({
      ...item,
      discountType,
      discountValue,
      discountUzs,
      finalAmountUzs: Math.max(priceUzs - discountUzs, 0),
      clientDiscountRuleId: selected.rule_id,
      clientDiscountRuleServiceId: selected.rule_service_id
    });
  }
  return nextItems;
}

export async function insertClientDiscountUsages(db, {
  organizationId,
  ticketId,
  appointmentScheduleId = null,
  clientId,
  items,
  actorUserId
}) {
  const sourceItems = Array.isArray(items) ? items : [];
  for (const item of sourceItems) {
    const ruleId = parsePositiveInteger(item.clientDiscountRuleId);
    const ruleServiceId = parsePositiveInteger(item.clientDiscountRuleServiceId);
    const ticketItemId = parsePositiveInteger(item.ticketItemId);
    const serviceId = parsePositiveInteger(item.serviceId);
    const discountUzs = normalizeAmount(item.discountUzs, 0);
    if (!ruleId || !ruleServiceId || !ticketItemId || !serviceId || discountUzs <= 0) continue;
    await db.query(
      `INSERT INTO finance_client_discount_usages (
         organization_id, rule_id, rule_service_id, ticket_id, ticket_item_id,
         appointment_schedule_id, client_id, service_id, discount_uzs, quantity, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10)
       ON CONFLICT DO NOTHING`,
      [
        organizationId,
        ruleId,
        ruleServiceId,
        ticketId,
        ticketItemId,
        appointmentScheduleId || null,
        clientId,
        serviceId,
        discountUzs,
        actorUserId || null
      ]
    );
  }
}

export async function reverseClientDiscountUsagesForTicket(db, { organizationId, ticketId, actorUserId }) {
  await db.query(
    `UPDATE finance_client_discount_usages
        SET reversed_at = CURRENT_TIMESTAMP,
            reversed_by = $3
      WHERE organization_id = $1
        AND ticket_id = $2
        AND reversed_at IS NULL`,
    [organizationId, ticketId, actorUserId || null]
  );
}
