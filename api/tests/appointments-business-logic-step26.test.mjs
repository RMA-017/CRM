import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const referenceRoutesModule = await import("../src/modules/appointments/routes/reference.routes.js");
const breaksRoutesModule = await import("../src/modules/appointments/routes/breaks.routes.js");
const schedulesRoutesModule = await import("../src/modules/appointments/routes/schedules.routes.js");
const appointmentRouteAccessModule = await import("../src/modules/appointments/appointment-route-access.js");
const appointmentRouteHelpersModule = await import("../src/modules/appointments/appointment-route-helpers.js");

const { registerAppointmentReferenceRoutes } = referenceRoutesModule;
const { registerAppointmentBreakRoutes } = breaksRoutesModule;
const { registerAppointmentScheduleRoutes } = schedulesRoutesModule;
const { resolveNotificationAudience, resolveOwnAppointmentSpecialistUserId } = appointmentRouteAccessModule;
const {
  formatAppointmentCancellationNote,
  prefixAppointmentCancellationNote
} = appointmentRouteHelpersModule;

test("appointment schedule service normalizes malformed repeat group keys before recurring update logic", async () => {
  const source = await readFile(
    new URL("../src/modules/appointments/appointment-settings.service.js", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /const UUID_LIKE_REGEX = .*?;\s*[\s\S]*function normalizeUuidString\(value\)/s,
    "Appointment schedule service should keep repeat-group normalization behind a shared UUID helper."
  );

  assert.match(
    source,
    /const repeatGroupKey = normalizeUuidString\(row\?\.repeat_group_key\);[\s\S]*isRecurring: repeatType === "weekly" && Boolean\(repeatGroupKey\)/s,
    "Planner schedule items should stop treating malformed repeat group keys as recurring series."
  );

  assert.match(
    source,
    /repeatGroupKey: normalizeUuidString\(row\?\.repeat_group_key\),[\s\S]*const repeatGroupKey = normalizeUuidString\(anchor\.repeat_group_key\);/s,
    "Schedule target loading should normalize malformed repeat group keys before recurring update logic runs."
  );

  assert.match(
    source,
    /repeat_group_key = CASE WHEN \$12::boolean THEN NULL ELSE s\.repeat_group_key END,[\s\S]*repeat_type = CASE WHEN \$12::boolean THEN 'none' ELSE s\.repeat_type END,/s,
    "Clearing repeat metadata should reset repeat_type to 'none' instead of NULL."
  );
});

test("appointment schedule routes block confirmed status for future appointments", async () => {
  const source = await readFile(
    new URL("../src/modules/appointments/routes/schedules.routes.js", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /function getTodayYmdInTashkent\(\)[\s\S]*timeZone: "Asia\/Tashkent"[\s\S]*function getConfirmedFutureDateError\(status, appointmentDates\)[\s\S]*String\(status \|\| ""\)\.trim\(\)\.toLowerCase\(\) !== "confirmed"[\s\S]*date > today[\s\S]*Future appointments cannot be confirmed/s,
    "Schedule routes should compare confirmed appointment dates against today's Asia/Tashkent date."
  );
  assert.match(
    source,
    /const confirmedDateError = getConfirmedFutureDateError\(status, \[appointmentDate\]\);[\s\S]*return reply\.status\(400\)\.send\(confirmedDateError\);[\s\S]*const repeatConfirmedDateError = getConfirmedFutureDateError\(status, recurringDates\);[\s\S]*return reply\.status\(400\)\.send\(repeatConfirmedDateError\);/s,
    "Schedule create should reject single and recurring future confirmed appointments."
  );
  assert.match(
    source,
    /const targetDatesForConfirmedStatus = target\.scope === "single"[\s\S]*const confirmedDateError = getConfirmedFutureDateError\(status, targetDatesForConfirmedStatus\);[\s\S]*return reply\.status\(400\)\.send\(confirmedDateError\);/s,
    "Schedule update should reject future confirmed appointments before saving."
  );
});

test("appointment schedule validation requires a service name", async () => {
  const source = await readFile(
    new URL("../src/modules/appointments/appointment-route-helpers.js", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /if \(!serviceName\) \{[\s\S]*errors\.service = "Service is required\.";[\s\S]*if \(serviceName\.length > 128\)/s,
    "Schedule validation should reject planner appointments that do not have a selected service."
  );
});

test("manager role is not locked to own planner by specialist position label", () => {
  const specialistScope = resolveOwnAppointmentSpecialistUserId({
    authContext: { userId: 17 },
    requester: {
      role_label: "Manager",
      position_label: "Specialist"
    }
  });

  assert.equal(specialistScope, null);
});

test("planner notifications target specialists for any non-specialist staff role", async () => {
  const audience = await resolveNotificationAudience({
    authContext: { userId: 7 },
    requester: {
      role_label: "Kassa",
      position_label: ""
    }
  }, [11]);

  assert.deepEqual(audience, {
    targetUserIds: [11],
    targetRoles: []
  });
});

test("planner notifications target managers when a specialist changes own planner", async () => {
  const audience = await resolveNotificationAudience({
    authContext: { userId: 11 },
    requester: {
      role_label: "Specialist",
      position_label: ""
    }
  }, [11]);

  assert.deepEqual(audience, {
    targetUserIds: [],
    targetRoles: ["manager"]
  });
});

test("appointment cancellation notes include their source", () => {
  assert.equal(prefixAppointmentCancellationNote("bola kasal", "Parent"), "Parent: bola kasal");
  assert.equal(prefixAppointmentCancellationNote("Parent: bola kasal", "Parent"), "Parent: bola kasal");
  assert.equal(
    formatAppointmentCancellationNote("vaqtim yo'q", "cancelled", {
      requester: {
        role_label: "Specialist",
        position_label: ""
      }
    }),
    "Specialist: vaqtim yo'q"
  );
  assert.equal(
    formatAppointmentCancellationNote("jadval o'zgardi", "cancelled", {
      requester: {
        role_label: "Manager",
        position_label: ""
      }
    }),
    "Manager: jadval o'zgardi"
  );
  assert.equal(formatAppointmentCancellationNote("oddiy note", "pending", {}), "oddiy note");
});

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
  userId = 7,
  role = "teacher",
  position = "staff"
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
        role,
        position,
        role_label: role,
        position_label: position,
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
      APPOINTMENTS_PLANNER_READ: "appointments.planner.read",
      APPOINTMENTS_PLANNER_CREATE: "appointments.planner.create",
      APPOINTMENTS_PLANNER_UPDATE: "appointments.planner.update",
      APPOINTMENTS_PLANNER_DELETE: "appointments.planner.delete",
      APPOINTMENTS_STATISTICS_PLANNER_REPORT: "appointments.statistics.planner-report",
      APPOINTMENTS_STATISTICS_PLANNER_REPORT_ONLY: "appointments.statistics.planner-report.only",
      APPOINTMENTS_STATISTICS_PLANNER_REPORT_ALL: "appointments.statistics.planner-report.all"
    },
    parsePositiveIntegerOr,
    parseNullableBoolean,
    normalizeAppointmentStatus,
    normalizeScheduleScope,
    normalizeScheduleRepeatPayload,
    normalizeVisibleWeekDays: (value) => (Array.isArray(value) ? value : []),
    validateSchedulePayload: () => ({}),
    validateScheduleRepeatPayload: () => null,
    validateRepeatDaysAgainstVisibleWeekDays: ({ repeatDayKeys }) => ({
      error: null,
      normalizedDayKeys: Array.isArray(repeatDayKeys) ? repeatDayKeys : []
    }),
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
    buildWorkScheduleBlockRangesByDay: () => new Map(),
    hasSpecialistWorkScheduleConflict: () => null,
    buildWorkScheduleBlockConflictMessage: () => "Blocked slot conflict.",
    buildScheduleNotification: () => ({ message: "ok", data: {} }),
    createRouteError,
    isUniqueOrExclusionConflict: () => false,
    getAppointmentPlannerReportFilters: async () => ({ specialists: [], clients: [] }),
    getAppointmentPlannerReport: async () => ({ summary: {}, details: [], specialists: [], period: {} }),
    getAppointmentClientScopeInfo: async () => null,
    ensureAutoRollingRecurringSchedulesCoverRange: async () => ({ changed: false }),
    getAppointmentSchedulesByRange: async () => [],
    isVipClassAssignedToUser: async () => true,
    getAppointmentHistoryLockDaysByOrganization: async () => 0,
    getAppointmentSettingsByOrganization: async () => ({ visibleWeekDays: ["mon", "tue", "wed", "thu", "fri"] }),
    listAppointmentSpecialistAbsences: async () => [],
    getAppointmentBreaksBySpecialistAndDays: async () => [],
    getAppointmentScheduleTargetsByScope: async () => ({
      items: [],
      scope: "single",
      isRecurring: false
    }),
    hasAppointmentClientConflict: async () => false,
    hasAppointmentScheduleConflict: async () => false,
    hasVipRoutineConflictForSpecialist: async () => false,
    hasVipRoutineConflictForClient: async () => false,
    createAppointmentSchedule: async () => ({ id: "91" }),
    updateAppointmentScheduleByIdWithRepeatMeta: async () => ({ id: "91" }),
    updateAppointmentSchedulesByIds: async () => ([{ id: "91" }]),
    deleteAppointmentSchedulesByIds: async () => 1,
    withAppointmentTransaction: async (callback) => callback({ query: async () => ({ rows: [] }) }),
    toAppointmentDayNum: () => 1,
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
    hasPermission: async () => true,
    requesterHasOrgFeature: (requester, feature) => (
      Array.isArray(requester?.organization_allowed_features)
      && requester.organization_allowed_features.includes(feature)
    ),
    PERMISSIONS: {
      APPOINTMENTS_PLANNER_READ: "appointments.planner.read"
    },
    parsePositiveIntegerOr,
    getAppointmentClientScopeInfo: async () => null,
    getAppointmentSpecialistsByOrganization: async () => [],
    getAppointmentClientNoShowSummary: async () => ({ clientId: "44", noShowCount: 0 }),
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
    requesterHasOrgFeature: (requester, feature) => (
      Array.isArray(requester?.organization_allowed_features)
      && requester.organization_allowed_features.includes(feature)
    ),
    hasPermission: async () => true,
    PERMISSIONS: {
      APPOINTMENTS_PLANNER_READ: "appointments.planner.read",
      APPOINTMENTS_PLANNER_UPDATE: "appointments.planner.update"
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

test("specialists reference endpoint keeps all specialists visible for planner readers", async () => {
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
  assert.deepEqual(reply.state.payload?.items, [
    { id: "7", name: "Teacher One" },
    { id: "8", name: "Teacher Two" }
  ]);
});

test("client no-show summary allows VIP clients with planner read access", async () => {
  const recorder = createRouteRecorder();
  let summaryArgs = null;
  registerAppointmentReferenceRoutes(
    recorder.fastify,
    createReferenceContext({
      getAppointmentClientScopeInfo: async () => ({ id: "44", isVip: true }),
      getAppointmentClientNoShowSummary: async (args) => {
        summaryArgs = args;
        return { clientId: "44", noShowCount: 2 };
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

  assert.equal(reply.state.statusCode, 200);
  assert.deepEqual(summaryArgs, {
    organizationId: 3,
    clientId: 44
  });
  assert.deepEqual(reply.state.payload?.item, { clientId: "44", noShowCount: 2 });
});

test("planner report only permission scopes report endpoints to requester", async () => {
  const recorder = createRouteRecorder();
  const calls = [];

  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      requesterHasPermission: async (_requester, permissionCode) => (
        permissionCode === "appointments.statistics.planner-report.only"
      ),
      getAppointmentPlannerReportFilters: async (args) => {
        calls.push({ type: "filters", args });
        return { specialists: [], clients: [] };
      },
      getAppointmentPlannerReport: async (args) => {
        calls.push({ type: "report", args });
        return { summary: {}, details: [], specialists: [], period: {} };
      }
    })
  );

  const filtersRoute = findRoute(recorder.routes, "GET", "/report/filters");
  const reportRoute = findRoute(recorder.routes, "GET", "/report");
  assert.equal(typeof filtersRoute?.handler, "function");
  assert.equal(typeof reportRoute?.handler, "function");

  const filtersReply = createReplyRecorder();
  await filtersRoute.handler(
    {
      ...createAccessRequest(),
      query: { includeAllClients: "true" }
    },
    filtersReply
  );

  const reportReply = createReplyRecorder();
  await reportRoute.handler(
    {
      ...createAccessRequest(),
      query: {
        from: "2026-03-01",
        to: "2026-03-09"
      }
    },
    reportReply
  );

  assert.equal(filtersReply.state.statusCode, 200);
  assert.equal(reportReply.state.statusCode, 200);
  assert.deepEqual(calls.map((call) => call.type), ["filters", "report"]);
  assert.deepEqual(calls.map((call) => call.args.assignedUserId), [7, 7]);
  assert.deepEqual(calls.map((call) => call.args.specialistId), [7, 7]);
  assert.deepEqual(filtersReply.state.payload?.scope, {
    specialistId: 7,
    specialistLocked: true
  });
  assert.deepEqual(reportReply.state.payload?.scope, {
    specialistId: 7,
    specialistLocked: true
  });
});

test("planner report endpoints reject unauthenticated users", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      requesterHasPermission: async () => false,
      getAppointmentPlannerReportFilters: async () => {
        throw new Error("Filters should not load without report access.");
      },
      getAppointmentPlannerReport: async () => {
        throw new Error("Report should not load without report access.");
      }
    })
  );

  const filtersRoute = findRoute(recorder.routes, "GET", "/report/filters");
  const reportRoute = findRoute(recorder.routes, "GET", "/report");
  assert.equal(typeof filtersRoute?.handler, "function");
  assert.equal(typeof reportRoute?.handler, "function");

  const filtersReply = createReplyRecorder();
  await filtersRoute.handler({ authContext: null }, filtersReply);

  const reportReply = createReplyRecorder();
  await reportRoute.handler(
    {
      authContext: null,
      query: {
        from: "2026-03-01",
        to: "2026-03-09"
      }
    },
    reportReply
  );

  assert.equal(filtersReply.state.statusCode, 401);
  assert.equal(reportReply.state.statusCode, 401);
});

test("planner report endpoints reject authenticated users without report permission", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      requesterHasPermission: async () => false,
      getAppointmentPlannerReportFilters: async () => {
        throw new Error("Filters should not load without report permission.");
      },
      getAppointmentPlannerReport: async () => {
        throw new Error("Report should not load without report permission.");
      }
    })
  );

  const filtersRoute = findRoute(recorder.routes, "GET", "/report/filters");
  const reportRoute = findRoute(recorder.routes, "GET", "/report");
  assert.equal(typeof filtersRoute?.handler, "function");
  assert.equal(typeof reportRoute?.handler, "function");

  const filtersReply = createReplyRecorder();
  await filtersRoute.handler(createAccessRequest(), filtersReply);

  const reportReply = createReplyRecorder();
  await reportRoute.handler(
    {
      ...createAccessRequest(),
      query: {
        from: "2026-03-01",
        to: "2026-03-09"
      }
    },
    reportReply
  );

  assert.equal(filtersReply.state.statusCode, 403);
  assert.equal(reportReply.state.statusCode, 403);
});

