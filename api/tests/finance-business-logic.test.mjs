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
    /const summaryResult = await pool\.query\([\s\S]*SUM\(COALESCE\(ft\.total_uzs, ft\.amount_uzs, 0\)\)[\s\S]*SUM\(COALESCE\(fpaid\.paid_amount_uzs, 0\)\)[\s\S]*SUM\(GREATEST\([\s\S]*COALESCE\(ft\.total_uzs, ft\.amount_uzs, 0\) - COALESCE\(fpaid\.paid_amount_uzs, 0\)[\s\S]*summary: \{[\s\S]*totalAmountUzs:[\s\S]*paidAmountUzs:[\s\S]*remainingAmountUzs:/s,
    "Finance ticket list should return summary totals for the full current filter, not only the visible page."
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
    /export async function getCashierBoard\(\{ organizationId, dateFrom, dateTo, query \}\)[\s\S]*normalizeText\(query, 96\)[\s\S]*appointmentFilters\.push\(`\([\s\S]*a\.client_id::text = \$\$\{exactParam\}[\s\S]*ticketFilters\.push\(`\([\s\S]*ft\.ticket_number::text = \$\$\{exactParam\}/s,
    "Cashier board search should be applied server-side for appointments and tickets before the board limit."
  );

  assert.match(
    financeServiceSource,
    /const todayYmd = getTodayYmdInTashkent\(\);[\s\S]*const boardDateFrom = dates\.from \|\| dates\.to \|\| todayYmd;[\s\S]*const boardDateTo = dates\.to \|\| boardDateFrom;[\s\S]*"a\.appointment_date >= \$2::date"[\s\S]*"a\.appointment_date <= \$3::date"[\s\S]*const ticketParams = \[organizationId\];[\s\S]*"ft\.status IN \('issued', 'unpaid'\)"/s,
    "Cashier board appointment columns should stay date-scoped while open tickets remain visible until paid."
  );

  assert.match(
    financeServiceSource,
    /getAppointmentHistoryLockDaysByOrganization\(organizationId\)[\s\S]*historyLockCutoffDate[\s\S]*overdueAppointmentFilters[\s\S]*"a\.status = 'confirmed'"[\s\S]*"ft\.id IS NULL"[\s\S]*"a\.appointment_date >= \$2::date"[\s\S]*"a\.appointment_date < \$3::date"[\s\S]*overdueConfirmedAppointments: overdueAppointments/s,
    "Cashier board should expose past confirmed appointment cards without tickets only inside the history-lock window."
  );
});

test("finance ticket creation only accepts confirmed appointments and snapshots ticket item totals", () => {
  assert.match(
    financeServiceSource,
    /appointment = await getAppointmentForTicket[\s\S]*if \(appointment\.status !== "confirmed"\)[\s\S]*Only confirmed appointments can become tickets/s,
    "Appointment-backed tickets must only be created from confirmed planner lessons."
  );

  assert.match(
    financeServiceSource,
    /ticketClientId = appointment\.client_id[\s\S]*ticketSpecialistId = appointment\.specialist_id[\s\S]*amountUzs = requestedAmount > 0 \? requestedAmount : normalizeAmount\(appointment\.service_price_uzs, 0\)[\s\S]*ticketDate = normalizeDate\(appointment\.appointment_date\) \|\| ticketDate/s,
    "Appointment-backed tickets should snapshot client, specialist, service price and appointment date."
  );

  assert.match(
    financeServiceSource,
    /const items = await buildTicketItems[\s\S]*const totals = getTicketTotals\(items\)[\s\S]*INSERT INTO finance_tickets[\s\S]*subtotal_uzs, discount_uzs, total_uzs, status[\s\S]*'issued'[\s\S]*await insertTicketItems/s,
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
    /const requestedPriceUzs = normalizeAmount\(rawItem\?\.priceUzs[\s\S]*const priceUzs = requestedPriceUzs > 0 \? requestedPriceUzs : normalizeAmount\(service\.price_uzs, 0\)/s,
    "Ticket line items should allow appointment ticket price overrides while falling back to the service catalog price."
  );
  assert.match(
    financeServiceSource,
    /const requestedDiscountUzs = normalizeAmount\(rawItem\?\.discountUzs \?\? rawItem\?\.discount_uzs, -1\);[\s\S]*const discountUzs = requestedDiscountUzs >= 0[\s\S]*Math\.min\(priceUzs, requestedDiscountUzs\)[\s\S]*calculateDiscountUzs\(\{ priceUzs, discountType, discountValue \}\)/s,
    "Ticket line items should accept exact distributed UZS discounts while preserving the submitted discount metadata."
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
    /if \(nextItems\) \{[\s\S]*await insertTicketItems\(db, \{ organizationId, ticketId, items: nextItems \}\);[\s\S]*if \(isAppointmentTicket\) \{[\s\S]*await syncAppointmentTicketService\(db, \{[\s\S]*appointmentScheduleId,[\s\S]*item: nextItems\[0\]/s,
    "Ticket update flow should apply the appointment service sync in the same transaction as the ticket item update."
  );
  assert.match(
    appointmentSettingsServiceSource,
    /export async function updateAppointmentSchedulesByIds\(\{[\s\S]*activateClient = true,[\s\S]*AND \$17::boolean[\s\S]*Boolean\(activateClient\)/s,
    "Appointment schedule updates should allow finance service sync to avoid unintended client reactivation."
  );

  assert.match(
    financeServiceSource,
    /async function updateTicketStatus[\s\S]*if \(action === "voided"\) \{[\s\S]*const paymentActivityCount = await getTicketPaymentActivityCount\(db, \{ organizationId, ticketId \}\);[\s\S]*if \(paymentActivityCount > 0\) \{[\s\S]*Tickets with payments cannot be deleted\./s,
    "Ticket delete/void should be blocked once the ticket has any payment or refund history."
  );

  assert.doesNotMatch(
    financeRoutesSource,
    /"\/client-balances\/deposit"/,
    "Direct client balance deposit mutations should not be exposed; finance operations must go through tickets."
  );

  assert.doesNotMatch(
    financeServiceSource,
    /export async function createFinanceDepositTransaction/,
    "Direct deposit in/out creation should not remain as a finance service entry point."
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
    /async function lockClientFinanceBalance[\s\S]*pg_advisory_xact_lock[\s\S]*export async function voidFinanceTransaction[\s\S]*transaction_type IN \('refund', 'deposit_ticket_refund'\)[\s\S]*Cancel the refund before cancelling the original payment\.[\s\S]*const depositBalanceImpact = getLedgerDepositChange\(current\);[\s\S]*currentDeposit - depositBalanceImpact < 0[\s\S]*Transaction cancellation would make client deposit negative\./s,
    "Transaction voids should respect refund dependencies, serialize deposit-affecting changes and block negative deposits."
  );

  assert.match(
    financeServiceSource,
    /export async function payFinanceTicketsFromDeposit[\s\S]*AND ft\.status IN \('issued', 'unpaid'\)[\s\S]*payableAmountUzs[\s\S]*const currentDeposit = await getClientDepositBalance[\s\S]*if \(totalAmountUzs > currentDeposit\)[\s\S]*VALUES \(\$1, \$2, NULL, \$3, \$4, \$5\)[\s\S]*transactionType: "deposit_ticket_payment"[\s\S]*direction: "transfer"[\s\S]*paymentMethodId: null[\s\S]*SET status = 'paid'/s,
    "Deposit ticket payments should close remaining payable debt tickets and use transfer transactions without cash payment methods."
  );

  assert.match(
    financeServiceSource,
    /export async function payFinanceTicketsBatch[\s\S]*paid_amount_uzs[\s\S]*payableAmountUzs[\s\S]*if \(paidAmountUzs > totalAmountUzs\)[\s\S]*Payment amount exceeds selected tickets total\.[\s\S]*break;[\s\S]*const nextStatus = nextPaidAmountUzs >= ticket\.totalAmountUzs \? "paid" : "unpaid"[\s\S]*SET status = \$3/s,
    "Batch ticket payments should accept partial allocations and leave partially paid tickets in unpaid status."
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
    /export async function getFinanceDailyCash[\s\S]*getOpenCashSession\(pool, \{ organizationId, cashierUserId: actorUserId \}\)[\s\S]*where\.push\(`t\.cash_session_id = \$\$\{params\.length\}`\)/s,
    "Daily cash current-session totals should be scoped to the active session of the current cashier."
  );

  assert.match(
    financeServiceSource,
    /const paymentSummaryResult = await pool\.query\([\s\S]*COALESCE\(fpm\.name, 'No payment method'\) AS payment_method_name[\s\S]*GROUP BY t\.payment_method_id, fpm\.name[\s\S]*paymentMethods: paymentSummaryResult\.rows\.map/s,
    "Daily cash should return totals grouped by payment method for the payment-method indicator block."
  );

  assert.match(
    financeServiceSource,
    /export async function getFinanceReports[\s\S]*t\.transaction_type IN \('ticket_payment', 'deposit_ticket_payment', 'refund', 'deposit_ticket_refund'\)[\s\S]*t\.amount_uzs::numeric \* fti\.final_amount_uzs::numeric[\s\S]*NULLIF\(ft\.total_uzs::numeric, 0\)[\s\S]*COUNT\(DISTINCT fti\.id\) AS item_count/s,
    "Finance reports should allocate split payment transaction amounts across ticket items and avoid duplicate item counts."
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
});
