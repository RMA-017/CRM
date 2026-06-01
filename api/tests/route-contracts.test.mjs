import assert from "node:assert/strict";
import test from "node:test";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";

const {
  default: appointmentSettingsRoutes,
  __appointmentRouteContracts
} = await import("../src/modules/appointments/appointment-settings.routes.js");
const { default: authRoutes } = await import("../src/modules/auth/auth.routes.js");
const { default: createUserRoutes } = await import("../src/modules/create-user/create-user.routes.js");
const { default: financeRoutes } = await import("../src/modules/finance/finance.routes.js");
const { default: metaRoutes } = await import("../src/modules/meta/meta.routes.js");
const { default: profileRoutes } = await import("../src/modules/profile/profile.routes.js");
const { usersRouteSchemas } = await import("../src/modules/users/users.route-schemas.js");
const {
  default: settingsRoutes,
  __settingsRouteContracts
} = await import("../src/modules/settings/settings.routes.js");
const { default: usersRoutes } = await import("../src/modules/users/users.routes.js");

function createRouteRecorder() {
  const routes = [];

  function record(method, path, optionsOrHandler, maybeHandler) {
    const hasOptions = typeof optionsOrHandler === "object" && optionsOrHandler !== null;
    const options = hasOptions ? optionsOrHandler : {};
    const handler = hasOptions ? maybeHandler : optionsOrHandler;
    routes.push({
      method,
      path,
      options,
      handler
    });
  }

  return {
    routes,
    fastify: {
      apiRateLimit: { max: 1, timeWindow: 1000 },
      get: (path, optionsOrHandler, maybeHandler) => record("GET", path, optionsOrHandler, maybeHandler),
      post: (path, optionsOrHandler, maybeHandler) => record("POST", path, optionsOrHandler, maybeHandler),
      put: (path, optionsOrHandler, maybeHandler) => record("PUT", path, optionsOrHandler, maybeHandler),
      patch: (path, optionsOrHandler, maybeHandler) => record("PATCH", path, optionsOrHandler, maybeHandler),
      delete: (path, optionsOrHandler, maybeHandler) => record("DELETE", path, optionsOrHandler, maybeHandler)
    }
  };
}

function toRouteSignatures(routes) {
  return routes
    .map((route) => `${route.method} ${route.path}`)
    .sort((left, right) => left.localeCompare(right));
}

function assertRateLimitConfigured(routes) {
  routes.forEach((route) => {
    assert.equal(typeof route.handler, "function");
    assert.equal(typeof route.options, "object");
    assert.equal(typeof route.options.config, "object");
    assert.ok("rateLimit" in route.options.config);
  });
}

function findRoute(routes, method, path) {
  return routes.find((route) => route.method === method && route.path === path);
}