test("planner report filters scope only-permission users to their own specialist id", async () => {
  const recorder = createRouteRecorder();
  let capturedArgs = null;

  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      requesterHasPermission: async (_requester, permissionCode) => (
        permissionCode === "appointments.statistics.planner-report.only"
      ),
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
    assignedUserId: 7,
    specialistId: 7,
    includeAllClients: false
  });
  assert.deepEqual(reply.state.payload?.specialists, [{ id: "7", name: "Teacher One" }]);
  assert.deepEqual(reply.state.payload?.scope, {
    specialistId: 7,
    specialistLocked: true
  });
});

test("planner report filters keep all-permission scope unrestricted", async () => {
  const recorder = createRouteRecorder();
  let capturedArgs = null;

  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      requesterHasPermission: async (_requester, permissionCode) => (
        permissionCode === "appointments.statistics.planner-report.all"
      ),
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
  await route.handler(
    createAccessRequest({
      userId: 17,
      role: "manager"
    }),
    reply
  );

  assert.equal(reply.state.statusCode, 200);
  assert.deepEqual(capturedArgs, {
    organizationId: 3,
    assignedUserId: null,
    specialistId: null,
    includeAllClients: false
  });
  assert.deepEqual(reply.state.payload?.specialists, [
    { id: "7", name: "Teacher One" },
    { id: "8", name: "Teacher Two" }
  ]);
  assert.deepEqual(reply.state.payload?.scope, {
    specialistId: null,
    specialistLocked: false
  });
});

test("planner report filters use assigned requester scope for VIP client options", async () => {
  const recorder = createRouteRecorder();
  let capturedArgs = null;

  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      requesterHasPermission: async (_requester, permissionCode) => (
        permissionCode === "appointments.statistics.planner-report.only"
      ),
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
    specialistId: 7,
    includeAllClients: false
  });
});

test("planner report filters can request all clients for planner toolbar", async () => {
  const recorder = createRouteRecorder();
  let capturedArgs = null;

  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      getAppointmentPlannerReportFilters: async (args) => {
        capturedArgs = args;
        return { specialists: [], clients: [] };
      }
    })
  );

  const route = findRoute(recorder.routes, "GET", "/report/filters");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest(),
      query: { includeAllClients: "true" }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 200);
  assert.deepEqual(capturedArgs, {
    organizationId: 3,
    assignedUserId: null,
    specialistId: null,
    includeAllClients: true
  });
});

test("planner report applies assigned requester scope even without vip-only filter", async () => {
  const recorder = createRouteRecorder();
  let capturedArgs = null;

  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      requesterHasPermission: async (_requester, permissionCode) => (
        permissionCode === "appointments.statistics.planner-report.only"
      ),
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
    specialistId: 7,
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

test("planner report includes cancellation notes from appointments and parent responses", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/appointments/appointment-settings.service.js", import.meta.url),
    "utf8"
  );

  assert.match(
    serviceSource,
    /export async function getAppointmentPlannerReport[\s\S]*COALESCE\(NULLIF\(TRIM\(s\.note\), ''\), NULLIF\(TRIM\(parent_cancel\.reason\), ''\), ''\) AS note/s,
    "Planner report should project appointment notes and fall back to parent cancellation reasons."
  );
  assert.match(
    serviceSource,
    /LEFT JOIN LATERAL \([\s\S]*FROM appointment_parent_responses apr[\s\S]*apr\.response_status = 'not_coming'[\s\S]*ORDER BY apr\.responded_at DESC, apr\.id DESC[\s\S]*\) parent_cancel ON TRUE/s,
    "Planner report should read the latest parent not-coming reason when the appointment note is empty."
  );
  assert.match(
    serviceSource,
    /serviceName: String\(row\?\.service_name \|\| ""\)\.trim\(\) \|\| "Service",[\s\S]*note: String\(row\?\.note \|\| ""\)\.trim\(\)/s,
    "Planner report details should return the note field to the dashboard."
  );
});

