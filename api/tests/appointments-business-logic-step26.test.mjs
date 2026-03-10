import assert from "node:assert/strict";
import test from "node:test";

const referenceRoutesModule = await import("../src/modules/appointments/routes/reference.routes.js");
const breaksRoutesModule = await import("../src/modules/appointments/routes/breaks.routes.js");
const schedulesRoutesModule = await import("../src/modules/appointments/routes/schedules.routes.js");

const { registerAppointmentReferenceRoutes } = referenceRoutesModule;
const { registerAppointmentBreakRoutes } = breaksRoutesModule;
const { registerAppointmentScheduleRoutes } = schedulesRoutesModule;

function createReplyRecorder() {
  const state = {
    statusCode: 200,
    payload: undefined
  };

  return {
    state,
    status(code) {
      state.statusCode = code;
      return this;
    },
    send(payload) {
      state.payload = payload;
      return this;
    }
  };
}

function createRouteRecorder() {
  const routes = [];

  function record(method, path, optionsOrHandler, maybeHandler) {
    const hasOptions = typeof optionsOrHandler === "object" && optionsOrHandler !== null;
    routes.push({
      method,
      path,
      options: hasOptions ? optionsOrHandler : {},
      handler: hasOptions ? maybeHandler : optionsOrHandler
    });
  }

  return {
    routes,
    fastify: {
      apiRateLimit: { max: 1, timeWindow: 1000 },
      addHook() {},
      get: (path, optionsOrHandler, maybeHandler) => record("GET", path, optionsOrHandler, maybeHandler),
      post: (path, optionsOrHandler, maybeHandler) => record("POST", path, optionsOrHandler, maybeHandler),
      put: (path, optionsOrHandler, maybeHandler) => record("PUT", path, optionsOrHandler, maybeHandler),
      patch: (path, optionsOrHandler, maybeHandler) => record("PATCH", path, optionsOrHandler, maybeHandler),
      delete: (path, optionsOrHandler, maybeHandler) => record("DELETE", path, optionsOrHandler, maybeHandler)
    }
  };
}

function findRoute(routes, method, path) {
  return routes.find((route) => route.method === method && route.path === path);
}

function parsePositiveIntegerOr(value, fallback = 1) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNullableBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  return null;
}

function normalizeScheduleScope(value) {
  const normalized = String(value || "single").trim().toLowerCase();
  return ["single", "future", "all"].includes(normalized) ? normalized : "";
}

function normalizeAppointmentStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeScheduleRepeatPayload(value) {
  const repeat = value && typeof value === "object" ? value : {};
  return {
    enabled: Boolean(repeat.enabled),
    type: "weekly",
    untilDate: String(repeat.untilDate || "").trim(),
    dayKeys: Array.isArray(repeat.dayKeys) ? repeat.dayKeys : [],
    skipConflicts: repeat.skipConflicts !== false
  };
}

function createRouteError(statusCode, payload) {
  const error = new Error(payload?.message || "Request failed.");
  error.statusCode = statusCode;
  error.payload = payload;
  return error;
}

function createAccessRequest({
  features = ["appointments.planner", "statistics.planner_report"],
  userId = 7
} = {}) {
  return {
    authContext: {
      userId,
      organizationId: 3,
      requester: {
        id: userId,
        role_id: 11,
        is_admin: false,
        is_platform_admin: false,
        role_label: "teacher",
        position_label: "staff",
        organization_allowed_features: features
      }
    },
    log: { error() {} }
  };
}