test("appointments routes expose stable contract", async () => {
  const recorder = createRouteRecorder();
  await appointmentSettingsRoutes(recorder.fastify);

  assertRateLimitConfigured(recorder.routes);

  assert.deepEqual(toRouteSignatures(recorder.routes), [
    "DELETE /absences/:id",
    "DELETE /schedules/:id",
    "DELETE /work-schedule/:id",
    "GET /absences",
    "GET /breaks",
    "GET /client-no-show-summary",
    "GET /events",
    "GET /report",
    "GET /report/filters",
    "GET /schedules",
    "GET /settings",
    "GET /specialists",
    "GET /work-schedule",
    "PATCH /schedules/:id",
    "PATCH /settings",
    "PATCH /work-schedule/:id",
    "POST /absences",
    "POST /schedules",
    "POST /work-schedule",
    "PUT /breaks",
    "PUT /work-schedule/default-weekly"
  ]);

  const absencesGet = findRoute(recorder.routes, "GET", "/absences");
  assert.equal(typeof absencesGet?.options?.schema?.querystring, "object");

  const absencesPost = findRoute(recorder.routes, "POST", "/absences");
  assert.equal(typeof absencesPost?.options?.schema?.body, "object");

  const absencesDelete = findRoute(recorder.routes, "DELETE", "/absences/:id");
  assert.equal(typeof absencesDelete?.options?.schema?.params, "object");

  const schedulesGet = findRoute(recorder.routes, "GET", "/schedules");
  assert.equal(typeof schedulesGet?.options?.schema, "object");
  assert.equal(typeof schedulesGet?.options?.schema?.querystring, "object");

  const schedulesPost = findRoute(recorder.routes, "POST", "/schedules");
  assert.equal(typeof schedulesPost?.options?.schema?.body, "object");

  const schedulesPatch = findRoute(recorder.routes, "PATCH", "/schedules/:id");
  assert.equal(typeof schedulesPatch?.options?.schema?.params, "object");
  assert.equal(typeof schedulesPatch?.options?.schema?.querystring, "object");
  assert.equal(typeof schedulesPatch?.options?.schema?.body, "object");

  const breaksPut = findRoute(recorder.routes, "PUT", "/breaks");
  assert.equal(typeof breaksPut?.options?.schema?.body, "object");

  const settingsPatch = findRoute(recorder.routes, "PATCH", "/settings");
  assert.equal(typeof settingsPatch?.options?.schema?.body, "object");

  const workScheduleGet = findRoute(recorder.routes, "GET", "/work-schedule");
  assert.equal(typeof workScheduleGet?.options?.schema?.querystring, "object");

  const workScheduleDefaultWeeklyPut = findRoute(recorder.routes, "PUT", "/work-schedule/default-weekly");
  assert.equal(typeof workScheduleDefaultWeeklyPut?.options?.schema?.body, "object");

  const workSchedulePost = findRoute(recorder.routes, "POST", "/work-schedule");
  assert.equal(typeof workSchedulePost?.options?.schema?.body, "object");

  const workSchedulePatch = findRoute(recorder.routes, "PATCH", "/work-schedule/:id");
  assert.equal(typeof workSchedulePatch?.options?.schema?.params, "object");
  assert.equal(typeof workSchedulePatch?.options?.schema?.body, "object");

  const workScheduleDelete = findRoute(recorder.routes, "DELETE", "/work-schedule/:id");
  assert.equal(typeof workScheduleDelete?.options?.schema?.params, "object");
  assert.equal(typeof workScheduleDelete?.options?.schema?.querystring, "object");

  const reportGet = findRoute(recorder.routes, "GET", "/report");
  assert.equal(typeof reportGet?.handler, "function");

  const reportFiltersGet = findRoute(recorder.routes, "GET", "/report/filters");
  assert.equal(typeof reportFiltersGet?.handler, "function");
});

test("settings routes expose stable contract", async () => {
  const recorder = createRouteRecorder();
  await settingsRoutes(recorder.fastify);

  assertRateLimitConfigured(recorder.routes);

  assert.deepEqual(toRouteSignatures(recorder.routes), [
    "DELETE /finance/payment-methods/:id",
    "DELETE /organizations/:id",
    "DELETE /positions/:id",
    "DELETE /roles/:id",
    "DELETE /services/:id",
    "GET /admin-options",
    "GET /finance/payment-methods",
    "GET /organizations",
    "GET /positions",
    "GET /roles",
    "GET /services",
    "PATCH /admin-options",
    "PATCH /finance/payment-methods/:id",
    "PATCH /organizations/:id",
    "PATCH /positions/:id",
    "PATCH /roles/:id",
    "PATCH /services/:id",
    "POST /finance/payment-methods",
    "POST /organizations",
    "POST /positions",
    "POST /roles",
    "POST /services"
  ]);

  const organizationsPost = findRoute(recorder.routes, "POST", "/organizations");
  assert.equal(typeof organizationsPost?.options?.schema?.body, "object");

  const organizationsPatch = findRoute(recorder.routes, "PATCH", "/organizations/:id");
  assert.equal(typeof organizationsPatch?.options?.schema?.params, "object");
  assert.equal(typeof organizationsPatch?.options?.schema?.body, "object");

  const adminOptionsGet = findRoute(recorder.routes, "GET", "/admin-options");
  assert.equal(typeof adminOptionsGet?.options?.schema?.querystring, "object");

  const financePaymentMethodsGet = findRoute(recorder.routes, "GET", "/finance/payment-methods");
  assert.equal(typeof financePaymentMethodsGet?.options?.schema?.querystring, "object");

  const financePaymentMethodsPatch = findRoute(recorder.routes, "PATCH", "/finance/payment-methods/:id");
  assert.equal(typeof financePaymentMethodsPatch?.options?.schema?.params, "object");
  assert.equal(typeof financePaymentMethodsPatch?.options?.schema?.body, "object");

  const rolesPatch = findRoute(recorder.routes, "PATCH", "/roles/:id");
  assert.equal(typeof rolesPatch?.options?.schema?.params, "object");
  assert.equal(typeof rolesPatch?.options?.schema?.body, "object");

  const positionsPatch = findRoute(recorder.routes, "PATCH", "/positions/:id");
  assert.equal(typeof positionsPatch?.options?.schema?.params, "object");
  assert.equal(typeof positionsPatch?.options?.schema?.body, "object");

  const servicesGet = findRoute(recorder.routes, "GET", "/services");
  assert.equal(typeof servicesGet?.options?.schema?.querystring, "object");

  const servicesPatch = findRoute(recorder.routes, "PATCH", "/services/:id");
  assert.equal(typeof servicesPatch?.options?.schema?.params, "object");
  assert.equal(typeof servicesPatch?.options?.schema?.body, "object");

});