test("planner report blocks assigned-scope access to an unassigned VIP client filter", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      requesterHasPermission: async (_requester, permissionCode) => (
        permissionCode === "appointments.statistics.planner-report.only"
      ),
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
      requesterHasPermission: async (_requester, permissionCode) => (
        permissionCode === "appointments.statistics.planner-report.only"
      ),
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

test("schedule read allows planner readers to query another specialist planner", async () => {
  const recorder = createRouteRecorder();
  let capturedArgs = null;
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      resolveOwnAppointmentSpecialistUserId: () => 7,
      getAppointmentSchedulesByRange: async (args) => {
        capturedArgs = args;
        return [];
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

  assert.equal(reply.state.statusCode, 200);
  assert.equal(capturedArgs?.specialistId, 9);
});

test("breaks read allows planner readers to query another specialist", async () => {
  const recorder = createRouteRecorder();
  let capturedArgs = null;

  registerAppointmentBreakRoutes(
    recorder.fastify,
    createBreaksContext({
      resolveOwnAppointmentSpecialistUserId: () => 7,
      getAppointmentBreaksBySpecialist: async (args) => {
        capturedArgs = args;
        return [];
      }
    })
  );

  const route = findRoute(recorder.routes, "GET", "/breaks");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest({ features: ["appointments.planner"] }),
      query: { specialistId: "9" }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 200);
  assert.deepEqual(capturedArgs, {
    organizationId: 3,
    specialistId: 9
  });
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

test("schedule create blocks client double-booking across specialists", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      hasAppointmentClientConflict: async () => true,
      createAppointmentSchedule: async () => {
        throw new Error("Schedule should not be created when the client is already booked.");
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

  assert.equal(reply.state.statusCode, 409);
  assert.equal(reply.state.payload?.message, "This client already has another appointment at this time.");
});

test("schedule create blocks specialist blocked work schedule slots", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      getAppointmentSettingsByOrganization: async () => ({
        visibleWeekDays: ["mon", "tue", "wed", "thu", "fri"],
        blockedTimes: [{
          dayOfWeek: "1",
          dayKey: "mon",
          startTime: "09:00",
          endTime: "11:00",
          reason: "Unavailable"
        }]
      }),
      buildWorkScheduleBlockRangesByDay: () => new Map([[1, [{ start: 540, end: 660, reason: "Unavailable" }]]]),
      hasSpecialistWorkScheduleConflict: () => ({ reason: "Unavailable" }),
      buildWorkScheduleBlockConflictMessage: () => "Selected time conflicts with specialist blocked slot: Unavailable.",
      createAppointmentSchedule: async () => {
        throw new Error("Schedule should not be created inside a blocked slot.");
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

  assert.equal(reply.state.statusCode, 409);
  assert.equal(
    reply.state.payload?.message,
    "Selected time conflicts with specialist blocked slot: Unavailable."
  );
});

test("schedule create builds recurring appointments from normalized repeat weekdays without crashing", async () => {
  const createdPayloads = [];
  let recurringDatesArg = null;
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      validateRepeatDaysAgainstVisibleWeekDays: () => ({
        error: null,
        normalizedDayKeys: ["mon", "wed", "fri"]
      }),
      buildWeeklyRecurringDates: ({ dayKeys }) => {
        recurringDatesArg = Array.isArray(dayKeys) ? [...dayKeys] : dayKeys;
        return ["2026-03-09", "2026-03-11", "2026-03-13"];
      },
      createAppointmentSchedule: async (payload) => {
        createdPayloads.push(payload);
        return {
          id: String(90 + createdPayloads.length),
          specialistId: String(payload.specialistId),
          clientId: String(payload.clientId),
          appointmentDate: payload.appointmentDate,
          startTime: payload.startTime,
          endTime: payload.endTime
        };
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
        note: "",
        repeat: {
          enabled: true,
          untilDate: "2026-03-31",
          dayKeys: ["Mon", "Wed", "Fri"]
        }
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 201);
  assert.deepEqual(recurringDatesArg, ["mon", "wed", "fri"]);
  assert.equal(createdPayloads.length, 3);
  assert.deepEqual(createdPayloads.map((item) => item.repeatDays), [[1, 1, 1], [1, 1, 1], [1, 1, 1]]);
  assert.equal(reply.state.payload?.summary?.createdCount, 3);
});

test("schedule create recurring keeps the clicked appointment day when submitted weekdays skip it", async () => {
  const createdPayloads = [];
  let recurringDayKeysArg = null;
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      parseDateYmdToUtcDate: (value) => new Date(`${String(value || "").trim()}T00:00:00.000Z`),
      toDayKeyFromUtcDate: (value) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][value.getUTCDay()] || "",
      toAppointmentDayNum: (value) => ({
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6,
        sun: 7
      }[String(value || "").trim().toLowerCase()] || 0),
      validateRepeatDaysAgainstVisibleWeekDays: () => ({
        error: null,
        normalizedDayKeys: ["wed", "fri"]
      }),
      buildWeeklyRecurringDates: ({ dayKeys }) => {
        recurringDayKeysArg = Array.isArray(dayKeys) ? [...dayKeys] : dayKeys;
        return ["2026-03-12", "2026-03-13"];
      },
      createAppointmentSchedule: async (payload) => {
        createdPayloads.push(payload);
        return {
          id: String(190 + createdPayloads.length),
          specialistId: String(payload.specialistId),
          clientId: String(payload.clientId),
          appointmentDate: payload.appointmentDate,
          startTime: payload.startTime,
          endTime: payload.endTime
        };
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
        note: "",
        repeat: {
          enabled: true,
          untilDate: "2026-03-31",
          dayKeys: ["Wed", "Fri"]
        }
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 201);
  assert.deepEqual(recurringDayKeysArg, ["wed", "fri", "mon"]);
  assert.deepEqual(createdPayloads.map((item) => item.appointmentDate), ["2026-03-09", "2026-03-12", "2026-03-13"]);
  assert.deepEqual(
    createdPayloads.map((item) => [...item.repeatDays].sort((left, right) => left - right)),
    [[1, 3, 5], [1, 3, 5], [1, 3, 5]]
  );
  assert.equal(reply.state.payload?.summary?.createdCount, 3);
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

test("schedule update blocks client double-booking across specialists", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      getAppointmentScheduleTargetsByScope: async () => ({
        items: [{
          id: 91,
          specialistId: 7,
          clientId: 44,
          isVip: false,
          appointmentDate: "2026-03-09"
        }],
        scope: "single",
        isRecurring: false
      }),
      hasAppointmentClientConflict: async () => true,
      updateAppointmentSchedulesByIds: async () => {
        throw new Error("Schedule should not be updated when the client is already booked.");
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

  assert.equal(reply.state.statusCode, 409);
  assert.equal(reply.state.payload?.message, "This client already has another appointment at this time.");
});

test("schedule update allows status-only edits for active appointments without rechecking availability", async () => {
  let updated = false;
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      validateSlotAgainstWorkingHours: () => ({
        field: "startTime",
        message: "Selected time is outside working hours for mon."
      }),
      getAppointmentScheduleTargetsByScope: async () => ({
        anchorId: 91,
        anchorAppointmentDate: "2026-03-09",
        isRecurring: false,
        scope: "single",
        items: [
          {
            id: 91,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-09",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          }
        ]
      }),
      updateAppointmentSchedulesByIds: async () => {
        updated = true;
        return [{
          id: "91",
          specialistId: "7",
          clientId: "44",
          appointmentDate: "2026-03-09",
          startTime: "09:00",
          endTime: "10:00"
        }];
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
        status: "confirmed",
        note: ""
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 200);
  assert.equal(updated, true);
  assert.equal(reply.state.payload?.message, "Appointment updated.");
});

test("schedule update allows no-show slots to return to pending without stale availability checks", async () => {
  let updated = false;
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      validateSlotAgainstWorkingHours: () => ({
        field: "startTime",
        message: "Selected time is outside working hours for mon."
      }),
      hasSpecialistAbsenceConflict: () => ({ startTime: "09:00", endTime: "10:00" }),
      hasSpecialistWorkScheduleConflict: () => ({ startTime: "09:00", endTime: "10:00" }),
      hasSpecialistBreakConflict: () => ({ startTime: "09:00", endTime: "10:00" }),
      hasVipRoutineConflictForSpecialist: async () => true,
      hasVipRoutineConflictForClient: async () => true,
      getAppointmentScheduleTargetsByScope: async () => ({
        anchorId: 91,
        anchorAppointmentDate: "2026-03-09",
        isRecurring: false,
        scope: "single",
        items: [
          {
            id: 91,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-09",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "no-show",
            note: "",
            isVip: false
          }
        ]
      }),
      updateAppointmentSchedulesByIds: async () => {
        updated = true;
        return [{
          id: "91",
          specialistId: "7",
          clientId: "44",
          appointmentDate: "2026-03-09",
          startTime: "09:00",
          endTime: "10:00",
          status: "pending"
        }];
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

  assert.equal(reply.state.statusCode, 200);
  assert.equal(updated, true);
  assert.equal(reply.state.payload?.message, "Appointment updated.");
});

test("schedule update allows recurring future no-show slots to return to pending without rebuilding the series", async () => {
  const updatedIds = [];
  let repeatMetaUpdateCalled = false;
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      parseDateYmdToUtcDate: (value) => new Date(`${String(value || "").trim()}T00:00:00.000Z`),
      buildWeeklyRecurringDates: () => ["2026-03-16", "2026-03-23"],
      validateSlotAgainstWorkingHours: () => ({
        field: "startTime",
        message: "Selected time is outside working hours for mon."
      }),
      getAppointmentScheduleTargetsByScope: async () => ({
        anchorId: 92,
        anchorAppointmentDate: "2026-03-16",
        repeatGroupKey: "old-group",
        repeatUntilDate: "2026-03-30",
        repeatAnchorDate: "2026-03-09",
        repeatDays: ["mon"],
        isRecurring: true,
        scope: "future",
        items: [
          {
            id: 92,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-16",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "no-show",
            note: "",
            isVip: false
          },
          {
            id: 93,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-23",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "no-show",
            note: "",
            isVip: false
          }
        ],
        seriesItems: [
          {
            id: 91,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-09",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "no-show",
            note: "",
            isVip: false
          },
          {
            id: 92,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-16",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "no-show",
            note: "",
            isVip: false
          },
          {
            id: 93,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-23",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "no-show",
            note: "",
            isVip: false
          }
        ]
      }),
      updateAppointmentScheduleByIdWithRepeatMeta: async () => {
        repeatMetaUpdateCalled = true;
        throw new Error("Status-only updates should not rebuild recurring repeat metadata.");
      },
      updateAppointmentSchedulesByIds: async (payload) => {
        updatedIds.push(...payload.ids);
        return payload.ids.map((id) => ({
          id: String(id),
          specialistId: "7",
          clientId: "44",
          appointmentDate: id === 92 ? "2026-03-16" : "2026-03-23",
          startTime: "09:00",
          endTime: "10:00",
          status: "pending"
        }));
      }
    })
  );

  const route = findRoute(recorder.routes, "PATCH", "/schedules/:id");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest({ features: ["appointments.planner"] }),
      params: { id: "92" },
      query: { scope: "future" },
      body: {
        specialistId: "7",
        clientId: "44",
        appointmentDate: "2026-03-16",
        startTime: "09:00",
        endTime: "10:00",
        durationMinutes: "60",
        service: "Lesson",
        status: "pending",
        note: "",
        repeat: {
          enabled: true,
          untilDate: "2026-03-30",
          dayKeys: ["mon"]
        }
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 200);
  assert.equal(repeatMetaUpdateCalled, false);
  assert.deepEqual(updatedIds, [92, 93]);
  assert.equal(reply.state.payload?.summary?.scope, "future");
  assert.equal(reply.state.payload?.summary?.affectedCount, 2);
});

test("schedule update recurring future status-only edits apply to every weekday in the series", async () => {
  const updatedIds = [];
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      parseDateYmdToUtcDate: (value) => new Date(`${String(value || "").trim()}T00:00:00.000Z`),
      toDayKeyFromUtcDate: (date) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][date.getUTCDay()] || "",
      validateSlotAgainstWorkingHours: () => ({
        field: "startTime",
        message: "Selected time is outside working hours."
      }),
      getAppointmentScheduleTargetsByScope: async () => ({
        anchorId: 92,
        anchorAppointmentDate: "2026-03-16",
        repeatGroupKey: "old-group",
        repeatUntilDate: "2026-03-30",
        repeatAnchorDate: "2026-03-09",
        repeatDays: ["mon", "wed"],
        isRecurring: true,
        scope: "future",
        items: [
          { id: 92, specialistId: 7, clientId: 44, appointmentDate: "2026-03-16", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "no-show", note: "", isVip: false },
          { id: 96, specialistId: 7, clientId: 44, appointmentDate: "2026-03-18", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "no-show", note: "", isVip: false },
          { id: 95, specialistId: 7, clientId: 44, appointmentDate: "2026-03-23", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "no-show", note: "", isVip: false },
          { id: 98, specialistId: 7, clientId: 44, appointmentDate: "2026-03-25", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "no-show", note: "", isVip: false }
        ],
        seriesItems: [
          { id: 91, specialistId: 7, clientId: 44, appointmentDate: "2026-03-09", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "no-show", note: "", isVip: false },
          { id: 93, specialistId: 7, clientId: 44, appointmentDate: "2026-03-11", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "no-show", note: "", isVip: false },
          { id: 92, specialistId: 7, clientId: 44, appointmentDate: "2026-03-16", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "no-show", note: "", isVip: false },
          { id: 96, specialistId: 7, clientId: 44, appointmentDate: "2026-03-18", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "no-show", note: "", isVip: false },
          { id: 95, specialistId: 7, clientId: 44, appointmentDate: "2026-03-23", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "no-show", note: "", isVip: false },
          { id: 98, specialistId: 7, clientId: 44, appointmentDate: "2026-03-25", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "no-show", note: "", isVip: false }
        ]
      }),
      updateAppointmentScheduleByIdWithRepeatMeta: async () => {
        throw new Error("Status-only updates should not rebuild recurring repeat metadata.");
      },
      updateAppointmentSchedulesByIds: async (payload) => {
        updatedIds.push(...payload.ids);
        return payload.ids.map((id) => ({
          id: String(id),
          specialistId: "7",
          clientId: "44",
          appointmentDate: id === 92 ? "2026-03-16" : "2026-03-23",
          startTime: "09:00",
          endTime: "10:00",
          status: "pending"
        }));
      }
    })
  );

  const route = findRoute(recorder.routes, "PATCH", "/schedules/:id");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest({ features: ["appointments.planner"] }),
      params: { id: "92" },
      query: { scope: "future" },
      body: {
        specialistId: "7",
        clientId: "44",
        appointmentDate: "2026-03-16",
        startTime: "09:00",
        endTime: "10:00",
        durationMinutes: "60",
        service: "Lesson",
        status: "pending",
        note: "",
        repeat: {
          enabled: true,
          untilDate: "2026-03-30",
          dayKeys: ["mon", "wed"]
        }
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 200);
  assert.deepEqual(updatedIds, [92, 96, 95, 98]);
  assert.equal(reply.state.payload?.summary?.affectedCount, 4);
});

