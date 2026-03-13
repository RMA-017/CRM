import assert from "node:assert/strict";
import test from "node:test";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";

const {
  default: appointmentSettingsRoutes,
  __appointmentRouteContracts
} = await import("../src/modules/appointments/appointment-settings.routes.js");
const { default: authRoutes } = await import("../src/modules/auth/auth.routes.js");
const { default: createUserRoutes } = await import("../src/modules/create-user/create-user.routes.js");
const { default: metaRoutes } = await import("../src/modules/meta/meta.routes.js");
const {
  default: notificationsRoutes,
  __notificationsRouteContracts
} = await import("../src/modules/notifications/notifications.routes.js");
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
    "DELETE /schedules/:id",
    "DELETE /work-schedule/:id",
    "GET /breaks",
    "GET /client-no-show-summary",
    "GET /events",
    "GET /report",
    "GET /report/filters",
    "GET /schedules",
    "GET /schedules/norm-check",
    "GET /settings",
    "GET /specialists",
    "GET /work-schedule",
    "PATCH /schedules/:id",
    "PATCH /settings",
    "PATCH /work-schedule/:id",
    "POST /schedules",
    "POST /work-schedule",
    "PUT /breaks",
    "PUT /work-schedule/default-weekly"
  ]);

  const schedulesGet = findRoute(recorder.routes, "GET", "/schedules");
  assert.equal(typeof schedulesGet?.options?.schema, "object");
  assert.equal(typeof schedulesGet?.options?.schema?.querystring, "object");

  const schedulesPost = findRoute(recorder.routes, "POST", "/schedules");
  assert.equal(typeof schedulesPost?.options?.schema?.body, "object");

  const schedulesNormCheckGet = findRoute(recorder.routes, "GET", "/schedules/norm-check");
  assert.equal(typeof schedulesNormCheckGet?.handler, "function");

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
    "DELETE /appointment-norms/:id",
    "DELETE /organizations/:id",
    "DELETE /positions/:id",
    "DELETE /roles/:id",
    "GET /admin-options",
    "GET /appointment-norms",
    "GET /organizations",
    "GET /positions",
    "GET /roles",
    "PATCH /admin-options",
    "PATCH /appointment-norms/:id",
    "PATCH /organizations/:id",
    "PATCH /positions/:id",
    "PATCH /roles/:id",
    "POST /appointment-norms",
    "POST /organizations",
    "POST /positions",
    "POST /roles"
  ]);

  const organizationsPost = findRoute(recorder.routes, "POST", "/organizations");
  assert.equal(typeof organizationsPost?.options?.schema?.body, "object");

  const organizationsPatch = findRoute(recorder.routes, "PATCH", "/organizations/:id");
  assert.equal(typeof organizationsPatch?.options?.schema?.params, "object");
  assert.equal(typeof organizationsPatch?.options?.schema?.body, "object");

  const adminOptionsGet = findRoute(recorder.routes, "GET", "/admin-options");
  assert.equal(typeof adminOptionsGet?.options?.schema?.querystring, "object");

  const rolesPatch = findRoute(recorder.routes, "PATCH", "/roles/:id");
  assert.equal(typeof rolesPatch?.options?.schema?.params, "object");
  assert.equal(typeof rolesPatch?.options?.schema?.body, "object");

  const positionsPatch = findRoute(recorder.routes, "PATCH", "/positions/:id");
  assert.equal(typeof positionsPatch?.options?.schema?.params, "object");
  assert.equal(typeof positionsPatch?.options?.schema?.body, "object");

  const appointmentNormsPost = findRoute(recorder.routes, "POST", "/appointment-norms");
  assert.equal(typeof appointmentNormsPost?.options?.schema?.body, "object");

  const appointmentNormsPatch = findRoute(recorder.routes, "PATCH", "/appointment-norms/:id");
  assert.equal(typeof appointmentNormsPatch?.options?.schema?.params, "object");
  assert.equal(typeof appointmentNormsPatch?.options?.schema?.body, "object");

  const appointmentNormsDelete = findRoute(recorder.routes, "DELETE", "/appointment-norms/:id");
  assert.equal(typeof appointmentNormsDelete?.options?.schema?.params, "object");
});

test("notifications routes expose stable contract", async () => {
  const recorder = createRouteRecorder();
  await notificationsRoutes(recorder.fastify);

  assertRateLimitConfigured(recorder.routes);

  assert.deepEqual(toRouteSignatures(recorder.routes), [
    "DELETE /",
    "GET /",
    "PATCH /read-all",
    "POST /send"
  ]);

  const notificationsGet = findRoute(recorder.routes, "GET", "/");
  assert.equal(typeof notificationsGet?.options?.schema?.querystring, "object");

  const notificationsSendPost = findRoute(recorder.routes, "POST", "/send");
  assert.equal(typeof notificationsSendPost?.options?.schema?.body, "object");
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

test("notifications contract helpers normalize paging and targets", () => {
  const c = __notificationsRouteContracts;

  assert.equal(c.parseUnreadOnly(true), true);
  assert.equal(c.parseUnreadOnly("yes"), true);
  assert.equal(c.parseUnreadOnly("0"), false);

  assert.equal(c.parseLimit(undefined), 50);
  assert.equal(c.parseLimit("10"), 10);
  assert.equal(c.parseLimit("1000"), 200);

  assert.deepEqual(c.normalizeTargetUserIds([1, "2", "2", 0, "x"]), [1, 2]);
  assert.deepEqual(c.normalizeTargetRoles([" Manager ", "manager", "", "Specialist"]), [
    "manager",
    "specialist"
  ]);
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