test("finance routes expose stable contract", async () => {
  const recorder = createRouteRecorder();
  await financeRoutes(recorder.fastify);

  assertRateLimitConfigured(recorder.routes);

  assert.deepEqual(toRouteSignatures(recorder.routes), [
    "GET /cashier/board",
    "GET /cashier/clients",
    "GET /cashier/session/current",
    "GET /client-balances",
    "GET /client-balances/:id/debt-tickets",
    "GET /client-balances/:id/transactions",
    "GET /daily-cash",
    "GET /payment-methods",
    "GET /reports",
    "GET /reports/clients",
    "GET /tickets",
    "GET /tickets/:id/history",
    "GET /tickets/clients",
    "GET /tickets/references",
    "GET /transactions",
    "GET /transactions/clients",
    "PATCH /cashier/tickets/:id",
    "POST /cashier/appointments/:id/confirm",
    "POST /cashier/appointments/:id/status",
    "POST /cashier/session/close",
    "POST /cashier/session/open",
    "POST /cashier/tickets",
    "POST /cashier/tickets/:id/pay",
    "POST /cashier/tickets/:id/refund",
    "POST /cashier/tickets/:id/unpaid",
    "POST /cashier/tickets/:id/void",
    "POST /cashier/tickets/pay-batch",
    "POST /client-balances/deposit",
    "POST /client-balances/pay-from-deposit",
    "POST /transactions/:id/void"
  ]);

  const boardGet = findRoute(recorder.routes, "GET", "/cashier/board");
  assert.equal(typeof boardGet?.options?.schema?.querystring, "object");

  const clientsGet = findRoute(recorder.routes, "GET", "/cashier/clients");
  assert.equal(typeof clientsGet?.options?.schema?.querystring, "object");

  const sessionCurrentGet = findRoute(recorder.routes, "GET", "/cashier/session/current");
  assert.equal(sessionCurrentGet?.method, "GET");

  const paymentMethodsGet = findRoute(recorder.routes, "GET", "/payment-methods");
  assert.equal(paymentMethodsGet?.method, "GET");

  const dailyCashGet = findRoute(recorder.routes, "GET", "/daily-cash");
  assert.equal(typeof dailyCashGet?.options?.schema?.querystring, "object");

  const reportsGet = findRoute(recorder.routes, "GET", "/reports");
  assert.equal(typeof reportsGet?.options?.schema?.querystring, "object");

  const reportClientsGet = findRoute(recorder.routes, "GET", "/reports/clients");
  assert.equal(typeof reportClientsGet?.options?.schema?.querystring, "object");

  const clientBalancesGet = findRoute(recorder.routes, "GET", "/client-balances");
  assert.equal(typeof clientBalancesGet?.options?.schema?.querystring, "object");

  const clientBalanceDepositPost = findRoute(recorder.routes, "POST", "/client-balances/deposit");
  assert.equal(typeof clientBalanceDepositPost?.options?.schema?.body, "object");

  const clientDebtTicketsGet = findRoute(recorder.routes, "GET", "/client-balances/:id/debt-tickets");
  assert.equal(typeof clientDebtTicketsGet?.options?.schema?.params, "object");

  const clientTransactionsGet = findRoute(recorder.routes, "GET", "/client-balances/:id/transactions");
  assert.equal(typeof clientTransactionsGet?.options?.schema?.params, "object");

  const clientPayFromDepositPost = findRoute(recorder.routes, "POST", "/client-balances/pay-from-deposit");
  assert.equal(typeof clientPayFromDepositPost?.options?.schema?.body, "object");

  const ticketsGet = findRoute(recorder.routes, "GET", "/tickets");
  assert.equal(typeof ticketsGet?.options?.schema?.querystring, "object");

  const ticketReferencesGet = findRoute(recorder.routes, "GET", "/tickets/references");
  assert.equal(ticketReferencesGet?.method, "GET");

  const ticketClientsGet = findRoute(recorder.routes, "GET", "/tickets/clients");
  assert.equal(typeof ticketClientsGet?.options?.schema?.querystring, "object");

  const ticketHistoryGet = findRoute(recorder.routes, "GET", "/tickets/:id/history");
  assert.equal(typeof ticketHistoryGet?.options?.schema?.params, "object");

  const transactionsGet = findRoute(recorder.routes, "GET", "/transactions");
  assert.equal(typeof transactionsGet?.options?.schema?.querystring, "object");

  const transactionClientsGet = findRoute(recorder.routes, "GET", "/transactions/clients");
  assert.equal(typeof transactionClientsGet?.options?.schema?.querystring, "object");

  const transactionVoidPost = findRoute(recorder.routes, "POST", "/transactions/:id/void");
  assert.equal(typeof transactionVoidPost?.options?.schema?.params, "object");
  assert.equal(typeof transactionVoidPost?.options?.schema?.body, "object");

  const sessionOpenPost = findRoute(recorder.routes, "POST", "/cashier/session/open");
  assert.equal(typeof sessionOpenPost?.options?.schema?.body, "object");

  const sessionClosePost = findRoute(recorder.routes, "POST", "/cashier/session/close");
  assert.equal(typeof sessionClosePost?.options?.schema?.body, "object");

  const ticketsPost = findRoute(recorder.routes, "POST", "/cashier/tickets");
  assert.equal(typeof ticketsPost?.options?.schema?.body, "object");

  const appointmentConfirmPost = findRoute(recorder.routes, "POST", "/cashier/appointments/:id/confirm");
  assert.equal(typeof appointmentConfirmPost?.options?.schema?.params, "object");

  const appointmentStatusPost = findRoute(recorder.routes, "POST", "/cashier/appointments/:id/status");
  assert.equal(typeof appointmentStatusPost?.options?.schema?.params, "object");
  assert.equal(typeof appointmentStatusPost?.options?.schema?.body, "object");

  const ticketsPatch = findRoute(recorder.routes, "PATCH", "/cashier/tickets/:id");
  assert.equal(typeof ticketsPatch?.options?.schema?.params, "object");
  assert.equal(typeof ticketsPatch?.options?.schema?.body, "object");

  const ticketsPay = findRoute(recorder.routes, "POST", "/cashier/tickets/:id/pay");
  assert.equal(typeof ticketsPay?.options?.schema?.params, "object");
  assert.equal(typeof ticketsPay?.options?.schema?.body, "object");

  const ticketsPayBatch = findRoute(recorder.routes, "POST", "/cashier/tickets/pay-batch");
  assert.equal(typeof ticketsPayBatch?.options?.schema?.body, "object");

  const ticketsRefund = findRoute(recorder.routes, "POST", "/cashier/tickets/:id/refund");
  assert.equal(typeof ticketsRefund?.options?.schema?.params, "object");
  assert.equal(typeof ticketsRefund?.options?.schema?.body, "object");
});