test("schedule update maps invalid repeat cast errors to invalid appointment data", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      getAppointmentScheduleTargetsByScope: async () => ({
        anchorId: 91,
        anchorAppointmentDate: "2026-03-09",
        repeatGroupKey: "",
        isRecurring: false,
        scope: "single",
        items: [
          {
            id: 91,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-09",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          }
        ]
      }),
      updateAppointmentSchedulesByIds: async () => {
        const error = new Error("invalid input syntax for type uuid");
        error.code = "22P02";
        throw error;
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
        appointmentDate: "2026-03-10",
        startTime: "10:30",
        endTime: "11:30",
        durationMinutes: "60",
        service: "Lesson",
        status: "pending",
        note: ""
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 400);
  assert.equal(reply.state.payload?.message, "Invalid appointment data.");
});

test("schedule update returns migration-required when appointment status history schema is missing", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      getAppointmentScheduleTargetsByScope: async () => ({
        anchorId: 91,
        anchorAppointmentDate: "2026-03-09",
        repeatGroupKey: "",
        isRecurring: false,
        scope: "single",
        items: [
          {
            id: 91,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-09",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          }
        ]
      }),
      updateAppointmentSchedulesByIds: async () => {
        const error = new Error("Appointment status history migration is required.");
        error.code = "MIGRATION_REQUIRED";
        error.details = {
          missingTables: ["appointment_status_history"]
        };
        throw error;
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
        appointmentDate: "2026-03-10",
        startTime: "10:30",
        endTime: "11:30",
        durationMinutes: "60",
        service: "Lesson",
        status: "pending",
        note: ""
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 409);
  assert.equal(reply.state.payload?.code, "MIGRATION_REQUIRED");
  assert.deepEqual(reply.state.payload?.details?.missingTables, ["appointment_status_history"]);
});

