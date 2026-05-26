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
    /function buildTicketsListWhere[\s\S]*const statuses = Array\.from\(new Set\([\s\S]*"issued", "paid", "unpaid", "voided"[\s\S]*if \(statuses\.length > 0\)[\s\S]*where\.push\(`ft\.status = ANY\(\$\$\{params\.length\}::text\[\]\)`\)[\s\S]*else \{[\s\S]*where\.push\("ft\.status <> 'voided'"\)/s,
    "Finance ticket list filters should support multiple statuses and hide deleted/voided tickets unless explicitly requested."
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
    /const todayYmd = getTodayYmdInTashkent\(\);[\s\S]*const boardDateFrom = dates\.from \|\| dates\.to \|\| todayYmd;[\s\S]*const boardDateTo = dates\.to \|\| boardDateFrom;[\s\S]*"a\.appointment_date >= \$2::date"[\s\S]*"a\.appointment_date <= \$3::date"[\s\S]*"COALESCE\(a\.appointment_date, ft\.ticket_date\) >= \$2::date"[\s\S]*"COALESCE\(a\.appointment_date, ft\.ticket_date\) <= \$3::date"/s,
    "Cashier board columns should default to today's appointment/ticket date before the board limit is applied."
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
    /export async function payFinanceTicket[\s\S]*paymentMethodId[\s\S]*AND is_active = TRUE[\s\S]*paid_amount_uzs[\s\S]*payableAmountUzs[\s\S]*if \(amountUzs > payableAmountUzs\)[\s\S]*Payment amount exceeds selected tickets total\.[\s\S]*const nextStatus = nextPaidAmountUzs >= totalAmountUzs \? "paid" : "unpaid"[\s\S]*transactionType: "ticket_payment"[\s\S]*direction: "in"[\s\S]*SET status = \$3/s,
    "Ticket payment should require an active method, allow partial payment up to the remaining amount, and only mark tickets paid when fully covered."
  );

  assert.match(
    financeServiceSource,
    /export async function createFinanceDepositTransaction[\s\S]*if \(operation === "out"\)[\s\S]*const currentDeposit = await getClientDepositBalance[\s\S]*if \(amountUzs > currentDeposit\)[\s\S]*Deposit balance is not enough\.[\s\S]*transactionType: operation === "in" \? "deposit_in" : "deposit_out"/s,
    "Deposit withdrawal should be blocked when it would make the client deposit negative."
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
    /export async function refundFinanceTicket[\s\S]*if \(current\.status !== "paid"\)[\s\S]*Only paid tickets can be refunded\.[\s\S]*NOT EXISTS \([\s\S]*refunded\.transaction_type IN \('refund', 'deposit_ticket_refund'\)[\s\S]*for \(const payment of payments\)[\s\S]*paymentGroupId: payment\.payment_group_id \|\| null[\s\S]*transactionType: isDepositTicketPayment \? "deposit_ticket_refund" : "refund"[\s\S]*direction: isDepositTicketPayment \? "transfer" : "out"[\s\S]*SET status = 'issued'[\s\S]*paymentIds: refundedPaymentIds/s,
    "Refund should reverse every active payment allocation either back to deposit transfer or cash out, then reopen the ticket."
  );
});

test("finance daily cash and reports separate real cash movement from deposit transfers", () => {
  assert.match(
    financeServiceSource,
    /export async function getFinanceDailyCash[\s\S]*"t\.direction IN \('in', 'out'\)"[\s\S]*SUM\(CASE WHEN t\.direction = 'in' THEN t\.amount_uzs ELSE 0 END\)[\s\S]*SUM\(CASE WHEN t\.direction = 'out' THEN t\.amount_uzs ELSE 0 END\)/s,
    "Daily cash should include only real cash in/out movement and exclude transfer-only deposit ticket payments."
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

test("finance client balance filters use the projected balance columns", () => {
  assert.match(
    financeServiceSource,
    /export async function getFinanceClientBalances[\s\S]*const clientIds = normalizeIdList[\s\S]*c\.id = ANY\(\$[\s\S]*::int\[\]\)[\s\S]*COALESCE\(debt_uzs, 0\) > 0[\s\S]*COALESCE\(deposit_uzs, 0\) > 0/s,
    "Client balance filters should work from the balances subquery projection and support explicit client id lookups."
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