function createScheduleContext(overrides = {}) {
  return {
    randomUUID: () => "11111111-1111-1111-1111-111111111111",
    setNoCacheHeaders() {},
    requireAppointmentsAccess: async (request) => ({
      authContext: request.authContext,
      requester: request.authContext?.requester
    }),
    hasPermission: async () => true,
    PERMISSIONS: {
      APPOINTMENTS_READ: "appointments.read",
      APPOINTMENTS_CREATE: "appointments.create",
      APPOINTMENTS_UPDATE: "appointments.update",
      APPOINTMENTS_DELETE: "appointments.delete",
      APPOINTMENTS_VIP_CLIENTS_MY_CHILDREN: "appointments.vip-clients.my-children",
      APPOINTMENTS_STATISTICS_PLANNER_REPORT: "appointments.statistics.planner-report"
    },
    parsePositiveIntegerOr,
    parseNullableBoolean,
    normalizeAppointmentStatus,
    normalizeScheduleScope,
    normalizeScheduleRepeatPayload,
    normalizeVisibleWeekDays: (value) => (Array.isArray(value) ? value : []),
    validateSchedulePayload: () => ({}),
    validateScheduleRepeatPayload: () => null,
    validateRepeatDaysAgainstVisibleWeekDays: () => ({ error: null, normalizedDayKeys: [] }),
    validateSlotAgainstWorkingHours: () => null,
    getDurationMinutesFromTimes: () => 60,
    getHistoryLockErrorForRequester: () => null,
    parseDateYmdToUtcDate: () => new Date("2026-03-09T00:00:00.000Z"),
    toDayKeyFromUtcDate: () => "mon",
    collectDayNumsFromDates: () => [1],
    buildWeeklyRecurringDates: () => [],
    buildBreakRangesByDay: () => new Map(),
    hasSpecialistBreakConflict: () => null,
    buildBreakConflictMessage: () => "Break conflict.",
    buildScheduleNotification: () => ({ message: "ok", data: {} }),
    createRouteError,
    isUniqueOrExclusionConflict: () => false,
    getAppointmentPlannerReportFilters: async () => ({ specialists: [], clients: [] }),
    getAppointmentPlannerReport: async () => ({ summary: {}, details: [], specialists: [], period: {} }),
    getAppointmentClientScopeInfo: async () => null,
    getAppointmentSchedulesByRange: async () => [],
    isVipClassAssignedToUser: async () => true,
    getAppointmentHistoryLockDaysByOrganization: async () => 0,
    getAppointmentSettingsByOrganization: async () => ({ visibleWeekDays: ["mon", "tue", "wed", "thu", "fri"] }),
    getAppointmentBreaksBySpecialistAndDays: async () => [],
    getAppointmentScheduleTargetsByScope: async () => ({
      items: [],
      scope: "single",
      isRecurring: false
    }),
    hasAppointmentScheduleConflict: async () => false,
    createAppointmentSchedule: async () => ({ id: "91" }),
    updateAppointmentScheduleByIdWithRepeatMeta: async () => ({ id: "91" }),
    updateAppointmentSchedulesByIds: async () => ([{ id: "91" }]),
    deleteAppointmentSchedulesByIds: async () => 1,
    withAppointmentTransaction: async (callback) => callback({ query: async () => ({ rows: [] }) }),
    toAppointmentDayNum: () => 1,
    resolveAppointmentVipReadScope: async () => "all",
    resolveOwnAppointmentSpecialistUserId: () => null,
    isVipClientAssignedToUser: async () => true,
    broadcastAppointmentChange: async () => {},
    DATE_REGEX: /^\d{4}-\d{2}-\d{2}$/,
    ...overrides
  };
}

function createReferenceContext(overrides = {}) {
  return {
    setNoCacheHeaders() {},
    requireAppointmentsAccess: async (request) => ({
      authContext: request.authContext,
      requester: request.authContext?.requester
    }),
    PERMISSIONS: {
      APPOINTMENTS_READ: "appointments.read"
    },
    parsePositiveIntegerOr,
    resolveOwnAppointmentSpecialistUserId: () => null,
    resolveAppointmentVipReadScope: async () => "all",
    getAppointmentClientScopeInfo: async () => null,
    getAppointmentSpecialistsByOrganization: async () => [],
    getAppointmentClientNoShowSummary: async () => ({ clientId: "44", noShowCount: 0 }),
    isVipClientAssignedToUser: async () => true,
    ...overrides
  };
}

function createBreaksContext(overrides = {}) {
  return {
    setNoCacheHeaders() {},
    requireAppointmentsAccess: async (request) => ({
      authContext: request.authContext,
      requester: request.authContext?.requester
    }),
    PERMISSIONS: {
      APPOINTMENTS_READ: "appointments.read",
      APPOINTMENTS_UPDATE: "appointments.update"
    },
    parsePositiveIntegerOr,
    resolveOwnAppointmentSpecialistUserId: () => null,
    getAppointmentBreaksBySpecialist: async () => [],
    normalizeBreakItems: (value) => (Array.isArray(value) ? value : []),
    validateBreaksPayload: () => null,
    replaceAppointmentBreaksBySpecialist: async () => [],
    isUniqueOrExclusionConflict: () => false,
    ...overrides
  };
}