test("schedule update reconciles recurring all-scope edits without falling back to bulk update", async () => {
  const deletedIds = [];
  const updatedIds = [];
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      buildWeeklyRecurringDates: () => ["2026-03-09"],
      getAppointmentScheduleTargetsByScope: async () => ({
        anchorId: 91,
        anchorAppointmentDate: "2026-03-09",
        repeatGroupKey: "old-group",
        repeatAnchorDate: "2026-03-09",
        repeatDays: ["mon", "wed"],
        isRecurring: true,
        scope: "all",
        items: [
          {
            id: 91,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-09",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          },
          {
            id: 92,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-11",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          }
        ],
        seriesItems: [
          {
            id: 91,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-09",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          },
          {
            id: 92,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-11",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          }
        ]
      }),
      updateAppointmentScheduleByIdWithRepeatMeta: async (payload) => {
        updatedIds.push(payload.id);
        return {
          id: String(payload.id),
          specialistId: String(payload.specialistId),
          clientId: String(payload.clientId),
          appointmentDate: payload.appointmentDate,
          startTime: payload.startTime,
          endTime: payload.endTime
        };
      },
      deleteAppointmentSchedulesByIds: async ({ ids }) => {
        deletedIds.push(...ids);
        return ids.length;
      },
      updateAppointmentSchedulesByIds: async () => {
        throw new Error("Recurring series edits should not use the generic bulk update helper.");
      },
      createAppointmentSchedule: async () => {
        throw new Error("No new dates should be created in this reconcile case.");
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
      query: { scope: "all" },
      body: {
        specialistId: "7",
        clientId: "44",
        appointmentDate: "2026-03-09",
        startTime: "09:30",
        endTime: "10:30",
        durationMinutes: "60",
        service: "Lesson",
        status: "pending",
        note: "",
        repeat: {
          enabled: true,
          untilDate: "2026-03-30",
          dayKeys: ["mon"]
        }
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 200);
  assert.deepEqual(updatedIds, [91]);
  assert.deepEqual(deletedIds, [92]);
  assert.equal(reply.state.payload?.summary?.scope, "all");
  assert.equal(reply.state.payload?.summary?.affectedCount, 1);
});

test("schedule update splits recurring future edits into a new series and truncates the past slice", async () => {
  const updateCalls = [];
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      randomUUID: () => "22222222-2222-2222-2222-222222222222",
      parseDateYmdToUtcDate: (value) => new Date(`${String(value || "").trim()}T00:00:00.000Z`),
      buildWeeklyRecurringDates: () => ["2026-03-16", "2026-03-23"],
      getAppointmentScheduleTargetsByScope: async () => ({
        anchorId: 92,
        anchorAppointmentDate: "2026-03-16",
        repeatGroupKey: "old-group",
        repeatAnchorDate: "2026-03-09",
        repeatDays: ["mon"],
        isRecurring: true,
        scope: "future",
        items: [
          {
            id: 92,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-16",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          },
          {
            id: 93,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-23",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          }
        ],
        seriesItems: [
          {
            id: 91,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-09",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          },
          {
            id: 92,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-16",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          },
          {
            id: 93,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-23",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          }
        ]
      }),
      updateAppointmentScheduleByIdWithRepeatMeta: async (payload) => {
        updateCalls.push(payload);
        return {
          id: String(payload.id),
          specialistId: String(payload.specialistId),
          clientId: String(payload.clientId),
          appointmentDate: payload.appointmentDate,
          startTime: payload.startTime,
          endTime: payload.endTime
        };
      },
      updateAppointmentSchedulesByIds: async () => {
        throw new Error("Recurring future edits should not use the generic bulk update helper.");
      }
    })
  );

  const route = findRoute(recorder.routes, "PATCH", "/schedules/:id");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest({ features: ["appointments.planner"] }),
      params: { id: "92" },
      query: { scope: "future" },
      body: {
        specialistId: "7",
        clientId: "44",
        appointmentDate: "2026-03-16",
        startTime: "09:30",
        endTime: "10:30",
        durationMinutes: "60",
        service: "Lesson",
        status: "pending",
        note: "",
        repeat: {
          enabled: true,
          untilDate: "2026-03-30",
          dayKeys: ["mon"]
        }
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 200);
  assert.equal(updateCalls.length, 3);
  assert.deepEqual(
    updateCalls.map((item) => ({
      id: item.id,
      repeatGroupKey: item.repeatGroupKey,
      repeatUntilDate: item.repeatUntilDate,
      repeatAnchorDate: item.repeatAnchorDate,
      isRepeatRoot: item.isRepeatRoot,
      isAutoRollingRepeat: item.isAutoRollingRepeat
    })),
    [
      {
        id: 91,
        repeatGroupKey: "old-group",
        repeatUntilDate: "2026-03-15",
        repeatAnchorDate: "2026-03-09",
        isRepeatRoot: true,
        isAutoRollingRepeat: false
      },
      {
        id: 92,
        repeatGroupKey: "22222222-2222-2222-2222-222222222222",
        repeatUntilDate: "2026-03-30",
        repeatAnchorDate: "2026-03-16",
        isRepeatRoot: true,
        isAutoRollingRepeat: false
      },
      {
        id: 93,
        repeatGroupKey: "22222222-2222-2222-2222-222222222222",
        repeatUntilDate: "2026-03-30",
        repeatAnchorDate: "2026-03-16",
        isRepeatRoot: false,
        isAutoRollingRepeat: false
      }
    ]
  );
  assert.equal(reply.state.payload?.summary?.scope, "future");
  assert.equal(reply.state.payload?.summary?.affectedCount, 2);
});

test("schedule update detaches a single recurring occurrence without deleting the rest of the series", async () => {
  const detachedCalls = [];
  const repeatMetaCalls = [];
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      getAppointmentScheduleTargetsByScope: async () => ({
        anchorId: 91,
        anchorAppointmentDate: "2026-03-09",
        repeatGroupKey: "old-group",
        repeatUntilDate: "2026-03-30",
        repeatAnchorDate: "2026-03-09",
        repeatDays: ["mon", "wed", "fri"],
        isAutoRollingRepeat: false,
        isRecurring: true,
        scope: "single",
        items: [
          {
            id: 91,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-09",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isRepeatRoot: true,
            isVip: false
          }
        ],
        seriesItems: [
          {
            id: 91,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-09",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isRepeatRoot: true,
            isVip: false
          },
          {
            id: 92,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-11",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isRepeatRoot: false,
            isVip: false
          },
          {
            id: 93,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-13",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isRepeatRoot: false,
            isVip: false
          }
        ]
      }),
      updateAppointmentSchedulesByIds: async (payload) => {
        detachedCalls.push(payload);
        return [{
          id: "91",
          specialistId: String(payload.specialistId),
          clientId: String(payload.clientId),
          appointmentDate: payload.appointmentDate,
          startTime: payload.startTime,
          endTime: payload.endTime
        }];
      },
      updateAppointmentScheduleByIdWithRepeatMeta: async (payload) => {
        repeatMetaCalls.push(payload);
        return {
          id: String(payload.id),
          specialistId: String(payload.specialistId),
          clientId: String(payload.clientId),
          appointmentDate: payload.appointmentDate,
          startTime: payload.startTime,
          endTime: payload.endTime
        };
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
        appointmentDate: "2026-03-10",
        startTime: "10:30",
        endTime: "11:30",
        durationMinutes: "60",
        service: "Lesson",
        status: "pending",
        note: ""
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 200);
  assert.equal(detachedCalls.length, 1);
  assert.equal(detachedCalls[0]?.clearRepeatMeta, true);
  assert.deepEqual(detachedCalls[0]?.ids, [91]);
  assert.deepEqual(
    repeatMetaCalls.map((item) => ({
      id: item.id,
      repeatGroupKey: item.repeatGroupKey,
      repeatAnchorDate: item.repeatAnchorDate,
      isRepeatRoot: item.isRepeatRoot
    })),
    [
      {
        id: 92,
        repeatGroupKey: "old-group",
        repeatAnchorDate: "2026-03-11",
        isRepeatRoot: true
      },
      {
        id: 93,
        repeatGroupKey: "old-group",
        repeatAnchorDate: "2026-03-11",
        isRepeatRoot: false
      }
    ]
  );
  assert.equal(reply.state.payload?.summary?.scope, "single");
  assert.equal(reply.state.payload?.summary?.affectedCount, 1);
});

test("schedule update detaches a single recurring occurrence even when repeat meta needs fallback values", async () => {
  const repeatMetaCalls = [];
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      randomUUID: () => "77777777-7777-7777-7777-777777777777",
      parseDateYmdToUtcDate: (value) => new Date(`${String(value || "").trim()}T00:00:00.000Z`),
      toDayKeyFromUtcDate: (value) => {
        const dayKeyByWeekday = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
        return dayKeyByWeekday[value.getUTCDay()] || "";
      },
      toAppointmentDayNum: (value) => ({
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6,
        sun: 7
      })[String(value || "").trim().toLowerCase()] || 0,
      getAppointmentScheduleTargetsByScope: async () => ({
        anchorId: 91,
        anchorAppointmentDate: "2026-03-09",
        repeatGroupKey: "",
        repeatUntilDate: "",
        repeatAnchorDate: "",
        repeatDays: [],
        isAutoRollingRepeat: false,
        isRecurring: true,
        scope: "single",
        items: [
          {
            id: 91,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-09",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isRepeatRoot: true,
            isVip: false
          }
        ],
        seriesItems: [
          {
            id: 91,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-09",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isRepeatRoot: true,
            isVip: false
          },
          {
            id: 92,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-11",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isRepeatRoot: false,
            isVip: false
          },
          {
            id: 93,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-13",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isRepeatRoot: false,
            isVip: false
          }
        ]
      }),
      updateAppointmentSchedulesByIds: async () => ([{
        id: "91",
        specialistId: "7",
        clientId: "44",
        appointmentDate: "2026-03-10",
        startTime: "10:30",
        endTime: "11:30"
      }]),
      updateAppointmentScheduleByIdWithRepeatMeta: async (payload) => {
        repeatMetaCalls.push(payload);
        return {
          id: String(payload.id),
          appointmentDate: payload.appointmentDate
        };
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
        appointmentDate: "2026-03-10",
        startTime: "10:30",
        endTime: "11:30",
        durationMinutes: "60",
        service: "Lesson",
        status: "pending",
        note: ""
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 200);
  assert.deepEqual(
    repeatMetaCalls.map((item) => ({
      id: item.id,
      repeatGroupKey: item.repeatGroupKey,
      repeatUntilDate: item.repeatUntilDate,
      repeatAnchorDate: item.repeatAnchorDate,
      repeatDays: item.repeatDays,
      isRepeatRoot: item.isRepeatRoot
    })),
    [
      {
        id: 92,
        repeatGroupKey: "77777777-7777-7777-7777-777777777777",
        repeatUntilDate: "2026-03-13",
        repeatAnchorDate: "2026-03-11",
        repeatDays: [3, 5],
        isRepeatRoot: true
      },
      {
        id: 93,
        repeatGroupKey: "77777777-7777-7777-7777-777777777777",
        repeatUntilDate: "2026-03-13",
        repeatAnchorDate: "2026-03-11",
        repeatDays: [3, 5],
        isRepeatRoot: false
      }
    ]
  );
});

test("schedule update splits a selected weekday branch into a new recurring future series", async () => {
  const deletedIds = [];
  const updateCalls = [];
  const createCalls = [];
  const uuidValues = [
    "33333333-3333-3333-3333-333333333333",
    "44444444-4444-4444-4444-444444444444"
  ];
  const dayKeyByWeekday = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      randomUUID: () => uuidValues.shift() || "55555555-5555-5555-5555-555555555555",
      parseDateYmdToUtcDate: (value) => new Date(`${String(value || "").trim()}T00:00:00.000Z`),
      toDayKeyFromUtcDate: (value) => dayKeyByWeekday[value.getUTCDay()] || "",
      toAppointmentDayNum: (value) => ({
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6,
        sun: 7
      }[String(value || "").trim().toLowerCase()] || 0),
      buildWeeklyRecurringDates: () => ["2026-03-17", "2026-03-24"],
      getAppointmentScheduleTargetsByScope: async () => ({
        anchorId: 92,
        anchorAppointmentDate: "2026-03-16",
        repeatGroupKey: "old-group",
        repeatUntilDate: "2026-03-30",
        repeatAnchorDate: "2026-03-09",
        repeatDays: ["mon", "wed", "fri"],
        isAutoRollingRepeat: false,
        isRecurring: true,
        scope: "future",
        items: [
          {
            id: 92,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-16",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          },
          {
            id: 96,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-18",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          },
          {
            id: 97,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-20",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          },
          {
            id: 95,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-23",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          },
          {
            id: 98,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-25",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          },
          {
            id: 99,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-27",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          }
        ],
        seriesItems: [
          {
            id: 91,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-09",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          },
          {
            id: 93,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-11",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          },
          {
            id: 94,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-13",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          },
          {
            id: 92,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-16",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          },
          {
            id: 96,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-18",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          },
          {
            id: 97,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-20",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          },
          {
            id: 95,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-23",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          },
          {
            id: 98,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-25",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          },
          {
            id: 99,
            specialistId: 7,
            clientId: 44,
            appointmentDate: "2026-03-27",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            serviceName: "Lesson",
            status: "pending",
            note: "",
            isVip: false
          }
        ]
      }),
      updateAppointmentScheduleByIdWithRepeatMeta: async (payload) => {
        updateCalls.push(payload);
        return {
          id: String(payload.id),
          specialistId: String(payload.specialistId),
          clientId: String(payload.clientId),
          appointmentDate: payload.appointmentDate,
          startTime: payload.startTime,
          endTime: payload.endTime
        };
      },
      deleteAppointmentSchedulesByIds: async ({ ids }) => {
        deletedIds.push(...ids);
        return ids.length;
      },
      createAppointmentSchedule: async (payload) => {
        createCalls.push(payload);
        return {
          id: String(createCalls.length + 200),
          specialistId: String(payload.specialistId),
          clientId: String(payload.clientId),
          appointmentDate: payload.appointmentDate,
          startTime: payload.startTime,
          endTime: payload.endTime
        };
      },
      updateAppointmentSchedulesByIds: async () => {
        throw new Error("Multi-day recurring weekday splits should not use the generic bulk update helper.");
      }
    })
  );

  const route = findRoute(recorder.routes, "PATCH", "/schedules/:id");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest({ features: ["appointments.planner"] }),
      params: { id: "92" },
      query: { scope: "future" },
      body: {
        specialistId: "7",
        clientId: "44",
        appointmentDate: "2026-03-17",
        startTime: "10:30",
        endTime: "11:30",
        durationMinutes: "60",
        service: "Lesson",
        status: "pending",
        note: "",
        repeat: {
          enabled: true,
          untilDate: "2026-03-30",
          dayKeys: ["tue"]
        }
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 200);
  assert.deepEqual(deletedIds, [92, 95]);
  assert.deepEqual(
    updateCalls.map((item) => ({
      id: item.id,
      repeatGroupKey: item.repeatGroupKey,
      repeatUntilDate: item.repeatUntilDate,
      repeatAnchorDate: item.repeatAnchorDate,
      isRepeatRoot: item.isRepeatRoot
    })),
    [
      {
        id: 91,
        repeatGroupKey: "old-group",
        repeatUntilDate: "2026-03-15",
        repeatAnchorDate: "2026-03-09",
        isRepeatRoot: true
      },
      {
        id: 93,
        repeatGroupKey: "old-group",
        repeatUntilDate: "2026-03-15",
        repeatAnchorDate: "2026-03-09",
        isRepeatRoot: false
      },
      {
        id: 94,
        repeatGroupKey: "old-group",
        repeatUntilDate: "2026-03-15",
        repeatAnchorDate: "2026-03-09",
        isRepeatRoot: false
      },
      {
        id: 96,
        repeatGroupKey: "33333333-3333-3333-3333-333333333333",
        repeatUntilDate: "2026-03-30",
        repeatAnchorDate: "2026-03-18",
        isRepeatRoot: true
      },
      {
        id: 97,
        repeatGroupKey: "33333333-3333-3333-3333-333333333333",
        repeatUntilDate: "2026-03-30",
        repeatAnchorDate: "2026-03-18",
        isRepeatRoot: false
      },
      {
        id: 98,
        repeatGroupKey: "33333333-3333-3333-3333-333333333333",
        repeatUntilDate: "2026-03-30",
        repeatAnchorDate: "2026-03-18",
        isRepeatRoot: false
      },
      {
        id: 99,
        repeatGroupKey: "33333333-3333-3333-3333-333333333333",
        repeatUntilDate: "2026-03-30",
        repeatAnchorDate: "2026-03-18",
        isRepeatRoot: false
      }
    ]
  );
  assert.deepEqual(
    createCalls.map((item) => ({
      appointmentDate: item.appointmentDate,
      repeatGroupKey: item.repeatGroupKey,
      repeatAnchorDate: item.repeatAnchorDate,
      repeatDays: item.repeatDays
    })),
    [
      {
        appointmentDate: "2026-03-17",
        repeatGroupKey: "44444444-4444-4444-4444-444444444444",
        repeatAnchorDate: "2026-03-17",
        repeatDays: [2]
      },
      {
        appointmentDate: "2026-03-24",
        repeatGroupKey: "44444444-4444-4444-4444-444444444444",
        repeatAnchorDate: "2026-03-17",
        repeatDays: [2]
      }
    ]
  );
  assert.equal(reply.state.payload?.summary?.scope, "future");
  assert.equal(reply.state.payload?.summary?.affectedCount, 2);
});

test("schedule update future scope applies all original weekdays when repeat payload keeps the original multi-day pattern", async () => {
  const updateCalls = [];
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      randomUUID: () => "66666666-6666-6666-6666-666666666666",
      parseDateYmdToUtcDate: (value) => new Date(`${String(value || "").trim()}T00:00:00.000Z`),
      toDayKeyFromUtcDate: (value) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][value.getUTCDay()] || "",
      toAppointmentDayNum: (value) => ({
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6,
        sun: 7
      }[String(value || "").trim().toLowerCase()] || 0),
      buildWeeklyRecurringDates: () => [
        "2026-03-16",
        "2026-03-18",
        "2026-03-20",
        "2026-03-23",
        "2026-03-25",
        "2026-03-27"
      ],
      getAppointmentScheduleTargetsByScope: async () => ({
        anchorId: 92,
        anchorAppointmentDate: "2026-03-16",
        repeatGroupKey: "old-group",
        repeatUntilDate: "2026-03-30",
        repeatAnchorDate: "2026-03-09",
        repeatDays: ["mon", "wed", "fri"],
        isAutoRollingRepeat: false,
        isRecurring: true,
        scope: "future",
        items: [
          { id: 92, specialistId: 7, clientId: 44, appointmentDate: "2026-03-16", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 96, specialistId: 7, clientId: 44, appointmentDate: "2026-03-18", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 97, specialistId: 7, clientId: 44, appointmentDate: "2026-03-20", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 95, specialistId: 7, clientId: 44, appointmentDate: "2026-03-23", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 98, specialistId: 7, clientId: 44, appointmentDate: "2026-03-25", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 99, specialistId: 7, clientId: 44, appointmentDate: "2026-03-27", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false }
        ],
        seriesItems: [
          { id: 91, specialistId: 7, clientId: 44, appointmentDate: "2026-03-09", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 93, specialistId: 7, clientId: 44, appointmentDate: "2026-03-11", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 94, specialistId: 7, clientId: 44, appointmentDate: "2026-03-13", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 92, specialistId: 7, clientId: 44, appointmentDate: "2026-03-16", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 96, specialistId: 7, clientId: 44, appointmentDate: "2026-03-18", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 97, specialistId: 7, clientId: 44, appointmentDate: "2026-03-20", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 95, specialistId: 7, clientId: 44, appointmentDate: "2026-03-23", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 98, specialistId: 7, clientId: 44, appointmentDate: "2026-03-25", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 99, specialistId: 7, clientId: 44, appointmentDate: "2026-03-27", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false }
        ]
      }),
      updateAppointmentScheduleByIdWithRepeatMeta: async (payload) => {
        updateCalls.push(payload);
        return {
          id: String(payload.id),
          specialistId: String(payload.specialistId),
          clientId: String(payload.clientId),
          appointmentDate: payload.appointmentDate,
          startTime: payload.startTime,
          endTime: payload.endTime
        };
      },
      createAppointmentSchedule: async () => {
        throw new Error("No new dates should be created when the selected weekday branch stays on the same weekday.");
      },
      deleteAppointmentSchedulesByIds: async () => 0,
      updateAppointmentSchedulesByIds: async () => {
        throw new Error("Multi-day future edits must not fall back to the generic bulk update helper.");
      }
    })
  );

  const route = findRoute(recorder.routes, "PATCH", "/schedules/:id");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest({ features: ["appointments.planner"] }),
      params: { id: "92" },
      query: { scope: "future" },
      body: {
        specialistId: "7",
        clientId: "44",
        appointmentDate: "2026-03-16",
        startTime: "10:30",
        endTime: "11:30",
        durationMinutes: "60",
        service: "Lesson",
        status: "pending",
        note: "",
        repeat: {
          enabled: true,
          untilDate: "2026-03-30",
          dayKeys: ["mon", "wed", "fri"]
        }
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 200);
  assert.deepEqual(
    updateCalls.map((item) => ({
      id: item.id,
      startTime: item.startTime,
      endTime: item.endTime,
      repeatGroupKey: item.repeatGroupKey
    })),
    [
      { id: 91, startTime: "09:00", endTime: "10:00", repeatGroupKey: "old-group" },
      { id: 93, startTime: "09:00", endTime: "10:00", repeatGroupKey: "old-group" },
      { id: 94, startTime: "09:00", endTime: "10:00", repeatGroupKey: "old-group" },
      { id: 92, startTime: "10:30", endTime: "11:30", repeatGroupKey: "66666666-6666-6666-6666-666666666666" },
      { id: 96, startTime: "10:30", endTime: "11:30", repeatGroupKey: "66666666-6666-6666-6666-666666666666" },
      { id: 97, startTime: "10:30", endTime: "11:30", repeatGroupKey: "66666666-6666-6666-6666-666666666666" },
      { id: 95, startTime: "10:30", endTime: "11:30", repeatGroupKey: "66666666-6666-6666-6666-666666666666" },
      { id: 98, startTime: "10:30", endTime: "11:30", repeatGroupKey: "66666666-6666-6666-6666-666666666666" },
      { id: 99, startTime: "10:30", endTime: "11:30", repeatGroupKey: "66666666-6666-6666-6666-666666666666" }
    ]
  );
});

test("schedule update future scope with multiple selected weekdays reuses existing dates without creating duplicates", async () => {
  const deletedIds = [];
  const updateCalls = [];
  const createCalls = [];
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      randomUUID: () => "77777777-7777-7777-7777-777777777777",
      parseDateYmdToUtcDate: (value) => new Date(`${String(value || "").trim()}T00:00:00.000Z`),
      toDayKeyFromUtcDate: (value) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][value.getUTCDay()] || "",
      toAppointmentDayNum: (value) => ({
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6,
        sun: 7
      }[String(value || "").trim().toLowerCase()] || 0),
      buildWeeklyRecurringDates: () => ["2026-03-16", "2026-03-18", "2026-03-23", "2026-03-25"],
      getAppointmentScheduleTargetsByScope: async () => ({
        anchorId: 92,
        anchorAppointmentDate: "2026-03-16",
        repeatGroupKey: "old-group",
        repeatUntilDate: "2026-03-30",
        repeatAnchorDate: "2026-03-09",
        repeatDays: ["mon", "wed", "fri"],
        isAutoRollingRepeat: false,
        isRecurring: true,
        scope: "future",
        items: [
          { id: 92, specialistId: 7, clientId: 44, appointmentDate: "2026-03-16", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 96, specialistId: 7, clientId: 44, appointmentDate: "2026-03-18", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 97, specialistId: 7, clientId: 44, appointmentDate: "2026-03-20", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 95, specialistId: 7, clientId: 44, appointmentDate: "2026-03-23", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 98, specialistId: 7, clientId: 44, appointmentDate: "2026-03-25", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 99, specialistId: 7, clientId: 44, appointmentDate: "2026-03-27", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false }
        ],
        seriesItems: [
          { id: 91, specialistId: 7, clientId: 44, appointmentDate: "2026-03-09", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 93, specialistId: 7, clientId: 44, appointmentDate: "2026-03-11", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 94, specialistId: 7, clientId: 44, appointmentDate: "2026-03-13", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 92, specialistId: 7, clientId: 44, appointmentDate: "2026-03-16", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 96, specialistId: 7, clientId: 44, appointmentDate: "2026-03-18", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 97, specialistId: 7, clientId: 44, appointmentDate: "2026-03-20", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 95, specialistId: 7, clientId: 44, appointmentDate: "2026-03-23", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 98, specialistId: 7, clientId: 44, appointmentDate: "2026-03-25", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 99, specialistId: 7, clientId: 44, appointmentDate: "2026-03-27", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false }
        ]
      }),
      updateAppointmentScheduleByIdWithRepeatMeta: async (payload) => {
        updateCalls.push(payload);
        return {
          id: String(payload.id),
          specialistId: String(payload.specialistId),
          clientId: String(payload.clientId),
          appointmentDate: payload.appointmentDate,
          startTime: payload.startTime,
          endTime: payload.endTime
        };
      },
      createAppointmentSchedule: async (payload) => {
        createCalls.push(payload);
        return {
          id: 1200 + createCalls.length,
          specialistId: String(payload.specialistId),
          clientId: String(payload.clientId),
          appointmentDate: payload.appointmentDate,
          startTime: payload.startTime,
          endTime: payload.endTime
        };
      },
      deleteAppointmentSchedulesByIds: async ({ ids }) => {
        deletedIds.push(...ids);
        return ids.length;
      },
      updateAppointmentSchedulesByIds: async () => {
        throw new Error("Multi-day future edits must not fall back to the generic bulk update helper.");
      }
    })
  );

  const route = findRoute(recorder.routes, "PATCH", "/schedules/:id");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest({ features: ["appointments.planner"] }),
      params: { id: "92" },
      query: { scope: "future" },
      body: {
        specialistId: "7",
        clientId: "44",
        appointmentDate: "2026-03-16",
        startTime: "10:30",
        endTime: "11:30",
        durationMinutes: "60",
        service: "Lesson",
        status: "pending",
        note: "",
        repeat: {
          enabled: true,
          untilDate: "2026-03-30",
          dayKeys: ["mon", "wed"]
        }
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 200);
  assert.deepEqual(deletedIds, [97, 99]);
  assert.equal(createCalls.length, 0);
  assert.deepEqual(
    updateCalls.map((item) => ({
      id: item.id,
      startTime: item.startTime,
      endTime: item.endTime,
      repeatGroupKey: item.repeatGroupKey
    })),
    [
      { id: 91, startTime: "09:00", endTime: "10:00", repeatGroupKey: "old-group" },
      { id: 93, startTime: "09:00", endTime: "10:00", repeatGroupKey: "old-group" },
      { id: 94, startTime: "09:00", endTime: "10:00", repeatGroupKey: "old-group" },
      { id: 92, startTime: "10:30", endTime: "11:30", repeatGroupKey: "77777777-7777-7777-7777-777777777777" },
      { id: 96, startTime: "10:30", endTime: "11:30", repeatGroupKey: "77777777-7777-7777-7777-777777777777" },
      { id: 95, startTime: "10:30", endTime: "11:30", repeatGroupKey: "77777777-7777-7777-7777-777777777777" },
      { id: 98, startTime: "10:30", endTime: "11:30", repeatGroupKey: "77777777-7777-7777-7777-777777777777" }
    ]
  );
});

test("schedule delete future scope removes only the selected weekday branch from a multi-day recurring series", async () => {
  const deletedIds = [];
  const updateCalls = [];
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      randomUUID: () => "77777777-7777-7777-7777-777777777777",
      parseDateYmdToUtcDate: (value) => new Date(`${String(value || "").trim()}T00:00:00.000Z`),
      toDayKeyFromUtcDate: (value) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][value.getUTCDay()] || "",
      toAppointmentDayNum: (value) => ({
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6,
        sun: 7
      }[String(value || "").trim().toLowerCase()] || 0),
      getAppointmentScheduleTargetsByScope: async () => ({
        anchorId: 92,
        anchorAppointmentDate: "2026-03-16",
        repeatGroupKey: "old-group",
        repeatUntilDate: "2026-03-30",
        repeatAnchorDate: "2026-03-09",
        repeatDays: ["mon", "wed", "fri"],
        isAutoRollingRepeat: false,
        isRecurring: true,
        scope: "future",
        items: [
          { id: 92, specialistId: 7, clientId: 44, appointmentDate: "2026-03-16", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 96, specialistId: 7, clientId: 44, appointmentDate: "2026-03-18", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 97, specialistId: 7, clientId: 44, appointmentDate: "2026-03-20", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 95, specialistId: 7, clientId: 44, appointmentDate: "2026-03-23", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 98, specialistId: 7, clientId: 44, appointmentDate: "2026-03-25", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 99, specialistId: 7, clientId: 44, appointmentDate: "2026-03-27", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false }
        ],
        seriesItems: [
          { id: 91, specialistId: 7, clientId: 44, appointmentDate: "2026-03-09", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 93, specialistId: 7, clientId: 44, appointmentDate: "2026-03-11", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 94, specialistId: 7, clientId: 44, appointmentDate: "2026-03-13", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 92, specialistId: 7, clientId: 44, appointmentDate: "2026-03-16", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 96, specialistId: 7, clientId: 44, appointmentDate: "2026-03-18", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 97, specialistId: 7, clientId: 44, appointmentDate: "2026-03-20", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 95, specialistId: 7, clientId: 44, appointmentDate: "2026-03-23", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 98, specialistId: 7, clientId: 44, appointmentDate: "2026-03-25", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 99, specialistId: 7, clientId: 44, appointmentDate: "2026-03-27", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false }
        ]
      }),
      updateAppointmentScheduleByIdWithRepeatMeta: async (payload) => {
        updateCalls.push(payload);
        return {
          id: String(payload.id),
          specialistId: String(payload.specialistId),
          clientId: String(payload.clientId),
          appointmentDate: payload.appointmentDate,
          startTime: payload.startTime,
          endTime: payload.endTime
        };
      },
      deleteAppointmentSchedulesByIds: async ({ ids }) => {
        deletedIds.push(...ids);
        return ids.length;
      }
    })
  );

  const route = findRoute(recorder.routes, "DELETE", "/schedules/:id");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest({ features: ["appointments.planner"] }),
      params: { id: "92" },
      query: { scope: "future" }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 200);
  assert.deepEqual(deletedIds, [92, 95]);
  assert.deepEqual(
    updateCalls.map((item) => ({
      id: item.id,
      repeatGroupKey: item.repeatGroupKey,
      repeatUntilDate: item.repeatUntilDate,
      repeatAnchorDate: item.repeatAnchorDate
    })),
    [
      { id: 91, repeatGroupKey: "old-group", repeatUntilDate: "2026-03-15", repeatAnchorDate: "2026-03-09" },
      { id: 93, repeatGroupKey: "old-group", repeatUntilDate: "2026-03-15", repeatAnchorDate: "2026-03-09" },
      { id: 94, repeatGroupKey: "old-group", repeatUntilDate: "2026-03-15", repeatAnchorDate: "2026-03-09" },
      { id: 96, repeatGroupKey: "77777777-7777-7777-7777-777777777777", repeatUntilDate: "2026-03-30", repeatAnchorDate: "2026-03-18" },
      { id: 97, repeatGroupKey: "77777777-7777-7777-7777-777777777777", repeatUntilDate: "2026-03-30", repeatAnchorDate: "2026-03-18" },
      { id: 98, repeatGroupKey: "77777777-7777-7777-7777-777777777777", repeatUntilDate: "2026-03-30", repeatAnchorDate: "2026-03-18" },
      { id: 99, repeatGroupKey: "77777777-7777-7777-7777-777777777777", repeatUntilDate: "2026-03-30", repeatAnchorDate: "2026-03-18" }
    ]
  );
  assert.equal(reply.state.payload?.summary?.scope, "future");
  assert.equal(reply.state.payload?.summary?.deletedCount, 2);
});

test("schedule delete future scope respects explicitly selected weekday branches", async () => {
  const deletedIds = [];
  const updateCalls = [];
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      randomUUID: () => "88888888-8888-8888-8888-888888888888",
      parseDateYmdToUtcDate: (value) => new Date(`${String(value || "").trim()}T00:00:00.000Z`),
      toDayKeyFromUtcDate: (value) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][value.getUTCDay()] || "",
      toAppointmentDayNum: (value) => ({
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6,
        sun: 7
      }[String(value || "").trim().toLowerCase()] || 0),
      getAppointmentScheduleTargetsByScope: async () => ({
        anchorId: 92,
        anchorAppointmentDate: "2026-03-16",
        repeatGroupKey: "old-group",
        repeatUntilDate: "2026-03-30",
        repeatAnchorDate: "2026-03-09",
        repeatDays: ["mon", "wed", "fri"],
        isAutoRollingRepeat: false,
        isRecurring: true,
        scope: "future",
        items: [
          { id: 92, specialistId: 7, clientId: 44, appointmentDate: "2026-03-16", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 96, specialistId: 7, clientId: 44, appointmentDate: "2026-03-18", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 97, specialistId: 7, clientId: 44, appointmentDate: "2026-03-20", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 95, specialistId: 7, clientId: 44, appointmentDate: "2026-03-23", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 98, specialistId: 7, clientId: 44, appointmentDate: "2026-03-25", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 99, specialistId: 7, clientId: 44, appointmentDate: "2026-03-27", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false }
        ],
        seriesItems: [
          { id: 91, specialistId: 7, clientId: 44, appointmentDate: "2026-03-09", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 93, specialistId: 7, clientId: 44, appointmentDate: "2026-03-11", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 94, specialistId: 7, clientId: 44, appointmentDate: "2026-03-13", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 92, specialistId: 7, clientId: 44, appointmentDate: "2026-03-16", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 96, specialistId: 7, clientId: 44, appointmentDate: "2026-03-18", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 97, specialistId: 7, clientId: 44, appointmentDate: "2026-03-20", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 95, specialistId: 7, clientId: 44, appointmentDate: "2026-03-23", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 98, specialistId: 7, clientId: 44, appointmentDate: "2026-03-25", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 99, specialistId: 7, clientId: 44, appointmentDate: "2026-03-27", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false }
        ]
      }),
      updateAppointmentScheduleByIdWithRepeatMeta: async (payload) => {
        updateCalls.push(payload);
        return {
          id: String(payload.id),
          specialistId: String(payload.specialistId),
          clientId: String(payload.clientId),
          appointmentDate: payload.appointmentDate,
          startTime: payload.startTime,
          endTime: payload.endTime
        };
      },
      deleteAppointmentSchedulesByIds: async ({ ids }) => {
        deletedIds.push(...ids);
        return ids.length;
      }
    })
  );

  const route = findRoute(recorder.routes, "DELETE", "/schedules/:id");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest({ features: ["appointments.planner"] }),
      params: { id: "92" },
      query: { scope: "future", dayKeys: "wed" }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 200);
  assert.deepEqual(deletedIds, [96, 98]);
  assert.deepEqual(
    updateCalls.map((item) => ({
      id: item.id,
      repeatGroupKey: item.repeatGroupKey,
      repeatUntilDate: item.repeatUntilDate,
      repeatAnchorDate: item.repeatAnchorDate
    })),
    [
      { id: 91, repeatGroupKey: "old-group", repeatUntilDate: "2026-03-15", repeatAnchorDate: "2026-03-09" },
      { id: 93, repeatGroupKey: "old-group", repeatUntilDate: "2026-03-15", repeatAnchorDate: "2026-03-09" },
      { id: 94, repeatGroupKey: "old-group", repeatUntilDate: "2026-03-15", repeatAnchorDate: "2026-03-09" },
      { id: 92, repeatGroupKey: "88888888-8888-8888-8888-888888888888", repeatUntilDate: "2026-03-30", repeatAnchorDate: "2026-03-16" },
      { id: 97, repeatGroupKey: "88888888-8888-8888-8888-888888888888", repeatUntilDate: "2026-03-30", repeatAnchorDate: "2026-03-16" },
      { id: 95, repeatGroupKey: "88888888-8888-8888-8888-888888888888", repeatUntilDate: "2026-03-30", repeatAnchorDate: "2026-03-16" },
      { id: 99, repeatGroupKey: "88888888-8888-8888-8888-888888888888", repeatUntilDate: "2026-03-30", repeatAnchorDate: "2026-03-16" }
    ]
  );
  assert.equal(reply.state.payload?.summary?.scope, "future");
  assert.equal(reply.state.payload?.summary?.deletedCount, 2);
});

