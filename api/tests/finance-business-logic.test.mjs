import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const financeServiceSource = await readFile(
  new URL("../src/modules/finance/finance.service.js", import.meta.url),
  "utf8"
);

const financeRoutesSource = await readFile(
  new URL("../src/modules/finance/finance.routes.js", import.meta.url),
  "utf8"
);

const financeRouteSchemasSource = await readFile(
  new URL("../src/modules/finance/finance.route-schemas.js", import.meta.url),
  "utf8"
);

const financeDiscountsSource = await readFile(
  new URL("../src/modules/finance/finance-discounts.service.js", import.meta.url),
  "utf8"
);

const financeSignedCashSessionBalancesMigrationSource = await readFile(
  new URL("../database/migrations/20260728_000001_finance_cash_session_signed_balances.sql", import.meta.url),
  "utf8"
);

const appointmentScheduleRoutesSource = await readFile(
  new URL("../src/modules/appointments/routes/schedules.routes.js", import.meta.url),
  "utf8"
);

const appointmentSettingsServiceSource = await readFile(
  new URL("../src/modules/appointments/appointment-settings.service.js", import.meta.url),
  "utf8"
);

test("finance tickets keep organization-scoped 5 digit numbering and hide appointment cards with active tickets", () => {
  assert.match(
    financeServiceSource,
    /INSERT INTO finance_ticket_counters[\s\S]*VALUES \(\$1, 10000\)[\s\S]*ON CONFLICT \(organization_id\) DO NOTHING[\s\S]*SET next_ticket_number = next_ticket_number \+ 1[\s\S]*AND next_ticket_number <= 99999[\s\S]*RETURNING next_ticket_number - 1 AS ticket_number/s,
    "Ticket numbers should start from 10000 per organization and stop at the 5 digit limit."
  );

  assert.match(
    financeServiceSource,
    /"ft\.id IS NULL"[\s\S]*LEFT JOIN finance_tickets ft[\s\S]*ft\.appointment_schedule_id = a\.id[\s\S]*ft\.status <> 'voided'/s,
    "Cashier board should not show appointment cards that already have a non-voided ticket."
  );

  assert.match(
    financeServiceSource,
    /issuedTickets: tickets\.filter\(\(item\) => item\.status === "issued" \|\| item\.status === "unpaid"\)/,
    "Cashier ticket column should keep unpaid/partially paid tickets visible until they are fully paid."
  );

  assert.match(
    financeServiceSource,
    /export async function getCashierBoard[\s\S]*COALESCE\(fti\.items, '\[\]'::json\) AS items[\s\S]*'finalAmountUzs', fti_item\.final_amount_uzs[\s\S]*FROM finance_ticket_items fti_item/s,
    "Cashier board tickets should include every ticket item so multi-service manual tickets can be opened with full details."
  );

  assert.match(
    financeServiceSource,
    /export async function getCashierBoard[\s\S]*'serviceName', COALESCE\(NULLIF\(TRIM\(a\.service_name\), ''\), fti_item\.service_name\)/s,
    "Cashier payment details should prefer the real appointment service name for appointment-backed tickets."
  );

  assert.match(
    financeServiceSource,
    /function buildTicketsListWhere[\s\S]*const statuses = Array\.from\(new Set\([\s\S]*"issued", "paid", "unpaid", "voided"[\s\S]*if \(statuses\.length > 0\)[\s\S]*where\.push\(`ft\.status = ANY\(\$\$\{params\.length\}::text\[\]\)`\)[\s\S]*else \{[\s\S]*where\.push\("ft\.status <> 'voided'"\)/s,
    "Finance ticket list filters should support multiple statuses and hide deleted/voided tickets unless explicitly requested."
  );

  assert.match(
    financeServiceSource,
    /function buildTicketsListWhere[\s\S]*const ticketCreatedFrom = normalizeDate\(filters\.ticketCreatedFrom \?\? filters\.ticket_created_from\);[\s\S]*ft\.created_at::date >= \$\$\{params\.length\}::date[\s\S]*ft\.created_at::date <= \$\$\{params\.length\}::date[\s\S]*ft\.ticket_date >= \$\$\{params\.length\}/s,
    "Finance ticket list should support created-at defaults separately from manual ticket-date filters."
  );

  assert.match(
    financeServiceSource,
    /function mapTicket\(row\) \{[\s\S]*ticketDate: normalizeDate\(row\.ticket_date\)[\s\S]*appointmentDate: normalizeDate\(row\.appointment_date\)/s,
    "Finance ticket list should return date-only ticket fields so browser timezones cannot shift the visible ticket date."
  );

  assert.match(
    financeServiceSource,
    /export async function getFinanceTickets[\s\S]*LEFT JOIN LATERAL \([\s\S]*t\.status = 'posted' AND t\.transaction_type IN \('ticket_payment', 'deposit_ticket_payment'\)[\s\S]*COUNT\(\*\) AS payment_activity_count,[\s\S]*COUNT\(\*\) FILTER \(WHERE t\.status = 'posted'\) AS posted_payment_activity_count[\s\S]*AND t\.transaction_type IN \('ticket_payment', 'deposit_ticket_payment', 'refund', 'deposit_ticket_refund'\)[\s\S]*\) fpaid ON TRUE[\s\S]*COALESCE\(fpaid\.paid_amount_uzs, 0\) AS paid_amount_uzs,[\s\S]*COALESCE\(fpaid\.payment_activity_count, 0\) AS payment_activity_count,[\s\S]*COALESCE\(fpaid\.posted_payment_activity_count, 0\) AS posted_payment_activity_count/s,
    "Finance ticket list should expose posted paid totals, posted payment activity and all payment activity so touched tickets can gate edit/delete actions separately."
  );

  assert.match(
    financeServiceSource,
    /const summaryResult = await pool\.query\([\s\S]*SUM\(COALESCE\(ft\.subtotal_uzs, ft\.amount_uzs, 0\)\)[\s\S]*SUM\(COALESCE\(ft\.discount_uzs, 0\)\)[\s\S]*SUM\(COALESCE\(ft\.total_uzs, ft\.amount_uzs, 0\)\)[\s\S]*SUM\(COALESCE\(fpaid\.paid_amount_uzs, 0\)\)[\s\S]*SUM\(GREATEST\([\s\S]*COALESCE\(ft\.total_uzs, ft\.amount_uzs, 0\) - COALESCE\(fpaid\.paid_amount_uzs, 0\)[\s\S]*summary: \{[\s\S]*subtotalAmountUzs:[\s\S]*discountAmountUzs:[\s\S]*totalAmountUzs:[\s\S]*paidAmountUzs:[\s\S]*remainingAmountUzs:/s,
    "Finance ticket list should return service price, discount and payment summary totals for the full current filter, not only the visible page."
  );

  assert.match(
    financeServiceSource,
    /function formatDateYmdInTashkent\(value\) \{[\s\S]*timeZone: "Asia\/Tashkent"[\s\S]*function normalizeDate\(value\) \{[\s\S]*return formatDateYmdInTashkent\(value\);/s,
    "Finance date-only normalization should keep Tashkent calendar dates instead of shifting them through UTC."
  );

  assert.match(
    financeServiceSource,
    /if \(error\?\.code === "23505"\)[\s\S]*Ticket already exists for this appointment/s,
    "Duplicate active appointment tickets should be mapped to a user-facing conflict."
  );

  assert.match(
    financeServiceSource,
    /export async function getCashierBoard\(\{[\s\S]*clientQuery,[\s\S]*serviceId,[\s\S]*specialistId,[\s\S]*query,[\s\S]*limit[\s\S]*\}\)[\s\S]*normalizeText\(query, 96\)[\s\S]*appointmentFilters\.push\(`\([\s\S]*a\.client_id::text = \$\$\{exactParam\}[\s\S]*ticketFilters\.push\(`\([\s\S]*ft\.ticket_number::text = \$\$\{exactParam\}/s,
    "Cashier board search should be applied server-side for appointments and tickets before grouping."
  );

  assert.match(
    financeServiceSource,
    /const normalizedClientQuery = normalizeText\(clientQuery, 96\)[\s\S]*appointmentFilters\.push\(`\([\s\S]*LOWER\(CONCAT_WS\(' ', c\.last_name, c\.first_name, c\.middle_name\)\) LIKE \$\$\{likeParam\}[\s\S]*a\.client_id::text = \$\$\{exactParam\}[\s\S]*appointmentFilters\.push\(`a\.service_id = \$\$\{appointmentParams\.length\}`\)[\s\S]*appointmentFilters\.push\(`a\.specialist_id = \$\$\{appointmentParams\.length\}`\)/s,
    "Cashier appointment columns should apply client, service and specialist filters before the board limit."
  );

  assert.match(
    financeServiceSource,
    /ticketFilters\.push\(`\([\s\S]*LOWER\(CONCAT_WS\(' ', c\.last_name, c\.first_name, c\.middle_name\)\) LIKE \$\$\{likeParam\}[\s\S]*ft\.client_id::text = \$\$\{exactParam\}[\s\S]*ticketFilters\.push\(`\([\s\S]*ft\.service_id = \$\$\{serviceParam\}[\s\S]*FROM finance_ticket_items fti_filter[\s\S]*fti_filter\.service_id = \$\$\{serviceParam\}[\s\S]*ticketFilters\.push\(`\([\s\S]*ft\.specialist_id = \$\$\{specialistParam\}[\s\S]*fti_filter\.specialist_id = \$\$\{specialistParam\}/s,
    "Cashier ticket column should apply client, service and specialist filters, including multi-service ticket items, before the board limit."
  );

  assert.match(
    financeServiceSource,
    /const todayYmd = getTodayYmdInTashkent\(\);[\s\S]*const boardDateFrom = dates\.from \|\| dates\.to \|\| todayYmd;[\s\S]*const boardDateTo = dates\.to \|\| boardDateFrom;[\s\S]*"a\.appointment_date >= \$2::date"[\s\S]*"a\.appointment_date <= \$3::date"[\s\S]*const ticketParams = \[organizationId\];[\s\S]*"ft\.status IN \('issued', 'unpaid'\)"/s,
    "Cashier board appointment columns should stay date-scoped while open tickets remain visible until paid."
  );

  assert.match(
    financeServiceSource,
    /const CASHIER_BOARD_DEFAULT_LIMIT = 100;[\s\S]*function normalizeCashierBoardLimit\(value\)[\s\S]*return Math\.min\(parsed, CASHIER_BOARD_MAX_LIMIT\);/s,
    "Cashier board should default to a bounded 100-card batch."
  );

  assert.match(
    financeServiceSource,
    /appointmentParams\.push\(boardLimit\)[\s\S]*COUNT\(\*\) OVER \(PARTITION BY a\.status\) AS total_count,[\s\S]*ROW_NUMBER\(\) OVER \(PARTITION BY a\.status ORDER BY a\.appointment_date ASC, a\.start_time ASC, a\.id ASC\)[\s\S]*WHERE a\.board_row_number <= \$\$\{appointmentLimitParam\}/s,
    "Cashier appointment status columns should be limited per status while keeping total counts."
  );

  assert.match(
    financeServiceSource,
    /overdueAppointmentParams\.push\(boardLimit\)[\s\S]*COUNT\(\*\) OVER \(\) AS total_count,[\s\S]*ROW_NUMBER\(\) OVER \(ORDER BY a\.appointment_date DESC, a\.start_time ASC, a\.id ASC\)[\s\S]*WHERE a\.board_row_number <= \$\$\{overdueAppointmentLimitParam\}/s,
    "Awaiting Ticket should be limited separately while keeping its full total count."
  );

  assert.match(
    financeServiceSource,
    /ticketParams\.push\(boardLimit\)[\s\S]*COUNT\(\*\) OVER \(\) AS total_count[\s\S]*ORDER BY ft\.updated_at DESC, ft\.id DESC[\s\S]*LIMIT \$\$\{ticketLimitParam\}[\s\S]*const totals = \{/s,
    "Cashier board should load cards in shared server-side batches while returning total counts for every column."
  );

  assert.match(
    financeServiceSource,
    /export async function getCashierBoard[\s\S]*JOIN role_options r[\s\S]*r\.id = u\.role_id[\s\S]*LOWER\(TRIM\(r\.label\)\) LIKE '%specialist%'[\s\S]*LOWER\(TRIM\(COALESCE\(p\.label, ''\)\)\) LIKE '%mutaxassis%'[\s\S]*specialists: specialistsResult\.rows\.map\(mapSpecialistOption\)/s,
    "Cashier board specialist references should only include appointment specialist role or position users."
  );

  assert.match(
    financeServiceSource,
    /export async function getFinanceTicketFilterReferences[\s\S]*JOIN role_options r[\s\S]*r\.id = u\.role_id[\s\S]*LOWER\(TRIM\(r\.label\)\) LIKE '%specialist%'[\s\S]*LOWER\(TRIM\(COALESCE\(p\.label, ''\)\)\) LIKE '%mutaxassis%'[\s\S]*specialists: specialistsResult\.rows\.map\(mapSpecialistOption\)/s,
    "Finance ticket filter and edit references should only include appointment specialist role or position users."
  );

  assert.match(
    financeServiceSource,
    /getAppointmentHistoryLockDaysByOrganization\(organizationId\)[\s\S]*historyLockCutoffDate[\s\S]*overdueAppointmentFilters[\s\S]*"a\.status = 'confirmed'"[\s\S]*"ft\.id IS NULL"[\s\S]*"a\.appointment_date >= \$2::date"[\s\S]*"a\.appointment_date < \$3::date"[\s\S]*overdueConfirmedAppointments: overdueAppointments/s,
    "Cashier board should expose past confirmed appointment cards without tickets only inside the history-lock window."
  );
});

test("finance ticket creation accepts pending or confirmed appointments and snapshots ticket item totals", () => {
  assert.match(
    financeServiceSource,
    /appointment = await getAppointmentForTicket\(db, \{ organizationId, appointmentScheduleId, forUpdate: true \}\)[\s\S]*if \(!\["pending", "confirmed"\]\.includes\(appointment\.status\)\)[\s\S]*Only pending or confirmed appointments can become tickets/s,
    "Appointment-backed tickets should lock the planner lesson and only accept pending or confirmed statuses."
  );

  assert.match(
    financeServiceSource,
    /const appointmentDate = normalizeDate\(appointment\.appointment_date\);[\s\S]*appointment\.status === "pending" && appointmentDate && appointmentDate > getTodayYmdInTashkent\(\)[\s\S]*Future appointments cannot be confirmed/s,
    "Pending appointment tickets should still block future appointments before confirming them."
  );

  assert.match(
    financeServiceSource,
    /ticketClientId = appointment\.client_id[\s\S]*ticketSpecialistId = appointment\.specialist_id[\s\S]*amountUzs = requestedAmount > 0 \? requestedAmount : normalizeAmount\(appointment\.service_price_uzs, 0\)[\s\S]*ticketDate = appointmentDate \|\| ticketDate/s,
    "Appointment-backed tickets should snapshot client, specialist, service price and appointment date."
  );

  assert.match(
    financeServiceSource,
    /const shouldConfirmAppointment = appointment\.status === "pending";[\s\S]*if \(shouldConfirmAppointment \|\| shouldSyncService\) \{[\s\S]*updateAppointmentSchedulesByIds[\s\S]*status: shouldConfirmAppointment \? "confirmed" : appointment\.status,[\s\S]*activateClient: false/s,
    "Pending appointment cards should only be confirmed inside the ticket creation save transaction."
  );

  assert.match(
    financeServiceSource,
    /let items = await buildTicketItems[\s\S]*const totals = getTicketTotals\(items\)[\s\S]*const ticketStatus = totals\.totalUzs <= 0 \? "paid" : "issued"[\s\S]*INSERT INTO finance_tickets[\s\S]*subtotal_uzs, discount_uzs, total_uzs, status[\s\S]*await insertTicketItems/s,
    "Tickets should be issued with immutable line items and calculated subtotal/discount/total."
  );

  assert.match(
    financeServiceSource,
    /action: "created"[\s\S]*details: \{[\s\S]*ticketDate,[\s\S]*note,[\s\S]*totals,[\s\S]*items: historyItems/s,
    "Ticket creation history should preserve the ticket note in details."
  );

  assert.match(
    financeServiceSource,
    /export async function getFinanceTicketHistory[\s\S]*SELECT id,[\s\S]*note[\s\S]*const ticketNote = normalizeText\(ticketResult\.rows\[0\]\?\.note\);[\s\S]*details: details\.note \? details : \{ \.\.\.details, note: ticketNote \}/s,
    "Ticket history should backfill created details from the ticket note for existing tickets."
  );

  assert.match(
    financeServiceSource,
    /const requestedPriceUzs = normalizeAmount\(rawItem\?\.priceUzs[\s\S]*const snapshotPriceUzs = usesAppointmentSnapshot[\s\S]*appointment\.service_price_uzs[\s\S]*const priceUzs = requestedPriceUzs > 0[\s\S]*snapshotPriceUzs > 0 \? snapshotPriceUzs : normalizeAmount\(service\?\.price_uzs, 0\)/s,
    "Ticket line items should prefer the submitted price, then the appointment snapshot, then the active catalog price."
  );
  assert.match(
    financeServiceSource,
    /const submittedServiceName = normalizeText\(rawItem\?\.serviceName \?\? rawItem\?\.service_name, 128\);[\s\S]*const itemServiceName = appointment[\s\S]*submittedServiceName \|\| normalizeText\(appointment\.service_name, 128\) \|\| normalizeText\(service\?\.name, 128\)[\s\S]*serviceName: itemServiceName/s,
    "Appointment-backed ticket line items should keep the real appointment service name instead of falling back to specialist position-like catalog labels."
  );
  assert.match(
    financeServiceSource,
    /const requestedDiscountUzs = normalizeAmount\(rawItem\?\.discountUzs \?\? rawItem\?\.discount_uzs, -1\);[\s\S]*const discountUzs = requestedDiscountUzs >= 0[\s\S]*Math\.min\(priceUzs, requestedDiscountUzs\)[\s\S]*calculateDiscountUzs\(\{ priceUzs, discountType, discountValue \}\)/s,
    "Ticket line items should accept exact distributed UZS discounts while preserving the submitted discount metadata."
  );
  assert.match(
    financeServiceSource,
    /const FINANCE_DISCOUNT_MAX_PERCENT_VALUE = 100;[\s\S]*function assertDiscountValueIsAllowed\(\{ discountType, discountValue \}\)[\s\S]*discountType === "percent" && discountValue > FINANCE_DISCOUNT_MAX_PERCENT_VALUE[\s\S]*Percent discount cannot be greater than 100\.[\s\S]*const discountValue = normalizeAmount\(rawItem\?\.discountValue \?\? rawItem\?\.discount_value, 0\);[\s\S]*assertDiscountValueIsAllowed\(\{ discountType, discountValue \}\);/s,
    "Ticket line items should reject percent discounts greater than 100 before totals are calculated."
  );

  assert.match(
    financeServiceSource,
    /function assertTicketDateIsNotFuture\(ticketDate\) \{[\s\S]*normalizedTicketDate > getTodayYmdInTashkent\(\)[\s\S]*Future ticket dates are not allowed\.[\s\S]*export async function createFinanceTicket[\s\S]*ticketDate = ticketDate \|\| getTodayYmdInTashkent\(\);[\s\S]*assertTicketDateIsNotFuture\(ticketDate\);/s,
    "Finance ticket creation should reject manual future ticket dates and use the Tashkent business date fallback."
  );

  assert.match(
    financeServiceSource,
    /export async function updateFinanceTicket[\s\S]*if \(hasTicketDate\) \{[\s\S]*assertTicketDateIsNotFuture\(ticketDate\);[\s\S]*\}/s,
    "Finance ticket edits should not be able to move a ticket into a future date."
  );
});

test("finance client discounts apply only to appointment tickets and keep usage limits separate", () => {
  assert.match(
    financeRoutesSource,
    /from "\.\/finance-discounts\.service\.js";[\s\S]*"\/discounts"[\s\S]*requireDiscountsAccess\(request, reply, "read"\)[\s\S]*"\/discounts\/references"[\s\S]*"\/discounts\/clients"[\s\S]*"\/discounts\/:id"[\s\S]*"\/discounts"[\s\S]*requireDiscountsAccess\(request, reply, "create"\)[\s\S]*"\/discounts\/:id"[\s\S]*requireDiscountsAccess\(request, reply, "update"\)/s,
    "Finance should expose dedicated client discount read/create/update endpoints."
  );

  assert.match(
    financeDiscountsSource,
    /CREATE|finance_client_discount_rules|finance_client_discount_rule_services|finance_client_discount_usages/s,
    "Discount service source should be available for route tests."
  );

  assert.match(
    financeDiscountsSource,
    /getDiscountCandidatesForService[\s\S]*finance_client_discount_usages[\s\S]*reversed_at IS NULL[\s\S]*r\.is_active = TRUE[\s\S]*ORDER BY r\.created_at ASC, r\.id ASC, rs\.id ASC[\s\S]*FOR UPDATE OF r, rs/s,
    "Discount candidates should lock active oldest rules first and count only unreversed usage."
  );

  assert.match(
    financeDiscountsSource,
    /export async function applyClientDiscountsToTicketItems[\s\S]*reservations = new Map\(\)[\s\S]*candidate\.limit_count === null[\s\S]*used_count[\s\S]*reserved[\s\S]*clientDiscountRuleId[\s\S]*clientDiscountRuleServiceId/s,
    "Applying discounts should respect finite and unlimited service limits inside the current transaction."
  );

  assert.match(
    financeRouteSchemasSource,
    /clientDiscountLimitCountSchema[\s\S]*maximum: 22[\s\S]*pattern: "\^\(\?:\[1-9\]\|1\\\\d\|2\[0-2\]\)\$"[\s\S]*nullableClientDiscountLimitCountSchema[\s\S]*type: "null"[\s\S]*clientDiscountLimitCountSchema[\s\S]*limitCount: nullableClientDiscountLimitCountSchema[\s\S]*limit_count: nullableClientDiscountLimitCountSchema/s,
    "Client discount service counts should be limited to 1..22 while allowing null for unlimited rows at the route schema level."
  );

  assert.match(
    financeRouteSchemasSource,
    /discountListQuery:[\s\S]*createdFrom[\s\S]*createdTo[\s\S]*clientName[\s\S]*serviceName[\s\S]*isActive: booleanLikeSchema/s,
    "Client discount list schema should accept created date, client, service, and active-state filters."
  );

  assert.match(
    financeRouteSchemasSource,
    /discountUpdateBody:[\s\S]*isActive[\s\S]*is_active[\s\S]*disableReason[\s\S]*disable_reason[\s\S]*reason/s,
    "Client discount updates should accept a required cashier reason when disabling a discount."
  );

  assert.match(
    financeRouteSchemasSource,
    /ticketDiscountPreviewBody:[\s\S]*appointmentScheduleId[\s\S]*amountUzs[\s\S]*serviceId[\s\S]*items:[\s\S]*ticketItemSchema/s,
    "Appointment ticket discount preview should accept service item data."
  );

  assert.match(
    financeDiscountsSource,
    /const createdFrom = normalizeDate\(filters\.createdFrom[\s\S]*const client = normalizeText\(filters\.client \?\? filters\.clientName[\s\S]*const clientPhoneDigits = client\.replace\(\/\\D\/g, ""\);[\s\S]*const clientNameTokens = client\.split\(\/\\s\+\/\)\.filter\(Boolean\)\.slice\(0, 6\);[\s\S]*const service = normalizeText\(filters\.service \?\? filters\.serviceName[\s\S]*const isActive = normalizeActiveFilter/s,
    "Client discount list query should normalize created date, client search, service name, and active-state filters."
  );

  assert.match(
    financeDiscountsSource,
    /r\.created_at::date >=[\s\S]*r\.created_at::date <=[\s\S]*clientTokenConditions = clientNameTokens\.map[\s\S]*LOWER\(CONCAT_WS\(' ', c\.last_name, c\.first_name, c\.middle_name\)\) LIKE[\s\S]*clientTokenConditions\.join\(" AND "\)[\s\S]*r\.client_id::text =[\s\S]*COALESCE\(c\.phone_number, ''\) LIKE[\s\S]*regexp_replace\(COALESCE\(c\.phone_number[\s\S]*finance_client_discount_rule_services rs_filter[\s\S]*r\.is_active =/s,
    "Client discount list query should filter by created date, client name/id/phone, service name, and active state."
  );

  assert.match(
    financeDiscountsSource,
    /CLIENT_DISCOUNT_MAX_LIMIT_COUNT = 22[\s\S]*Service count cannot exceed 22\./s,
    "Client discount service counts should also be capped in the service layer."
  );

  assert.match(
    financeDiscountsSource,
    /calculatePackagePerUseDiscounts[\s\S]*priceUzs \* limitCount[\s\S]*totalDiscountUzs[\s\S]*exactPerUseDiscount[\s\S]*per_use_discount_uzs/s,
    "Amount client discounts should be stored as package totals and distributed into per-use service discounts."
  );

  assert.match(
    financeDiscountsSource,
    /getDiscountCandidatesForService[\s\S]*rs\.per_use_discount_uzs[\s\S]*discountType === "amount" && perUseDiscountUzs !== null[\s\S]*discountValue: discountType === "amount" \? discountUzs : discountValue/s,
    "Appointment ticket discounts should apply stored per-use amount discounts while preserving percentage rules."
  );

  assert.match(
    financeDiscountsSource,
    /getDiscountCandidatesForService\(db,[\s\S]*forUpdate = true[\s\S]*\$\{forUpdate \? "FOR UPDATE OF r, rs" : ""\}[\s\S]*applyClientDiscountsToTicketItems\(db,[\s\S]*forUpdate = true/s,
    "Discount candidates should lock for writes but allow read-only preview without row locks."
  );

  assert.match(
    financeDiscountsSource,
    /updateFinanceClientDiscount[\s\S]*disableReason = normalizeText[\s\S]*if \(!isActive && !disableReason\)[\s\S]*Disable reason is required\.[\s\S]*disabled_reason = \$5[\s\S]*disabled_by = \$6[\s\S]*disabled_at = CASE WHEN \$3 = FALSE/s,
    "Disabling a client discount should require and persist the cashier's reason."
  );

  assert.match(
    financeServiceSource,
    /if \(appointmentScheduleId && appointment\) \{[\s\S]*applyClientDiscountsToTicketItems[\s\S]*\}[\s\S]*insertClientDiscountUsages/s,
    "Automatic client discounts should be applied during appointment-backed ticket creation."
  );

  assert.match(
    financeRoutesSource,
    /"\/cashier\/appointments\/:id\/ticket-discount-preview"[\s\S]*ticketDiscountPreviewBody[\s\S]*requireCashierAccess\(request, reply, "read"\)[\s\S]*previewFinanceAppointmentTicketDiscount/s,
    "Cashier should be able to preview automatic client discounts before creating an appointment ticket."
  );

  assert.match(
    financeServiceSource,
    /export async function previewFinanceAppointmentTicketDiscount[\s\S]*getAppointmentForTicket\(db,[\s\S]*forUpdate: false[\s\S]*buildTicketItems[\s\S]*applyClientDiscountsToTicketItems\(db,[\s\S]*forUpdate: false[\s\S]*hasClientDiscount/s,
    "Appointment ticket discount preview should calculate the same client discount without consuming usage."
  );

  assert.doesNotMatch(
    financeServiceSource,
    /source = "manual"[\s\S]{0,300}applyClientDiscountsToTicketItems/s,
    "Manual ticket creation should not auto-apply client discounts."
  );

  assert.match(
    financeServiceSource,
    /if \(nextItems && isAppointmentTicket\) \{[\s\S]*reverseClientDiscountUsagesForTicket[\s\S]*applyClientDiscountsToTicketItems[\s\S]*insertClientDiscountUsages/s,
    "Appointment ticket edits should reverse old discount usage before writing the new usage ledger."
  );

  assert.match(
    financeServiceSource,
    /async function updateTicketStatus[\s\S]*if \(action === "voided"\) \{[\s\S]*reverseClientDiscountUsagesForTicket/s,
    "Voiding a ticket should restore any client discount usage count."
  );
});

test("cashier can confirm pending planner cards before creating tickets without bypassing locks", () => {
  assert.match(
    financeRoutesSource,
    /"\/cashier\/appointments\/:id\/confirm"[\s\S]*requireCashierAccess\(request, reply, "update"\)[\s\S]*confirmCashierAppointment/s,
    "Cashier appointment confirmation should be exposed as a finance update permission route."
  );

  assert.match(
    financeServiceSource,
    /export async function confirmCashierAppointment[\s\S]*getCashierAppointmentById[\s\S]*forUpdate: true[\s\S]*finance_ticket_id[\s\S]*This appointment has a finance ticket[\s\S]*appointment\.status !== "pending"[\s\S]*Only pending appointments can be confirmed/s,
    "Cashier confirmation should lock the appointment, reject ticket-locked cards and only promote pending cards."
  );

  assert.match(
    financeServiceSource,
    /getTodayYmdInTashkent\(\)[\s\S]*Future appointments cannot be confirmed[\s\S]*updateAppointmentSchedulesByIds[\s\S]*status: "confirmed"[\s\S]*applyAppointmentDate: false/s,
    "Cashier confirmation should keep appointment history and the future-confirmation rule."
  );
});

test("finance payments, deposits and refunds preserve cash-session and balance rules", () => {
  assert.match(
    financeServiceSource,
    /export async function payFinanceTicket[\s\S]*getTicketById\(db, \{ organizationId, id: ticketId, forUpdate: true \}\)[\s\S]*paymentMethodId[\s\S]*AND is_active = TRUE[\s\S]*paid_amount_uzs[\s\S]*payableAmountUzs[\s\S]*if \(amountUzs > payableAmountUzs\)[\s\S]*Payment amount exceeds selected tickets total\.[\s\S]*const nextStatus = nextPaidAmountUzs >= totalAmountUzs \? "paid" : "unpaid"[\s\S]*transactionType: "ticket_payment"[\s\S]*direction: "in"[\s\S]*SET status = \$3/s,
    "Ticket payment should lock the ticket, require an active method, allow partial payment up to the remaining amount, and only mark tickets paid when fully covered."
  );

  assert.match(
    financeServiceSource,
    /export async function updateFinanceTicket[\s\S]*const paymentActivityCount = await getTicketPostedPaymentActivityCount\(db, \{ organizationId, ticketId \}\);[\s\S]*Tickets with payments cannot be edited\./s,
    "Ticket edits should be blocked while the ticket has posted payment or refund activity."
  );
  assert.match(
    financeServiceSource,
    /const isAppointmentTicket = current\.source === "appointment" \|\| Boolean\(current\.appointment_schedule_id\);[\s\S]*if \(hasClientId && clientId !== currentClientId\) \{[\s\S]*Ticket client cannot be changed\.[\s\S]*if \(isAppointmentTicket && hasTicketDate && ticketDate !== currentTicketDate\) \{[\s\S]*Appointment ticket date cannot be changed\./s,
    "Ticket edits should keep clients immutable and lock appointment-backed ticket dates."
  );
  assert.match(
    financeServiceSource,
    /if \(isAppointmentTicket\) \{[\s\S]*expectedItemCount[\s\S]*Appointment ticket line count cannot be changed\.[\s\S]*previousSpecialistId[\s\S]*nextSpecialistId[\s\S]*Appointment ticket specialist cannot be changed\./s,
    "Appointment-backed ticket edits should only allow service changes, not specialist or line-count changes."
  );
  assert.match(
    financeServiceSource,
    /async function syncAppointmentTicketService\(db, \{ organizationId, actorUserId, appointmentScheduleId, item \}\)[\s\S]*getAppointmentForTicket\(db, \{[\s\S]*forUpdate: true[\s\S]*nextServiceId[\s\S]*nextServiceName[\s\S]*nextServicePriceUzs[\s\S]*updateAppointmentSchedulesByIds\(\{[\s\S]*ids: \[appointment\.id\],[\s\S]*serviceId: nextServiceId,[\s\S]*serviceName: nextServiceName,[\s\S]*servicePriceUzs: nextServicePriceUzs,[\s\S]*applyAppointmentDate: false,[\s\S]*activateClient: false/s,
    "Appointment-backed ticket service edits should sync the linked planner slot service without reactivating the client."
  );
  assert.match(
    financeServiceSource,
    /if \(nextItems\) \{[\s\S]*const insertedItems = await insertTicketItems\(db, \{ organizationId, ticketId, items: nextItems \}\);[\s\S]*await insertClientDiscountUsages\(db,[\s\S]*if \(isAppointmentTicket\) \{[\s\S]*await syncAppointmentTicketService\(db, \{[\s\S]*appointmentScheduleId,[\s\S]*item: nextItems\[0\]/s,
    "Ticket update flow should apply the appointment service sync in the same transaction as the ticket item update."
  );
  assert.match(
    appointmentSettingsServiceSource,
    /export async function updateAppointmentSchedulesByIds\(\{[\s\S]*activateClient = true,[\s\S]*AND \$17::boolean[\s\S]*Boolean\(activateClient\)/s,
    "Appointment schedule updates should allow finance service sync to avoid unintended client reactivation."
  );

  assert.match(
    financeServiceSource,
    /async function updateTicketStatus[\s\S]*if \(action === "voided"\) \{[\s\S]*const paymentActivityCount = await getTicketPostedPaymentActivityCount\(db, \{ organizationId, ticketId \}\);[\s\S]*if \(paymentActivityCount > 0\) \{[\s\S]*Tickets with payments cannot be deleted\./s,
    "Ticket delete/void should be blocked only while posted payment or refund activity still exists."
  );

  assert.match(
    financeRoutesSource,
    /"\/client-balances\/deposit"[\s\S]*requireCashierAccess\(request, reply, "pay"\)[\s\S]*topUpFinanceClientDeposit/s,
    "Client deposit top-up should be exposed only as a cashier payment operation."
  );

  assert.match(
    financeRoutesSource,
    /"\/client-balances\/refund"[\s\S]*requireCashierAccess\(request, reply, "pay"\)[\s\S]*refundFinanceClientDeposit/s,
    "Client deposit refunds should be exposed only as cashier payment operations."
  );

  assert.match(
    financeServiceSource,
    /export async function topUpFinanceClientDeposit[\s\S]*transactionType: "deposit_in"[\s\S]*direction: "in"[\s\S]*export async function refundFinanceClientDeposit[\s\S]*transactionType: "deposit_out"[\s\S]*direction: "out"[\s\S]*requireReason: true/s,
    "Client deposit top-up and refund operations should create explicit deposit transactions with history."
  );

  assert.match(
    financeServiceSource,
    /async function createFinanceDepositTransaction[\s\S]*lockClientFinanceBalance[\s\S]*getActivePaymentMethod[\s\S]*Payment method not found\.[\s\S]*if \(transactionType === "deposit_out"\)[\s\S]*getClientDepositBalance[\s\S]*Refund amount exceeds client deposit\.[\s\S]*getOpenCashSession/s,
    "Client deposit operations should lock the balance, validate payment method, prevent negative deposit and require an open cash session."
  );

  assert.match(
    financeRoutesSource,
    /"\/transactions\/:id\/void"[\s\S]*requireCashierAccess\(request, reply, "pay"\)[\s\S]*voidFinanceTransaction/s,
    "Transaction voids should require cashier payment permission, not balance maintenance permission."
  );

  assert.match(
    financeRoutesSource,
    /"\/client-balances\/pay-from-deposit"[\s\S]*requireCashierAccess\(request, reply, "pay"\)[\s\S]*payFinanceTicketsFromDeposit/s,
    "Deposit ticket payments should remain a cashier payment operation even when initiated from a balance context."
  );

  assert.match(
    financeServiceSource,
    /async function lockClientFinanceBalance[\s\S]*pg_advisory_xact_lock[\s\S]*export async function voidFinanceTransaction[\s\S]*transaction_type IN \('refund', 'deposit_ticket_refund'\)[\s\S]*Cancel the refund before cancelling the original payment\.[\s\S]*const depositBalanceImpact = isClosedCashSession[\s\S]*getLedgerDepositChange\(\{[\s\S]*reversalSpec\.transactionType[\s\S]*getLedgerDepositChange\(current\)[\s\S]*nextDeposit < 0[\s\S]*Transaction cancellation would make client deposit negative\./s,
    "Transaction voids should respect refund dependencies, serialize deposit-affecting changes and block negative deposits."
  );

  assert.match(
    financeServiceSource,
    /function getTransactionReversalSpec\(row\)[\s\S]*case "ticket_payment":[\s\S]*transactionType: "refund"[\s\S]*case "refund":[\s\S]*transactionType: "ticket_payment"[\s\S]*case "deposit_ticket_payment":[\s\S]*transactionType: "deposit_ticket_refund"[\s\S]*case "deposit_ticket_refund":[\s\S]*transactionType: "deposit_ticket_payment"/s,
    "Closed cash-session transaction corrections should use accounting-aware reversal transaction types."
  );

  assert.match(
    financeServiceSource,
    /const isClosedCashSession = current\.cash_session_status === "closed";[\s\S]*const cashSession = await getOpenCashSession\(db,[\s\S]*insertFinanceTransaction\(db, \{[\s\S]*cashSessionId: cashSession\.id,[\s\S]*transactionType: reversalSpec\.transactionType,[\s\S]*source: "closed_session_transaction_reversal"[\s\S]*reversalTransactionId[\s\S]*status = 'voided'/s,
    "Voiding a closed-session transaction should create a current-session reversal and metadata link instead of changing the closed session movement."
  );

  assert.match(
    financeServiceSource,
    /export async function payFinanceTicketsFromDeposit[\s\S]*LEFT JOIN LATERAL[\s\S]*AND ft\.status IN \('issued', 'unpaid'\)[\s\S]*FOR UPDATE OF ft[\s\S]*payableAmountUzs[\s\S]*const currentDeposit = await getClientDepositBalance[\s\S]*if \(totalAmountUzs > currentDeposit\)[\s\S]*VALUES \(\$1, \$2, NULL, \$3, \$4, \$5\)[\s\S]*transactionType: "deposit_ticket_payment"[\s\S]*direction: "transfer"[\s\S]*paymentMethodId: null[\s\S]*SET status = 'paid'/s,
    "Deposit ticket payments should close remaining payable debt tickets and use transfer transactions without cash payment methods."
  );

  assert.match(
    financeServiceSource,
    /export async function payFinanceTicketsBatch[\s\S]*LEFT JOIN LATERAL[\s\S]*FOR UPDATE OF ft[\s\S]*paid_amount_uzs[\s\S]*payableAmountUzs[\s\S]*if \(paidAmountUzs > totalAmountUzs\)[\s\S]*Payment amount exceeds selected tickets total\.[\s\S]*break;[\s\S]*const nextStatus = nextPaidAmountUzs >= ticket\.totalAmountUzs \? "paid" : "unpaid"[\s\S]*SET status = \$3/s,
    "Batch ticket payments should accept partial allocations and leave partially paid tickets in unpaid status."
  );

  assert.match(
    financeServiceSource,
    /export async function payFinanceTicketsBatch[\s\S]*const selectedClientIds = new Set\(tickets\.map\(\(ticket\) => parsePositiveInteger\(ticket\.client_id\)\)\.filter\(Boolean\)\);[\s\S]*if \(selectedClientIds\.size !== 1\) \{[\s\S]*Select tickets from one client only\./s,
    "Batch ticket payments should reject tickets from multiple clients."
  );

  assert.match(
    financeServiceSource,
    /FINANCE_BATCH_PAYMENT_SCHEMA_ERROR_CODES[\s\S]*23514[\s\S]*function isFinanceBatchPaymentSchemaError\(error\) \{[\s\S]*finance_payment_groups[\s\S]*payment_group_id[\s\S]*payment_method_id[\s\S]*chk_finance_transactions_type[\s\S]*export async function payFinanceTicketsBatch[\s\S]*createMigrationRequiredError\("Finance payment migration is required before batch payments can be processed\.",[\s\S]*20260606_000001_finance_payment_method_nullable_safety\.sql/s,
    "Batch ticket payment schema mismatches should be reported as migration-required instead of a generic 500."
  );

  assert.match(
    financeRoutesSource,
    /function sendRouteError\(reply, error, fallbackMessage\) \{[\s\S]*error\?\.code === "MIGRATION_REQUIRED"[\s\S]*reply\.status\(409\)[\s\S]*code: error\.code/s,
    "Finance routes should return migration-required errors without masking them as generic payment failures."
  );

  assert.match(
    financeServiceSource,
    /export async function refundFinanceTicket[\s\S]*getTicketById\(db, \{ organizationId, id: ticketId, forUpdate: true \}\)[\s\S]*if \(current\.status !== "paid"\)[\s\S]*Only paid tickets can be refunded\.[\s\S]*JOIN LATERAL \([\s\S]*t\.status = 'posted'[\s\S]*t\.transaction_type IN \('ticket_payment', 'deposit_ticket_payment'\)[\s\S]*NOT EXISTS \([\s\S]*refunded\.transaction_type IN \('refund', 'deposit_ticket_refund'\)[\s\S]*for \(const payment of payments\)[\s\S]*paymentGroupId: payment\.payment_group_id \|\| null[\s\S]*transactionType: isDepositTicketPayment \? "deposit_ticket_refund" : "refund"[\s\S]*direction: isDepositTicketPayment \? "transfer" : "out"[\s\S]*SET status = 'issued'[\s\S]*paymentIds: refundedPaymentIds/s,
    "Refund should only reverse currently posted payment allocations either back to deposit transfer or cash out, then reopen the ticket."
  );
});

test("finance daily cash and reports separate real cash movement from deposit transfers", () => {
  assert.match(
    financeServiceSource,
    /export async function getFinanceDailyCash[\s\S]*const today = getTodayYmdInTashkent\(\);[\s\S]*"t\.direction IN \('in', 'out'\)"[\s\S]*SUM\(CASE WHEN t\.direction = 'in' THEN t\.amount_uzs ELSE 0 END\)[\s\S]*SUM\(CASE WHEN t\.direction = 'out' THEN t\.amount_uzs ELSE 0 END\)/s,
    "Daily cash should use the Tashkent business date, include only real cash in/out movement, and exclude transfer-only deposit ticket payments."
  );

  assert.match(
    financeServiceSource,
    /export async function openCashSession[\s\S]*getOpenCashSession\(db, \{ organizationId, cashierUserId: actorUserId, forUpdate: true \}\)[\s\S]*VALUES \(\$1, \$2, \$3, \$4, \$2\)[\s\S]*\[organizationId, actorUserId, 0, note \|\| null\]/s,
    "Opening a cash session should be per cashier and start the new session balance from zero."
  );

  assert.match(
    financeServiceSource,
    /export async function closeCashSession[\s\S]*const hasRequestedClosingBalance = requestedClosingBalance !== undefined;[\s\S]*parseIntegerAmount\(requestedClosingBalance, null\)[\s\S]*if \(hasRequestedClosingBalance && closingBalanceUzs === null\)[\s\S]*closingBalanceUzs === null \? expectedBalanceUzs : closingBalanceUzs/s,
    "Closing a cash session should accept signed submitted cash values while still rejecting invalid input."
  );

  assert.match(
    financeServiceSource,
    /async function getCashSessionExpectedBalance[\s\S]*AS expected_balance_uzs[\s\S]*return parseIntegerAmount\(result\.rows\[0\]\?\.expected_balance_uzs, 0\);/s,
    "Cash-session expected balance should preserve negative refund-heavy totals instead of clamping them to zero."
  );

  assert.match(
    financeSignedCashSessionBalancesMigrationSource,
    /FOREACH target_column IN ARRAY ARRAY\['closing_balance_uzs', 'expected_balance_uzs'\][\s\S]*finance_cash_sessions[\s\S]*pg_get_constraintdef\(c\.oid\) LIKE '%>= 0%'[\s\S]*DROP CONSTRAINT/s,
    "Cash-session closing and expected balances should drop non-negative DB checks so negative cash closures can be saved."
  );

  assert.match(
    financeServiceSource,
    /export async function getFinanceDailyCash[\s\S]*getOpenCashSession\(pool, \{ organizationId, cashierUserId: actorUserId \}\)[\s\S]*where\.push\(`t\.cash_session_id = \$\$\{params\.length\}`\)/s,
    "Daily cash current-session totals should be scoped to the active session of the current cashier."
  );

  assert.match(
    financeServiceSource,
    /const paymentSummaryParams = \[\.\.\.params\];[\s\S]*const paymentSummaryWhereSql = where\.join\(" AND "\);[\s\S]*if \(paymentMethodId\) \{[\s\S]*where\.push\(`t\.payment_method_id = \$\$\{params\.length\}`\);[\s\S]*const paymentSummaryResult = await pool\.query\([\s\S]*COALESCE\(fpm\.name, 'No payment method'\) AS payment_method_name[\s\S]*\$\{paymentSummaryFromSql\}[\s\S]*GROUP BY t\.payment_method_id, fpm\.name[\s\S]*paymentSummaryParams[\s\S]*paymentMethods: paymentSummaryResult\.rows\.map/s,
    "Daily cash should keep payment method indicator totals independent from the selected payment-method table filter."
  );

  assert.match(
    financeServiceSource,
    /export async function getFinanceReports[\s\S]*item_start_uzs[\s\S]*paid_before_uzs[\s\S]*WHEN t\.transaction_type IN \('ticket_payment', 'deposit_ticket_payment'\) THEN[\s\S]*LEAST\(\$\{itemEndAmountSql\}, \$\{ticketPaidBeforeTransactionSql\} \+ t\.amount_uzs\)[\s\S]*WHEN t\.transaction_type IN \('refund', 'deposit_ticket_refund'\) THEN[\s\S]*GREATEST\(\$\{itemStartAmountSql\}, \$\{ticketPaidBeforeTransactionSql\} - t\.amount_uzs\)[\s\S]*COUNT\(DISTINCT fti\.id\) AS item_count/s,
    "Finance reports should allocate ticket payments across services in FIFO order and avoid duplicate item counts."
  );

  assert.doesNotMatch(
    financeServiceSource,
    /LEFT JOIN users cu ON cu\.organization_id = s\.organization_id AND cu\.id = s\.cashier_user_id/,
    "Cashier joins should resolve platform-admin cash sessions by user id without requiring the cash-session organization."
  );
});

test("finance transaction list defaults and filters by transaction creation date", () => {
  assert.match(
    financeServiceSource,
    /export async function getFinanceTransactions[\s\S]*const today = getTodayYmdInTashkent\(\);[\s\S]*const dateFrom = normalizeDate\(filters\.dateFrom \?\? filters\.date_from\) \|\| today;[\s\S]*"t\.created_at::date >= \$2::date"[\s\S]*"t\.created_at::date <= \$3::date"[\s\S]*ORDER BY t\.created_at DESC, t\.id DESC/s,
    "Finance transactions page should show today's newly created transactions by default and filter by created_at."
  );

  assert.doesNotMatch(
    financeServiceSource,
    /export async function getFinanceTransactions[\s\S]*"t\.transaction_at::date >= \$2::date"[\s\S]*"t\.transaction_at::date <= \$3::date"/s,
    "Finance transactions page date filters should not use the business transaction_at date."
  );
});

test("finance report filters expose report-scoped client search and broad cashier references", () => {
  assert.match(
    financeServiceSource,
    /export async function searchCashierClients[\s\S]*regexp_replace\(COALESCE\(phone_number, ''\), '\[\^0-9\]', '', 'g'\) LIKE \$4/s,
    "Finance client search should match phone numbers by their digits even when stored with formatting."
  );

  assert.match(
    financeRoutesSource,
    /"\/reports\/clients"[\s\S]*requireReportsAccess\(request, reply, "read"\)[\s\S]*searchCashierClients/s,
    "Report client search should be available with the finance reports permission."
  );

  assert.match(
    financeServiceSource,
    /u\.is_platform_admin = TRUE[\s\S]*FROM finance_cash_sessions fcs[\s\S]*p\.code LIKE 'finance\.%'/s,
    "Finance report cashier references should include platform admins, historical cashiers and finance-permitted users."
  );

  assert.match(
    financeRouteSchemasSource,
    /appointmentDateFrom[\s\S]*appointmentDateTo[\s\S]*appointmentStatus[\s\S]*"pending", "confirmed", "cancelled", "no-show"/s,
    "Finance report query schema should accept appointment date and status filters."
  );

  assert.match(
    financeServiceSource,
    /const appointmentDateFrom = normalizeDate\(filters\.appointmentDateFrom \?\? filters\.appointment_date_from\);[\s\S]*const appointmentStatus = normalizeText\(filters\.appointmentStatus \?\? filters\.appointment_status, 32\)/s,
    "Finance reports should normalize appointment date and status filters."
  );

  assert.match(
    financeServiceSource,
    /const reportBaseSql = `[\s\S]*LEFT JOIN finance_tickets ft[\s\S]*LEFT JOIN appointment_schedules a ON a\.organization_id = ft\.organization_id AND a\.id = ft\.appointment_schedule_id[\s\S]*const itemBaseSql = `[\s\S]*LEFT JOIN appointment_schedules a ON a\.organization_id = ft\.organization_id AND a\.id = ft\.appointment_schedule_id[\s\S]*const detailBaseSql = `[\s\S]*LEFT JOIN appointment_schedules a ON a\.organization_id = ft\.organization_id AND a\.id = ft\.appointment_schedule_id/s,
    "Finance report summary, grouped item and detail queries should all join appointment schedules before using appointment filters."
  );

  assert.match(
    financeServiceSource,
    /commonWhere\.push\(`a\.appointment_date >= \$\$\{params\.length\}::date`\);[\s\S]*commonWhere\.push\(`a\.appointment_date <= \$\$\{params\.length\}::date`\);[\s\S]*commonWhere\.push\(`LOWER\(TRIM\(COALESCE\(a\.status, ''\)\)\) = \$\$\{params\.length\}`\);/s,
    "Finance report filters should apply appointment date and status to appointment-backed tickets."
  );

  assert.match(
    financeServiceSource,
    /let appointmentDetailsRows = \[\];[\s\S]*NOT EXISTS \([\s\S]*FROM finance_tickets aft[\s\S]*aft\.appointment_schedule_id = s\.id/s,
    "Finance reports should include unticketed appointment rows when appointment filters are active."
  );

  assert.match(
    financeServiceSource,
    /CASE[\s\S]*LOWER\(TRIM\(s\.status\)\) IN \('cancelled', 'no-show'\)[\s\S]*lost_amount_uzs[\s\S]*FROM appointment_schedules s[\s\S]*lostAmountUzs,[\s\S]*lostAppointmentCount/s,
    "Finance reports should expose lost amounts for cancelled and no-show appointment rows."
  );

  const financeOnlyFiltersBlock = financeServiceSource.match(
    /const hasFinanceOnlyFilters = Boolean\(([\s\S]*?)\n  \);/
  )?.[1] || "";
  assert.ok(financeOnlyFiltersBlock, "Finance reports should keep an explicit finance-only filter gate.");
  assert.doesNotMatch(
    financeOnlyFiltersBlock,
    /client|serviceRaw|serviceId|serviceAmount|specialist|position/,
    "Client, service, service amount, specialist and department filters should not suppress appointment-only report rows."
  );

  assert.match(
    financeServiceSource,
    /if \(clientId\) \{[\s\S]*appointmentWhere\.push\(`c\.id = \$\$\{appointmentParams\.length\}`\);[\s\S]*if \(serviceId\) \{[\s\S]*appointmentWhere\.push\(`s\.service_id = \$\$\{appointmentParams\.length\}`\);[\s\S]*if \(serviceAmountFrom !== null\) \{[\s\S]*appointmentWhere\.push\(`COALESCE\(s\.service_price_uzs, 0\) >= \$\$\{appointmentParams\.length\}`\);[\s\S]*if \(serviceAmountTo !== null\) \{[\s\S]*appointmentWhere\.push\(`COALESCE\(s\.service_price_uzs, 0\) <= \$\$\{appointmentParams\.length\}`\);/s,
    "Appointment-only report rows should support client, service name and service amount filters."
  );
});

test("finance client balance filters use the projected balance columns", () => {
  assert.match(
    financeServiceSource,
    /export async function getFinanceClientBalances[\s\S]*const clientIds = normalizeIdList[\s\S]*c\.id = ANY\(\$[\s\S]*::int\[\]\)[\s\S]*COALESCE\(debt_uzs, 0\) > 0[\s\S]*COALESCE\(deposit_uzs, 0\) > 0/s,
    "Client balance filters should work from the balances subquery projection and support explicit client id lookups."
  );

  assert.match(
    financeServiceSource,
    /const hasExplicitClientLookup = Boolean\(client\) \|\| clientIds\.length > 0;[\s\S]*type === "active" && !hasExplicitClientLookup[\s\S]*else if \(!hasExplicitClientLookup\)/s,
    "Client balance search should show matching clients even when they have no current debt or deposit."
  );

  assert.match(
    financeServiceSource,
    /export async function getFinanceClientTransactions[\s\S]*WHERE t\.organization_id = \$1[\s\S]*AND t\.client_id = \$2[\s\S]*mapClientLedgerTransaction\(row, runningDepositUzs\)/s,
    "Client balance rows should expose a full client transaction ledger with cash, deposit and debt summary fields."
  );

  assert.match(
    financeServiceSource,
    /export async function getFinanceClientTransactions[\s\S]*COALESCE\(NULLIF\(TRIM\(ticket_services\.service_names\), ''\), ft\.service_name\) AS service_name[\s\S]*STRING_AGG\(NULLIF\(TRIM\(fti\.service_name\), ''\), ', ' ORDER BY fti\.line_number, fti\.id\) AS service_names/s,
    "Client transaction ledger should show every service name from multi-service tickets."
  );

  assert.match(
    financeServiceSource,
    /export async function getFinanceClientTransactions[\s\S]*ticket_specialists\.specialist_names[\s\S]*AS specialist_name[\s\S]*COALESCE\(ticket_specialists\.specialist_id, ft\.specialist_id\) AS specialist_id[\s\S]*FROM finance_ticket_items fti[\s\S]*LEFT JOIN users iu[\s\S]*LEFT JOIN users tu/s,
    "Client transaction ledger should expose the ticket specialist after the ticket number."
  );

  assert.match(
    financeServiceSource,
    /summary: \{[\s\S]*cashInUzs:[\s\S]*cashOutUzs:[\s\S]*depositUsedUzs:[\s\S]*depositUzs:[\s\S]*debtUzs:/s,
    "Client transaction ledger should return cash, deposit and debt summary fields."
  );

  assert.match(
    financeRoutesSource,
    /"\/client-balances\/:id\/transactions"[\s\S]*requireBalancesAccess\(request, reply, "read"\)[\s\S]*getFinanceClientTransactions/s,
    "Client ledger should be available from balances read access without enabling balance mutation actions."
  );

  assert.doesNotMatch(
    financeServiceSource,
    /having\.push\("[^"]*COALESCE\((?:debt|deposit)\.(?:debt_uzs|deposit_uzs), 0\)/,
    "Client balance outer filters should not reference inner query aliases."
  );
});

test("appointments with non-voided finance tickets are locked against planner updates and deletes", () => {
  assert.match(
    appointmentSettingsServiceSource,
    /export async function getFinanceTicketLockedAppointmentIds[\s\S]*FROM finance_tickets[\s\S]*appointment_schedule_id = ANY\(\$2::bigint\[\]\)[\s\S]*AND status <> 'voided'/s,
    "Appointment lock lookup should only return schedules with non-voided finance tickets."
  );

  const lockGuards = [
    ...appointmentScheduleRoutesSource.matchAll(
      /const lockedAppointmentIds = await getFinanceTicketLockedAppointmentIds[\s\S]*?appointmentScheduleIds: target\.items\.map\(\(item\) => item\.id\)[\s\S]*?return reply\.status\(409\)\.send\(\{ message: buildFinanceTicketAppointmentLockMessage\(\) \}\);/g
    )
  ];
  assert.equal(
    lockGuards.length,
    2,
    "Schedule update and delete routes should both reject target appointments that have a finance ticket."
  );

  assert.match(
    appointmentSettingsServiceSource,
    /export async function cancelAppointmentSchedulesForSpecialistRange[\s\S]*NOT EXISTS \([\s\S]*FROM finance_tickets ft[\s\S]*ft\.appointment_schedule_id = s\.id[\s\S]*ft\.status <> 'voided'[\s\S]*status = 'cancelled'/s,
    "Planner range bulk cancellation should skip appointments that already have a non-voided finance ticket."
  );

  assert.match(
    appointmentSettingsServiceSource,
    /export async function getAppointmentSchedulesByRange[\s\S]*finance_ticket_payment_state[\s\S]*LEFT JOIN LATERAL \([\s\S]*ft_inner\.organization_id,[\s\S]*FROM finance_tickets ft_inner[\s\S]*ft_inner\.appointment_schedule_id = s\.id[\s\S]*ft_inner\.status <> 'voided'[\s\S]*FROM finance_transactions t[\s\S]*t\.organization_id = ft\.organization_id[\s\S]*ticket_payment[\s\S]*deposit_ticket_refund/s,
    "Planner schedules should expose non-voided ticket payment state so appointment slots can show payment markers."
  );
});