test("specialists reference endpoint scopes specialist users to their own record", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentReferenceRoutes(
    recorder.fastify,
    createReferenceContext({
      resolveOwnAppointmentSpecialistUserId: () => 7,
      getAppointmentSpecialistsByOrganization: async () => [
        { id: "7", name: "Teacher One" },
        { id: "8", name: "Teacher Two" }
      ]
    })
  );

  const route = findRoute(recorder.routes, "GET", "/specialists");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(createAccessRequest({ features: ["appointments.planner"] }), reply);

  assert.equal(reply.state.statusCode, 200);
  assert.deepEqual(reply.state.payload?.items, [{ id: "7", name: "Teacher One" }]);
});

test("client no-show summary blocks assigned-scope access to unassigned VIP clients", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentReferenceRoutes(
    recorder.fastify,
    createReferenceContext({
      resolveAppointmentVipReadScope: async () => "assigned",
      getAppointmentClientScopeInfo: async () => ({ id: "44", isVip: true }),
      isVipClientAssignedToUser: async () => false,
      getAppointmentClientNoShowSummary: async () => {
        throw new Error("Summary should not load for forbidden VIP client.");
      }
    })
  );

  const route = findRoute(recorder.routes, "GET", "/client-no-show-summary");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest({ features: ["appointments.planner"] }),
      query: { clientId: "44" }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 403);
  assert.equal(reply.state.payload?.message, "Forbidden.");
});

test("planner report filters scope specialist users to their own specialist id", async () => {
  const recorder = createRouteRecorder();
  let capturedArgs = null;

  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      resolveOwnAppointmentSpecialistUserId: () => 7,
      getAppointmentPlannerReportFilters: async (args) => {
        capturedArgs = args;
        return {
          specialists: [
            { id: "7", name: "Teacher One" },
            { id: "8", name: "Teacher Two" }
          ],
          clients: []
        };
      }
    })
  );

  const route = findRoute(recorder.routes, "GET", "/report/filters");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(createAccessRequest(), reply);

  assert.equal(reply.state.statusCode, 200);
  assert.deepEqual(capturedArgs, {
    organizationId: 3,
    assignedUserId: null,
    specialistId: 7
  });
  assert.deepEqual(reply.state.payload?.specialists, [{ id: "7", name: "Teacher One" }]);
});

test("planner report filters use assigned requester scope for VIP client options", async () => {
  const recorder = createRouteRecorder();
  let capturedArgs = null;

  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      resolveAppointmentVipReadScope: async () => "assigned",
      getAppointmentPlannerReportFilters: async (args) => {
        capturedArgs = args;
        return { specialists: [], clients: [] };
      }
    })
  );

  const route = findRoute(recorder.routes, "GET", "/report/filters");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(createAccessRequest(), reply);

  assert.equal(reply.state.statusCode, 200);
  assert.deepEqual(capturedArgs, {
    organizationId: 3,
    assignedUserId: 7,
    specialistId: null
  });
});

test("planner report applies assigned requester scope even without vip-only filter", async () => {
  const recorder = createRouteRecorder();
  let capturedArgs = null;

  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      resolveAppointmentVipReadScope: async () => "assigned",
      getAppointmentPlannerReport: async (args) => {
        capturedArgs = args;
        return { summary: {}, details: [], specialists: [], period: {} };
      }
    })
  );

  const route = findRoute(recorder.routes, "GET", "/report");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest(),
      query: {
        from: "2026-03-01",
        to: "2026-03-09"
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 200);
  assert.deepEqual(capturedArgs, {
    organizationId: 3,
    from: "2026-03-01",
    to: "2026-03-09",
    specialistId: null,
    clientId: null,
    isVip: null,
    assignedUserId: 7
  });
});

test("planner report returns migration-required when planner report schema is missing", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      getAppointmentPlannerReport: async () => {
        const error = new Error("Appointment planner report migration is required.");
        error.code = "MIGRATION_REQUIRED";
        throw error;
      }
    })
  );

  const route = findRoute(recorder.routes, "GET", "/report");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest(),
      query: {
        from: "2026-03-01",
        to: "2026-03-09"
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 409);
  assert.equal(reply.state.payload?.code, "MIGRATION_REQUIRED");
});