test("schedule delete future scope removes every remaining item from a split auto-rolling single-day series when deleting from the new root", async () => {
  const deletedIds = [];
  const updateCalls = [];
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      getAppointmentScheduleTargetsByScope: async () => ({
        anchorId: 202,
        anchorAppointmentDate: "2026-03-24",
        repeatGroupKey: "split-group",
        repeatUntilDate: "2026-04-21",
        repeatAnchorDate: "2026-03-24",
        repeatDays: ["tue"],
        isAutoRollingRepeat: true,
        isRecurring: true,
        scope: "future",
        items: [
          { id: 202, specialistId: 7, clientId: 44, appointmentDate: "2026-03-24", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 203, specialistId: 7, clientId: 44, appointmentDate: "2026-03-31", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 204, specialistId: 7, clientId: 44, appointmentDate: "2026-04-07", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false }
        ],
        seriesItems: [
          { id: 202, specialistId: 7, clientId: 44, appointmentDate: "2026-03-24", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 203, specialistId: 7, clientId: 44, appointmentDate: "2026-03-31", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 204, specialistId: 7, clientId: 44, appointmentDate: "2026-04-07", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false }
        ]
      }),
      updateAppointmentScheduleByIdWithRepeatMeta: async (payload) => {
        updateCalls.push(payload);
        return { id: String(payload.id) };
      },
      deleteAppointmentSchedulesByIds: async ({ ids }) => {
        deletedIds.push(...ids);
        return ids.length;
      }
    })
  );

  const route = findRoute(recorder.routes, "DELETE", "/schedules/:id");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest({ features: ["appointments.planner"] }),
      params: { id: "202" },
      query: { scope: "future", dayKeys: "tue" }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 200);
  assert.deepEqual(deletedIds, [202, 203, 204]);
  assert.equal(updateCalls.length, 0);
  assert.equal(reply.state.payload?.summary?.scope, "future");
  assert.equal(reply.state.payload?.summary?.deletedCount, 3);
});