test("auth routes expose stable contract", async () => {
  const recorder = createRouteRecorder();
  await authRoutes(recorder.fastify);

  assertRateLimitConfigured(recorder.routes);

  assert.deepEqual(toRouteSignatures(recorder.routes), [
    "POST /",
    "POST /logout"
  ]);

  const loginPost = findRoute(recorder.routes, "POST", "/");
  assert.equal(typeof loginPost?.options?.schema?.body, "object");

  const logoutPost = findRoute(recorder.routes, "POST", "/logout");
  assert.equal(typeof logoutPost?.handler, "function");
});

test("profile routes expose stable contract", async () => {
  const recorder = createRouteRecorder();
  await profileRoutes(recorder.fastify);

  assertRateLimitConfigured(recorder.routes);

  assert.deepEqual(toRouteSignatures(recorder.routes), [
    "GET /",
    "PATCH /",
    "POST /organization-context"
  ]);

  const profilePatch = findRoute(recorder.routes, "PATCH", "/");
  assert.equal(typeof profilePatch?.options?.schema?.body, "object");

  const organizationContextPost = findRoute(recorder.routes, "POST", "/organization-context");
  assert.equal(typeof organizationContextPost?.options?.schema?.body, "object");
});

test("meta routes expose stable contract", async () => {
  const recorder = createRouteRecorder();
  await metaRoutes(recorder.fastify);

  assertRateLimitConfigured(recorder.routes);

  assert.deepEqual(toRouteSignatures(recorder.routes), [
    "GET /user-options"
  ]);

  const userOptionsGet = findRoute(recorder.routes, "GET", "/user-options");
  assert.equal(typeof userOptionsGet?.options?.schema?.querystring, "object");
});