test("planner report blocks assigned-scope access to an unassigned VIP client filter", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      resolveAppointmentVipReadScope: async () => "assigned",
      getAppointmentClientScopeInfo: async () => ({ id: "44", isVip: true }),
      isVipClientAssignedToUser: async () => false,
      getAppointmentPlannerReport: async () => {
        throw new Error("Report should not load for forbidden VIP client.");
      }
    })
  );

  const route = findRoute(recorder.routes, "GET", "/report");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest(),
      query: {
        from: "2026-03-01",
        to: "2026-03-09",
        clientId: "44"
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 403);
  assert.equal(reply.state.payload?.message, "Forbidden.");
});

test("planner report blocks specialist users from querying another specialist", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      resolveOwnAppointmentSpecialistUserId: () => 7,
      getAppointmentPlannerReport: async () => {
        throw new Error("Report should not load for another specialist.");
      }
    })
  );

  const route = findRoute(recorder.routes, "GET", "/report");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest(),
      query: {
        from: "2026-03-01",
        to: "2026-03-09",
        specialistId: "9"
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 403);
  assert.equal(reply.state.payload?.message, "Forbidden.");
});

test("schedule read blocks specialist users from querying another specialist planner", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      resolveOwnAppointmentSpecialistUserId: () => 7,
      getAppointmentSchedulesByRange: async () => {
        throw new Error("Schedules should not load for another specialist.");
      }
    })
  );

  const route = findRoute(recorder.routes, "GET", "/schedules");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest({ features: ["appointments.planner"] }),
      query: {
        specialistId: "9",
        dateFrom: "2026-03-09",
        dateTo: "2026-03-09"
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 403);
  assert.equal(reply.state.payload?.message, "Forbidden.");
});

test("schedule read blocks assigned-scope access to an unassigned VIP client", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      resolveAppointmentVipReadScope: async () => "assigned",
      getAppointmentClientScopeInfo: async () => ({ id: "44", isVip: true }),
      isVipClientAssignedToUser: async () => false,
      getAppointmentSchedulesByRange: async () => {
        throw new Error("Schedules should not load for forbidden VIP client.");
      }
    })
  );

  const route = findRoute(recorder.routes, "GET", "/schedules");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest({ features: ["appointments.planner", "vip_clients.my_children"] }),
      query: {
        specialistId: "9",
        clientId: "44",
        dateFrom: "2026-03-09",
        dateTo: "2026-03-09"
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 403);
  assert.equal(reply.state.payload?.message, "Forbidden.");
});

test("schedule create blocks specialist users from writing another specialist schedule", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      resolveOwnAppointmentSpecialistUserId: () => 7,
      createAppointmentSchedule: async () => {
        throw new Error("Schedule should not be created for another specialist.");
      }
    })
  );

  const route = findRoute(recorder.routes, "POST", "/schedules");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest({ features: ["appointments.planner"] }),
      body: {
        specialistId: "9",
        clientId: "44",
        appointmentDate: "2026-03-09",
        startTime: "09:00",
        endTime: "10:00",
        durationMinutes: "60",
        service: "Lesson",
        status: "pending",
        note: ""
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 403);
  assert.equal(reply.state.payload?.message, "Forbidden.");
});

test("schedule create blocks assigned-scope writes for unassigned VIP clients", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      resolveAppointmentVipReadScope: async () => "assigned",
      getAppointmentClientScopeInfo: async () => ({ id: "44", isVip: true }),
      isVipClientAssignedToUser: async () => false,
      createAppointmentSchedule: async () => {
        throw new Error("Schedule should not be created for forbidden VIP client.");
      }
    })
  );

  const route = findRoute(recorder.routes, "POST", "/schedules");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest({ features: ["appointments.planner"] }),
      body: {
        specialistId: "9",
        clientId: "44",
        appointmentDate: "2026-03-09",
        startTime: "09:00",
        endTime: "10:00",
        durationMinutes: "60",
        service: "Lesson",
        status: "pending",
        note: ""
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 403);
  assert.equal(reply.state.payload?.message, "Forbidden.");
});