test("schedule delete future scope truncates a split auto-rolling single-day series from a later occurrence", async () => {
  const deletedIds = [];
  const updateCalls = [];
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      parseDateYmdToUtcDate: (value) => new Date(`${String(value || "").trim()}T00:00:00.000Z`),
      getAppointmentScheduleTargetsByScope: async () => ({
        anchorId: 203,
        anchorAppointmentDate: "2026-03-31",
        repeatGroupKey: "split-group",
        repeatUntilDate: "2026-04-21",
        repeatAnchorDate: "2026-03-24",
        repeatDays: ["tue"],
        isAutoRollingRepeat: true,
        isRecurring: true,
        scope: "future",
        items: [
          { id: 203, specialistId: 7, clientId: 44, appointmentDate: "2026-03-31", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 204, specialistId: 7, clientId: 44, appointmentDate: "2026-04-07", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false }
        ],
        seriesItems: [
          { id: 202, specialistId: 7, clientId: 44, appointmentDate: "2026-03-24", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 203, specialistId: 7, clientId: 44, appointmentDate: "2026-03-31", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 204, specialistId: 7, clientId: 44, appointmentDate: "2026-04-07", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false }
        ]
      }),
      updateAppointmentScheduleByIdWithRepeatMeta: async (payload) => {
        updateCalls.push(payload);
        return { id: String(payload.id) };
      },
      deleteAppointmentSchedulesByIds: async ({ ids }) => {
        deletedIds.push(...ids);
        return ids.length;
      }
    })
  );

  const route = findRoute(recorder.routes, "DELETE", "/schedules/:id");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest({ features: ["appointments.planner"] }),
      params: { id: "203" },
      query: { scope: "future", dayKeys: "tue" }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 200);
  assert.deepEqual(deletedIds, [203, 204]);
  assert.deepEqual(
    updateCalls.map((item) => ({
      id: item.id,
      repeatGroupKey: item.repeatGroupKey,
      repeatUntilDate: item.repeatUntilDate,
      repeatAnchorDate: item.repeatAnchorDate,
      isRepeatRoot: item.isRepeatRoot,
      isAutoRollingRepeat: item.isAutoRollingRepeat
    })),
    [
      {
        id: 202,
        repeatGroupKey: "split-group",
        repeatUntilDate: "2026-03-30",
        repeatAnchorDate: "2026-03-24",
        isRepeatRoot: true,
        isAutoRollingRepeat: false
      }
    ]
  );
  assert.equal(reply.state.payload?.summary?.scope, "future");
  assert.equal(reply.state.payload?.summary?.deletedCount, 2);
});