test("create-user routes expose stable contract", async () => {
  const recorder = createRouteRecorder();
  await createUserRoutes(recorder.fastify);

  assertRateLimitConfigured(recorder.routes);

  assert.deepEqual(toRouteSignatures(recorder.routes), [
    "POST /"
  ]);

  const createUserPost = findRoute(recorder.routes, "POST", "/");
  assert.equal(typeof createUserPost?.options?.schema?.body, "object");
});

test("users routes expose stable contract", async () => {
  const recorder = createRouteRecorder();
  await usersRoutes(recorder.fastify);

  assertRateLimitConfigured(recorder.routes);

  assert.deepEqual(toRouteSignatures(recorder.routes), [
    "DELETE /:id",
    "GET /",
    "PATCH /:id"
  ]);

  const usersGet = findRoute(recorder.routes, "GET", "/");
  assert.equal(typeof usersGet?.options?.schema?.querystring, "object");

  const usersPatch = findRoute(recorder.routes, "PATCH", "/:id");
  assert.equal(typeof usersPatch?.options?.schema?.params, "object");
  assert.equal(typeof usersPatch?.options?.schema?.body, "object");

  const usersDelete = findRoute(recorder.routes, "DELETE", "/:id");
  assert.equal(typeof usersDelete?.options?.schema?.params, "object");
});

test("users update schema accepts blank optional edit fields", () => {
  const updateBody = usersRouteSchemas.updateBody;

  assert.equal(updateBody.properties.email.anyOf[1].maxLength, 0);
  assert.equal(updateBody.properties.birthday.anyOf[1].maxLength, 0);
  assert.equal(updateBody.properties.phone.anyOf[1].maxLength, 0);
  assert.equal(updateBody.properties.position.anyOf[1].maxLength, 0);
  assert.equal(updateBody.properties.organizationCode.anyOf[1].maxLength, 0);
});

test("settings contract helpers validate admin-option payload fragments", () => {
  const c = __settingsRouteContracts;

  assert.equal(c.parseSortOrder("7"), 7);
  assert.equal(c.parseSortOrder("bad"), 0);
  assert.equal(c.parseIsActive("off", true), false);
  assert.equal(c.parseIsActive(undefined, true), true);

  assert.deepEqual(c.parseHistoryLockDays("10"), { value: 10 });
  assert.equal(c.parseHistoryLockDays("-1").error?.field, "appointmentHistoryLockDays");

  assert.deepEqual(c.parseOptionalOrganizationId(""), { value: null });
  assert.deepEqual(c.parseOptionalOrganizationId("3"), { value: 3 });
  assert.equal(c.parseOptionalOrganizationId("x").error?.field, "organizationId");

  assert.equal(c.parsePermissionCodes("bad").error?.field, "permissionCodes");
  assert.deepEqual(c.parsePermissionCodes(["appointments.planner.read", "appointments.planner.read"]), {
    codes: ["appointments.planner.read"]
  });
  assert.equal(c.parsePermissionCodes(["bad code"]).error?.field, "permissionCodes");
});

test("appointments contract helpers normalize core schedule inputs", () => {
  const c = __appointmentRouteContracts;

  assert.equal(c.parsePositiveIntegerOr("12", 1), 12);
  assert.equal(c.parsePositiveIntegerOr("x", 5), 5);

  assert.equal(c.parseNullableBoolean("yes"), true);
  assert.equal(c.parseNullableBoolean("0"), false);
  assert.equal(c.parseNullableBoolean("other"), null);

  assert.deepEqual(c.parseOptionalOrganizationId(""), { value: null });
  assert.deepEqual(c.parseOptionalOrganizationId("2"), { value: 2 });
  assert.equal(c.parseOptionalOrganizationId("no").error?.field, "organizationId");

  assert.deepEqual(c.normalizeDurationOptions("30,30,60,0,2000"), [30, 60]);
  assert.deepEqual(c.normalizeReminderChannels(["sms", "email", "bad"]), ["sms", "email"]);
  assert.equal(c.normalizeScheduleScope("future"), "future");
  assert.equal(c.normalizeScheduleScope("bad"), "");
});