test("schedule update blocks specialist users from editing another specialist schedule", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      resolveOwnAppointmentSpecialistUserId: () => 7,
      getAppointmentScheduleTargetsByScope: async () => ({
        items: [{
          id: 91,
          specialistId: 9,
          clientId: 44,
          isVip: false,
          appointmentDate: "2026-03-09"
        }],
        scope: "single",
        isRecurring: false
      }),
      updateAppointmentSchedulesByIds: async () => {
        throw new Error("Schedule should not be updated for another specialist.");
      }
    })
  );

  const route = findRoute(recorder.routes, "PATCH", "/schedules/:id");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest({ features: ["appointments.planner"] }),
      params: { id: "91" },
      query: { scope: "single" },
      body: {
        specialistId: "7",
        clientId: "44",
        appointmentDate: "2026-03-09",
        startTime: "09:00",
        endTime: "10:00",
        durationMinutes: "60",
        service: "Lesson",
        status: "pending",
        note: ""
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 403);
  assert.equal(reply.state.payload?.message, "Forbidden.");
});

test("schedule update blocks assigned-scope writes for unassigned VIP schedules", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      resolveAppointmentVipReadScope: async () => "assigned",
      getAppointmentClientScopeInfo: async () => ({ id: "44", isVip: true }),
      getAppointmentScheduleTargetsByScope: async () => ({
        items: [{
          id: 91,
          clientId: 44,
          isVip: true,
          appointmentDate: "2026-03-09"
        }],
        scope: "single",
        isRecurring: false
      }),
      isVipClientAssignedToUser: async () => false,
      updateAppointmentSchedulesByIds: async () => {
        throw new Error("Schedule should not be updated for forbidden VIP client.");
      }
    })
  );

  const route = findRoute(recorder.routes, "PATCH", "/schedules/:id");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest({ features: ["appointments.planner", "vip_clients.my_children"] }),
      params: { id: "91" },
      query: { scope: "single" },
      body: {
        specialistId: "9",
        clientId: "44",
        appointmentDate: "2026-03-09",
        startTime: "09:00",
        endTime: "10:00",
        durationMinutes: "60",
        service: "Lesson",
        status: "pending",
        note: ""
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 403);
  assert.equal(reply.state.payload?.message, "Forbidden.");
});

test("schedule delete blocks specialist users from deleting another specialist schedule", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      resolveOwnAppointmentSpecialistUserId: () => 7,
      getAppointmentScheduleTargetsByScope: async () => ({
        items: [{
          id: 91,
          specialistId: 9,
          clientId: 44,
          isVip: false,
          appointmentDate: "2026-03-09"
        }],
        scope: "single",
        isRecurring: false
      }),
      deleteAppointmentSchedulesByIds: async () => {
        throw new Error("Schedule should not be deleted for another specialist.");
      }
    })
  );

  const route = findRoute(recorder.routes, "DELETE", "/schedules/:id");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest({ features: ["appointments.planner"] }),
      params: { id: "91" },
      query: { scope: "single" }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 403);
  assert.equal(reply.state.payload?.message, "Forbidden.");
});

test("schedule delete blocks assigned-scope writes for unassigned VIP schedules", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      resolveAppointmentVipReadScope: async () => "assigned",
      getAppointmentScheduleTargetsByScope: async () => ({
        items: [{
          id: 91,
          clientId: 44,
          isVip: true,
          appointmentDate: "2026-03-09"
        }],
        scope: "single",
        isRecurring: false
      }),
      isVipClientAssignedToUser: async () => false,
      deleteAppointmentSchedulesByIds: async () => {
        throw new Error("Schedule should not be deleted for forbidden VIP client.");
      }
    })
  );

  const route = findRoute(recorder.routes, "DELETE", "/schedules/:id");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest({ features: ["appointments.planner"] }),
      params: { id: "91" },
      query: { scope: "single" }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 403);
  assert.equal(reply.state.payload?.message, "Forbidden.");
});

test("breaks routes block specialist users from accessing another specialist", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentBreakRoutes(
    recorder.fastify,
    createBreaksContext({
      resolveOwnAppointmentSpecialistUserId: () => 7,
      getAppointmentBreaksBySpecialist: async () => {
        throw new Error("Breaks should not load for another specialist.");
      }
    })
  );

  const route = findRoute(recorder.routes, "GET", "/breaks");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest({ features: ["appointments.breaks"] }),
      query: { specialistId: "9" }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 403);
  assert.equal(reply.state.payload?.message, "Forbidden.");
});