test("schedule delete single scope respects the selected weekday target within the current week", async () => {
  const deletedIds = [];
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      parseDateYmdToUtcDate: (value) => new Date(`${String(value || "").trim()}T00:00:00.000Z`),
      toDayKeyFromUtcDate: (value) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][value.getUTCDay()] || "",
      getAppointmentScheduleTargetsByScope: async () => ({
        anchorId: 92,
        anchorAppointmentDate: "2026-03-16",
        repeatGroupKey: "old-group",
        repeatUntilDate: "2026-03-30",
        repeatAnchorDate: "2026-03-09",
        repeatDays: ["mon", "wed", "fri"],
        isAutoRollingRepeat: false,
        isRecurring: true,
        scope: "single",
        items: [
          { id: 92, specialistId: 7, clientId: 44, appointmentDate: "2026-03-16", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false }
        ],
        seriesItems: [
          { id: 91, specialistId: 7, clientId: 44, appointmentDate: "2026-03-09", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 93, specialistId: 7, clientId: 44, appointmentDate: "2026-03-11", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 94, specialistId: 7, clientId: 44, appointmentDate: "2026-03-13", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 92, specialistId: 7, clientId: 44, appointmentDate: "2026-03-16", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 96, specialistId: 7, clientId: 44, appointmentDate: "2026-03-18", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 97, specialistId: 7, clientId: 44, appointmentDate: "2026-03-20", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 95, specialistId: 7, clientId: 44, appointmentDate: "2026-03-23", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 98, specialistId: 7, clientId: 44, appointmentDate: "2026-03-25", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false },
          { id: 99, specialistId: 7, clientId: 44, appointmentDate: "2026-03-27", startTime: "09:00", endTime: "10:00", durationMinutes: 60, serviceName: "Lesson", status: "pending", note: "", isVip: false }
        ]
      }),
      deleteAppointmentSchedulesByIds: async ({ ids }) => {
        deletedIds.push(...ids);
        return ids.length;
      }
    })
  );

  const route = findRoute(recorder.routes, "DELETE", "/schedules/:id");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest({ features: ["appointments.planner"] }),
      params: { id: "92" },
      query: { scope: "single", dayKeys: "wed" }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 200);
  assert.deepEqual(deletedIds, [96]);
  assert.equal(reply.state.payload?.summary?.scope, "single");
  assert.equal(reply.state.payload?.summary?.deletedCount, 1);
});

test("schedule create maps client overlap exclusion constraint to a client conflict message", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentScheduleRoutes(
    recorder.fastify,
    createScheduleContext({
      createAppointmentSchedule: async () => {
        const error = new Error("client overlap");
        error.code = "23P01";
        error.constraint = "ex_appointment_schedules_active_client_overlap";
        throw error;
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

  assert.equal(reply.state.statusCode, 409);
  assert.equal(reply.state.payload?.message, "This client already has another appointment at this time.");
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
  assert.equal(reply.state.payload?.message, "You can only delete appointment in your own planner.");
});

test("breaks routes require planner feature access", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentBreakRoutes(
    recorder.fastify,
    createBreaksContext({
      getAppointmentBreaksBySpecialist: async () => {
        throw new Error("Breaks should not load without planner feature access.");
      }
    })
  );

  const route = findRoute(recorder.routes, "GET", "/breaks");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest({ features: [] }),
      query: { specialistId: "7" }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 403);
  assert.equal(reply.state.payload?.message, "Forbidden.");
});

test("breaks routes allow planner readers to load breaks for planner view without standalone breaks permission", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentBreakRoutes(
    recorder.fastify,
    createBreaksContext({
      hasPermission: async (_roleId, permission) => permission === "appointments.planner.read",
      getAppointmentBreaksBySpecialist: async ({ specialistId }) => [
        {
          specialistId,
          dayOfWeek: 1,
          breakType: "lunch",
          startTime: "13:00",
          endTime: "14:00"
        }
      ]
    })
  );

  const route = findRoute(recorder.routes, "GET", "/breaks");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      ...createAccessRequest({ features: ["appointments.planner"] }),
      query: { specialistId: "7" }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 200);
  assert.equal(reply.state.payload?.items?.[0]?.startTime, "13:00");
});
