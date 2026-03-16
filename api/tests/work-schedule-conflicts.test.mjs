import assert from "node:assert/strict";
import test from "node:test";
import pool from "../src/config/db.js";
import {
  createAppointmentWorkScheduleEntry,
  deleteAppointmentWorkScheduleEntryById,
  getAppointmentSettingsByOrganization,
  saveAppointmentSettings,
  replaceAppointmentDefaultWeeklyWorkSchedule,
  updateAppointmentWorkScheduleEntryById
} from "../src/modules/appointments/appointment-settings.service.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";

const { registerAppointmentSettingsConfigRoutes } = await import(
  "../src/modules/appointments/routes/settings.routes.js"
);

function stubPoolQuery(implementation) {
  const originalQuery = pool.query.bind(pool);
  pool.query = implementation;
  return () => {
    pool.query = originalQuery;
  };
}

function stubPoolConnect(queryImplementation) {
  const originalConnect = pool.connect.bind(pool);
  pool.connect = async () => ({
    async query(sql, params = []) {
      return queryImplementation(sql, params);
    },
    release() {}
  });
  return () => {
    pool.connect = originalConnect;
  };
}

function createRouteRecorder() {
  const routes = [];
  return {
    routes,
    fastify: {
      apiRateLimit: { max: 1, timeWindow: 1000 },
      get(path, options, handler) {
        routes.push({ method: "GET", path, options, handler });
      },
      put(path, options, handler) {
        routes.push({ method: "PUT", path, options, handler });
      },
      post(path, options, handler) {
        routes.push({ method: "POST", path, options, handler });
      },
      patch(path, options, handler) {
        routes.push({ method: "PATCH", path, options, handler });
      },
      delete(path, options, handler) {
        routes.push({ method: "DELETE", path, options, handler });
      }
    }
  };
}

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

test("createAppointmentWorkScheduleEntry blocks specialist workday changes when future lessons exist", async () => {
  let insertAttempted = false;
  const restoreQuery = stubPoolQuery(async (sql) => {
    const queryText = String(sql || "");
    if (queryText.includes("jsonb_array_elements($2::jsonb)") && queryText.includes("appointment_schedules s")) {
      return {
        rows: [{
          appointment_id: 41,
          specialist_id: 9,
          specialist_name: "Alice Specialist",
          appointment_date: "2026-03-21",
          appointment_start_time: "10:00",
          appointment_end_time: "10:30"
        }]
      };
    }
    if (queryText.includes("WITH inserted AS")) {
      insertAttempted = true;
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${queryText}`);
  });

  try {
    await assert.rejects(
      () => createAppointmentWorkScheduleEntry({
        organizationId: 7,
        actorUserId: 1,
        userId: 9,
        ruleScope: "weekly",
        dayOfWeek: 6,
        isActive: false,
        startTime: null,
        endTime: null,
        reason: ""
      }),
      (error) => {
        assert.equal(error?.code, "WORK_SCHEDULE_CONFLICT");
        assert.equal(error?.statusCode, 409);
        assert.match(String(error?.message || ""), /Alice Specialist/);
        assert.match(String(error?.message || ""), /Move those lessons first/i);
        return true;
      }
    );
    assert.equal(insertAttempted, false);
  } finally {
    restoreQuery();
  }
});

test("createAppointmentWorkScheduleEntry blocks specialist hours outside organization default hours", async () => {
  let insertAttempted = false;
  const restoreQuery = stubPoolQuery(async (sql) => {
    const queryText = String(sql || "");
    if (queryText.includes("FROM appointment_working_hours") && queryText.includes("user_id IS NULL")) {
      return {
        rows: [{
          day_of_week: 1,
          is_active: true,
          start_time: "09:00",
          end_time: "18:00"
        }]
      };
    }
    if (queryText.includes("WITH inserted AS")) {
      insertAttempted = true;
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${queryText}`);
  });

  try {
    await assert.rejects(
      () => createAppointmentWorkScheduleEntry({
        organizationId: 7,
        actorUserId: 1,
        userId: 9,
        ruleScope: "weekly",
        dayOfWeek: 1,
        isActive: true,
        startTime: "08:00",
        endTime: "17:00",
        reason: ""
      }),
      (error) => {
        assert.equal(error?.code, "WORK_SCHEDULE_PARENT_CONFLICT");
        assert.equal(error?.statusCode, 409);
        assert.match(String(error?.message || ""), /organization default hours/i);
        return true;
      }
    );
    assert.equal(insertAttempted, false);
  } finally {
    restoreQuery();
  }
});

test("updateAppointmentWorkScheduleEntryById blocks availability changes when future lessons exist", async () => {
  let updateAttempted = false;
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");
    if (queryText.includes("FROM appointment_working_hours awh") && queryText.includes("WHERE awh.id = $1")) {
      assert.deepEqual(params, [12, 7]);
      return {
        rows: [{
          id: 12,
          organization_id: 7,
          user_id: 9,
          rule_scope: "weekly",
          day_of_week: 1,
          work_date: null,
          is_active: true,
          start_time: "09:00",
          end_time: "18:00",
          reason: ""
        }]
      };
    }
    if (queryText.includes("FROM appointment_working_hours") && queryText.includes("user_id IS NULL")) {
      assert.deepEqual(params, [7]);
      return {
        rows: [{
          day_of_week: 1,
          is_active: true,
          start_time: "09:00",
          end_time: "18:00"
        }]
      };
    }
    if (queryText.includes("jsonb_array_elements($2::jsonb)") && queryText.includes("appointment_schedules s")) {
      return {
        rows: [{
          appointment_id: 42,
          specialist_id: 9,
          specialist_name: "Alice Specialist",
          appointment_date: "2026-03-17",
          appointment_start_time: "11:00",
          appointment_end_time: "11:30"
        }]
      };
    }
    if (queryText.includes("WITH updated AS")) {
      updateAttempted = true;
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${queryText}`);
  });

  try {
    await assert.rejects(
      () => updateAppointmentWorkScheduleEntryById({
        id: 12,
        organizationId: 7,
        actorUserId: 1,
        userId: 9,
        ruleScope: "weekly",
        dayOfWeek: 1,
        isActive: true,
        startTime: "10:00",
        endTime: "17:00",
        reason: ""
      }),
      (error) => {
        assert.equal(error?.code, "WORK_SCHEDULE_CONFLICT");
        assert.equal(error?.statusCode, 409);
        return true;
      }
    );
    assert.equal(updateAttempted, false);
  } finally {
    restoreQuery();
  }
});

test("deleteAppointmentWorkScheduleEntryById blocks deletion while future lessons still exist", async () => {
  let deleteAttempted = false;
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");
    if (queryText.includes("FROM appointment_working_hours awh") && queryText.includes("WHERE awh.id = $1")) {
      assert.deepEqual(params, [13, 7]);
      return {
        rows: [{
          id: 13,
          organization_id: 7,
          user_id: 9,
          rule_scope: "exception",
          day_of_week: null,
          work_date: "2026-03-19",
          is_active: false,
          start_time: null,
          end_time: null,
          reason: "Vacation"
        }]
      };
    }
    if (queryText.includes("jsonb_array_elements($2::jsonb)") && queryText.includes("appointment_schedules s")) {
      return {
        rows: [{
          appointment_id: 43,
          specialist_id: 9,
          specialist_name: "Alice Specialist",
          appointment_date: "2026-03-19",
          appointment_start_time: "13:00",
          appointment_end_time: "13:30"
        }]
      };
    }
    if (queryText.includes("DELETE FROM appointment_working_hours")) {
      deleteAttempted = true;
      return { rowCount: 1 };
    }
    throw new Error(`Unexpected SQL: ${queryText}`);
  });

  try {
    await assert.rejects(
      () => deleteAppointmentWorkScheduleEntryById({
        id: 13,
        organizationId: 7
      }),
      (error) => {
        assert.equal(error?.code, "WORK_SCHEDULE_CONFLICT");
        assert.equal(error?.statusCode, 409);
        return true;
      }
    );
    assert.equal(deleteAttempted, false);
  } finally {
    restoreQuery();
  }
});

test("work-schedule create route returns 409 when specialist still has future lessons", async () => {
  const recorder = createRouteRecorder();
  registerAppointmentSettingsConfigRoutes(recorder.fastify, {
    setNoCacheHeaders() {},
    requesterHasOrgFeature() {
      return true;
    },
    hasPermission: async () => true,
    PERMISSIONS: {
      APPOINTMENTS_VIP_CLIENTS_MY_CLASS: "appointments.vip.my-class",
      APPOINTMENTS_VIP_CLIENTS_MY_CHILDREN: "appointments.vip.my-children",
      SETTINGS_APPOINTMENTS_READ: "settings.appointments.read",
      SETTINGS_APPOINTMENTS_UPDATE: "settings.appointments.update"
    },
    DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS: 10,
    DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX: 18,
    parseOptionalOrganizationId(value) {
      const parsed = Number.parseInt(String(value || "").trim(), 10);
      return {
        value: Number.isInteger(parsed) && parsed > 0 ? parsed : null,
        error: null
      };
    },
    resolveTargetOrganizationId(access, requestedOrganizationId) {
      return requestedOrganizationId || access?.authContext?.organizationId || null;
    },
    parsePositiveIntegerOr(value, fallback = 0) {
      const parsed = Number.parseInt(String(value || "").trim(), 10);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
    },
    toAppointmentDayNum(value) {
      return {
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6,
        sun: 7
      }[String(value || "").trim().toLowerCase()] || 0;
    },
    normalizeDurationOptions() {
      return [];
    },
    normalizeReminderChannels() {
      return [];
    },
    normalizeVisibleWeekDays() {
      return [];
    },
    validateSettingsPayload() {
      return null;
    },
    getAppointmentSettingsByOrganization: async () => ({}),
    saveAppointmentSettings: async () => ({}),
    withAppointmentTransaction: async (callback) => callback({
      query: async () => ({ rows: [], rowCount: 0 })
    }),
    listAppointmentWorkSchedule: async () => [],
    listAppointmentWorkScheduleStaffByOrganization: async () => [],
    createAppointmentWorkScheduleEntry: async () => {
      const error = new Error("Work schedule cannot be changed. Alice Specialist still has future lessons on 2026-03-21 10:00-10:30. Move those lessons first.");
      error.statusCode = 409;
      error.payload = {
        code: "WORK_SCHEDULE_CONFLICT",
        message: error.message
      };
      throw error;
    },
    updateAppointmentWorkScheduleEntryById: async () => null,
    deleteAppointmentWorkScheduleEntryById: async () => ({ rowCount: 0 }),
    replaceAppointmentDefaultWeeklyWorkSchedule: async () => []
  });

  const route = recorder.routes.find((item) => item.method === "POST" && item.path === "/work-schedule");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      body: {
        organizationId: 7,
        userId: 9,
        ruleScope: "weekly",
        dayOfWeek: 6,
        isActive: false
      },
      authContext: {
        userId: 1,
        organizationId: 7,
        requester: {
          role_id: 4
        }
      },
      log: {
        error() {}
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 409);
  assert.equal(reply.state.payload?.code, "WORK_SCHEDULE_CONFLICT");
  assert.match(String(reply.state.payload?.message || ""), /Move those lessons first/i);
});

test("work-schedule routes require dedicated permissions when explicit work schedule permissions exist", async () => {
  const recorder = createRouteRecorder();
  const permissionSet = new Set([
    "appointments.work-schedule.read",
    "appointments.work-schedule.create"
  ]);

  registerAppointmentSettingsConfigRoutes(recorder.fastify, {
    setNoCacheHeaders() {},
    requesterHasOrgFeature(requester, featureKey) {
      const enabledFeatures = new Set(requester?.orgFeatures || []);
      return enabledFeatures.has(featureKey);
    },
    hasPermission: async (_roleId, permissionCode) => permissionSet.has(permissionCode),
    PERMISSIONS: {
      APPOINTMENTS_VIP_CLIENTS_MY_CLASS: "appointments.vip.my-class",
      APPOINTMENTS_VIP_CLIENTS_MY_CHILDREN: "appointments.vip.my-children",
      SETTINGS_APPOINTMENTS_READ: "settings.appointments.read",
      SETTINGS_APPOINTMENTS_UPDATE: "settings.appointments.update",
      APPOINTMENTS_WORK_SCHEDULE_READ: "appointments.work-schedule.read",
      APPOINTMENTS_WORK_SCHEDULE_CREATE: "appointments.work-schedule.create",
      APPOINTMENTS_WORK_SCHEDULE_UPDATE: "appointments.work-schedule.update",
      APPOINTMENTS_WORK_SCHEDULE_DELETE: "appointments.work-schedule.delete"
    },
    DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS: 10,
    DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX: 18,
    parseOptionalOrganizationId(value) {
      const parsed = Number.parseInt(String(value || "").trim(), 10);
      return {
        value: Number.isInteger(parsed) && parsed > 0 ? parsed : null,
        error: null
      };
    },
    resolveTargetOrganizationId(access, requestedOrganizationId) {
      return requestedOrganizationId || access?.authContext?.organizationId || null;
    },
    parsePositiveIntegerOr(value, fallback = 0) {
      const parsed = Number.parseInt(String(value || "").trim(), 10);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
    },
    toAppointmentDayNum(value) {
      return {
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6,
        sun: 7
      }[String(value || "").trim().toLowerCase()] || 0;
    },
    normalizeDurationOptions() {
      return [];
    },
    normalizeReminderChannels() {
      return [];
    },
    normalizeVisibleWeekDays() {
      return [];
    },
    validateSettingsPayload() {
      return null;
    },
    getAppointmentSettingsByOrganization: async () => ({}),
    saveAppointmentSettings: async () => ({}),
    withAppointmentTransaction: async (callback) => callback({
      query: async () => ({ rows: [], rowCount: 0 })
    }),
    listAppointmentWorkSchedule: async () => [],
    listAppointmentWorkScheduleStaffByOrganization: async () => [],
    createAppointmentWorkScheduleEntry: async () => ({ id: 99 }),
    updateAppointmentWorkScheduleEntryById: async () => null,
    deleteAppointmentWorkScheduleEntryById: async () => ({ rowCount: 0 }),
    replaceAppointmentDefaultWeeklyWorkSchedule: async () => []
  });

  const readRoute = recorder.routes.find((item) => item.method === "GET" && item.path === "/work-schedule");
  const createRoute = recorder.routes.find((item) => item.method === "POST" && item.path === "/work-schedule");

  const deniedReadReply = createReplyRecorder();
  permissionSet.delete("appointments.work-schedule.read");
  await readRoute.handler(
    {
      query: { organizationId: 7 },
      authContext: {
        userId: 1,
        organizationId: 7,
        requester: {
          role_id: 4,
          orgFeatures: ["appointments.work_schedule"]
        }
      },
      log: { error() {} }
    },
    deniedReadReply
  );
  assert.equal(deniedReadReply.state.statusCode, 403);

  permissionSet.add("appointments.work-schedule.read");
  const allowedCreateReply = createReplyRecorder();
  await createRoute.handler(
    {
      body: {
        organizationId: 7,
        userId: 9,
        ruleScope: "weekly",
        dayOfWeek: 2,
        isActive: true,
        startTime: "10:00",
        endTime: "18:00",
        reason: ""
      },
      authContext: {
        userId: 1,
        organizationId: 7,
        requester: {
          role_id: 4,
          orgFeatures: ["appointments.work_schedule"]
        }
      },
      log: { error() {} }
    },
    allowedCreateReply
  );
  assert.equal(allowedCreateReply.state.statusCode, 201);
});

test("default weekly work-schedule route uses update permission", async () => {
  const recorder = createRouteRecorder();
  const permissionSet = new Set([
    "appointments.work-schedule.read",
    "appointments.work-schedule.update"
  ]);

  registerAppointmentSettingsConfigRoutes(recorder.fastify, {
    setNoCacheHeaders() {},
    requesterHasOrgFeature(requester, featureKey) {
      const enabledFeatures = new Set(requester?.orgFeatures || []);
      return enabledFeatures.has(featureKey);
    },
    hasPermission: async (_roleId, permissionCode) => permissionSet.has(permissionCode),
    PERMISSIONS: {
      APPOINTMENTS_VIP_CLIENTS_MY_CLASS: "appointments.vip.my-class",
      APPOINTMENTS_VIP_CLIENTS_MY_CHILDREN: "appointments.vip.my-children",
      SETTINGS_APPOINTMENTS_READ: "settings.appointments.read",
      SETTINGS_APPOINTMENTS_UPDATE: "settings.appointments.update",
      APPOINTMENTS_WORK_SCHEDULE_READ: "appointments.work-schedule.read",
      APPOINTMENTS_WORK_SCHEDULE_CREATE: "appointments.work-schedule.create",
      APPOINTMENTS_WORK_SCHEDULE_UPDATE: "appointments.work-schedule.update",
      APPOINTMENTS_WORK_SCHEDULE_DELETE: "appointments.work-schedule.delete"
    },
    DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS: 10,
    DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX: 18,
    parseOptionalOrganizationId(value) {
      const parsed = Number.parseInt(String(value || "").trim(), 10);
      return {
        value: Number.isInteger(parsed) && parsed > 0 ? parsed : null,
        error: null
      };
    },
    resolveTargetOrganizationId(access, requestedOrganizationId) {
      return requestedOrganizationId || access?.authContext?.organizationId || null;
    },
    parsePositiveIntegerOr(value, fallback = 0) {
      const parsed = Number.parseInt(String(value || "").trim(), 10);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
    },
    toAppointmentDayNum(value) {
      return {
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6,
        sun: 7
      }[String(value || "").trim().toLowerCase()] || 0;
    },
    normalizeDurationOptions() {
      return [];
    },
    normalizeReminderChannels() {
      return [];
    },
    normalizeVisibleWeekDays() {
      return [];
    },
    validateSettingsPayload() {
      return null;
    },
    getAppointmentSettingsByOrganization: async () => ({}),
    saveAppointmentSettings: async () => ({}),
    withAppointmentTransaction: async (callback) => callback({
      query: async () => ({ rows: [], rowCount: 0 })
    }),
    listAppointmentWorkSchedule: async () => [],
    listAppointmentWorkScheduleStaffByOrganization: async () => [],
    createAppointmentWorkScheduleEntry: async () => ({ id: 99 }),
    updateAppointmentWorkScheduleEntryById: async () => null,
    deleteAppointmentWorkScheduleEntryById: async () => ({ rowCount: 0 }),
    replaceAppointmentDefaultWeeklyWorkSchedule: async () => [{ dayOfWeek: 1, isActive: true, startTime: "09:00", endTime: "18:00" }]
  });

  const route = recorder.routes.find((item) => item.method === "PUT" && item.path === "/work-schedule/default-weekly");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      body: {
        organizationId: 7,
        items: [
          {
            dayOfWeek: 1,
            isActive: true,
            startTime: "09:00",
            endTime: "18:00"
          }
        ]
      },
      authContext: {
        userId: 1,
        organizationId: 7,
        requester: {
          role_id: 4,
          orgFeatures: ["appointments.work_schedule"]
        }
      },
      log: { error() {} }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 200);
  assert.equal(reply.state.payload?.message, "Default weekly work schedule updated.");
});

test("work-schedule routes do not inherit appointment settings permissions for non-admin users", async () => {
  const recorder = createRouteRecorder();
  const permissionSet = new Set([
    "settings.appointments.read",
    "settings.appointments.update"
  ]);

  registerAppointmentSettingsConfigRoutes(recorder.fastify, {
    setNoCacheHeaders() {},
    requesterHasOrgFeature(requester, featureKey) {
      const enabledFeatures = new Set(requester?.orgFeatures || []);
      return enabledFeatures.has(featureKey);
    },
    hasPermission: async (_roleId, permissionCode) => permissionSet.has(permissionCode),
    PERMISSIONS: {
      APPOINTMENTS_VIP_CLIENTS_MY_CLASS: "appointments.vip.my-class",
      APPOINTMENTS_VIP_CLIENTS_MY_CHILDREN: "appointments.vip.my-children",
      SETTINGS_APPOINTMENTS_READ: "settings.appointments.read",
      SETTINGS_APPOINTMENTS_UPDATE: "settings.appointments.update",
      APPOINTMENTS_WORK_SCHEDULE_READ: "appointments.work-schedule.read",
      APPOINTMENTS_WORK_SCHEDULE_CREATE: "appointments.work-schedule.create",
      APPOINTMENTS_WORK_SCHEDULE_UPDATE: "appointments.work-schedule.update",
      APPOINTMENTS_WORK_SCHEDULE_DELETE: "appointments.work-schedule.delete"
    },
    DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS: 10,
    DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX: 18,
    parseOptionalOrganizationId(value) {
      const parsed = Number.parseInt(String(value || "").trim(), 10);
      return {
        value: Number.isInteger(parsed) && parsed > 0 ? parsed : null,
        error: null
      };
    },
    resolveTargetOrganizationId(access, requestedOrganizationId) {
      return requestedOrganizationId || access?.authContext?.organizationId || null;
    },
    parsePositiveIntegerOr(value, fallback = 0) {
      const parsed = Number.parseInt(String(value || "").trim(), 10);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
    },
    toAppointmentDayNum(value) {
      return {
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6,
        sun: 7
      }[String(value || "").trim().toLowerCase()] || 0;
    },
    normalizeDurationOptions() {
      return [];
    },
    normalizeReminderChannels() {
      return [];
    },
    normalizeVisibleWeekDays() {
      return [];
    },
    validateSettingsPayload() {
      return null;
    },
    getAppointmentSettingsByOrganization: async () => ({}),
    saveAppointmentSettings: async () => ({}),
    withAppointmentTransaction: async (callback) => callback({
      query: async () => ({ rows: [], rowCount: 0 })
    }),
    listAppointmentWorkSchedule: async () => [],
    listAppointmentWorkScheduleStaffByOrganization: async () => [],
    createAppointmentWorkScheduleEntry: async () => ({ id: 99 }),
    updateAppointmentWorkScheduleEntryById: async () => null,
    deleteAppointmentWorkScheduleEntryById: async () => ({ rowCount: 0 }),
    replaceAppointmentDefaultWeeklyWorkSchedule: async () => []
  });

  const readRoute = recorder.routes.find((item) => item.method === "GET" && item.path === "/work-schedule");
  const createRoute = recorder.routes.find((item) => item.method === "POST" && item.path === "/work-schedule");

  const requestBase = {
    authContext: {
      userId: 1,
      organizationId: 7,
      requester: {
        role_id: 4,
        is_admin: false,
        is_platform_admin: false,
        orgFeatures: ["settings.appointments", "appointments.work_schedule"]
      }
    },
    log: { error() {} }
  };

  const deniedReadReply = createReplyRecorder();
  await readRoute.handler(
    {
      ...requestBase,
      query: { organizationId: 7 }
    },
    deniedReadReply
  );
  assert.equal(deniedReadReply.state.statusCode, 403);

  const deniedCreateReply = createReplyRecorder();
  await createRoute.handler(
    {
      ...requestBase,
      body: {
        organizationId: 7,
        userId: 9,
        ruleScope: "weekly",
        dayOfWeek: 2,
        isActive: true,
        startTime: "10:00",
        endTime: "18:00",
        reason: ""
      }
    },
    deniedCreateReply
  );
  assert.equal(deniedCreateReply.state.statusCode, 403);
});

test("appointment settings read allows my-children users without work-schedule permissions", async () => {
  const recorder = createRouteRecorder();
  const permissionSet = new Set([
    "appointments.vip.my-children"
  ]);
  const restoreQuery = stubPoolQuery(async (sql) => {
    const queryText = String(sql || "");
    if (queryText.includes("FROM information_schema.columns")) {
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${queryText}`);
  });

  registerAppointmentSettingsConfigRoutes(recorder.fastify, {
    setNoCacheHeaders() {},
    requesterHasOrgFeature(requester, featureKey) {
      const enabledFeatures = new Set(requester?.orgFeatures || []);
      return enabledFeatures.has(featureKey);
    },
    hasPermission: async (_roleId, permissionCode) => permissionSet.has(permissionCode),
    PERMISSIONS: {
      APPOINTMENTS_PLANNER_READ: "appointments.planner.read",
      APPOINTMENTS_VIP_CLIENTS_MY_CLASS: "appointments.vip.my-class",
      APPOINTMENTS_VIP_CLIENTS_MY_CHILDREN: "appointments.vip.my-children",
      SETTINGS_APPOINTMENTS_READ: "settings.appointments.read",
      SETTINGS_APPOINTMENTS_UPDATE: "settings.appointments.update",
      APPOINTMENTS_WORK_SCHEDULE_READ: "appointments.work-schedule.read",
      APPOINTMENTS_WORK_SCHEDULE_CREATE: "appointments.work-schedule.create",
      APPOINTMENTS_WORK_SCHEDULE_UPDATE: "appointments.work-schedule.update",
      APPOINTMENTS_WORK_SCHEDULE_DELETE: "appointments.work-schedule.delete"
    },
    DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS: 10,
    DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX: 18,
    parseOptionalOrganizationId(value) {
      const parsed = Number.parseInt(String(value || "").trim(), 10);
      return {
        value: Number.isInteger(parsed) && parsed > 0 ? parsed : null,
        error: null
      };
    },
    resolveTargetOrganizationId(access, requestedOrganizationId) {
      return requestedOrganizationId || access?.authContext?.organizationId || null;
    },
    parsePositiveIntegerOr(value, fallback = 0) {
      const parsed = Number.parseInt(String(value || "").trim(), 10);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
    },
    resolveOwnAppointmentSpecialistUserId() {
      return null;
    },
    toAppointmentDayNum(value) {
      return {
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6,
        sun: 7
      }[String(value || "").trim().toLowerCase()] || 0;
    },
    normalizeDurationOptions() {
      return [];
    },
    normalizeReminderChannels() {
      return [];
    },
    normalizeVisibleWeekDays() {
      return [];
    },
    validateSettingsPayload() {
      return null;
    },
    getAppointmentSettingsByOrganization: async () => ({ visibleWeekDays: [1, 2, 3, 4, 5] }),
    saveAppointmentSettings: async () => ({}),
    withAppointmentTransaction: async (callback) => callback({
      query: async () => ({ rows: [], rowCount: 0 })
    }),
    listAppointmentWorkSchedule: async () => [],
    listAppointmentWorkScheduleStaffByOrganization: async () => [],
    createAppointmentWorkScheduleEntry: async () => ({ id: 99 }),
    updateAppointmentWorkScheduleEntryById: async () => null,
    deleteAppointmentWorkScheduleEntryById: async () => ({ rowCount: 0 }),
    replaceAppointmentDefaultWeeklyWorkSchedule: async () => []
  });

  try {
    const readRoute = recorder.routes.find((item) => item.method === "GET" && item.path === "/settings");
    const reply = createReplyRecorder();
    await readRoute.handler(
      {
        authContext: {
          userId: 1,
          organizationId: 7,
          requester: {
            role_id: 4,
            is_admin: false,
            is_platform_admin: false,
            orgFeatures: ["vip_clients.my_children"]
          }
        },
        query: {},
        log: { error() {} }
      },
      reply
    );

    assert.equal(reply.state.statusCode, 200);
    assert.deepEqual(reply.state.payload?.item?.visibleWeekDays, [1, 2, 3, 4, 5]);
  } finally {
    restoreQuery();
  }
});

test("appointment settings patch does not require work-schedule permissions for settings users", async () => {
  const recorder = createRouteRecorder();
  const permissionSet = new Set([
    "settings.appointments.update"
  ]);
  let settingsSaveAttempted = false;

  registerAppointmentSettingsConfigRoutes(recorder.fastify, {
    setNoCacheHeaders() {},
    requesterHasOrgFeature(requester, featureKey) {
      const enabledFeatures = new Set(requester?.orgFeatures || []);
      return enabledFeatures.has(featureKey);
    },
    hasPermission: async (_roleId, permissionCode) => permissionSet.has(permissionCode),
    PERMISSIONS: {
      APPOINTMENTS_PLANNER_READ: "appointments.planner.read",
      APPOINTMENTS_VIP_CLIENTS_MY_CLASS: "appointments.vip.my-class",
      APPOINTMENTS_VIP_CLIENTS_MY_CHILDREN: "appointments.vip.my-children",
      SETTINGS_APPOINTMENTS_READ: "settings.appointments.read",
      SETTINGS_APPOINTMENTS_UPDATE: "settings.appointments.update",
      APPOINTMENTS_WORK_SCHEDULE_READ: "appointments.work-schedule.read",
      APPOINTMENTS_WORK_SCHEDULE_CREATE: "appointments.work-schedule.create",
      APPOINTMENTS_WORK_SCHEDULE_UPDATE: "appointments.work-schedule.update",
      APPOINTMENTS_WORK_SCHEDULE_DELETE: "appointments.work-schedule.delete"
    },
    DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS: 10,
    DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX: 18,
    parseOptionalOrganizationId(value) {
      const parsed = Number.parseInt(String(value || "").trim(), 10);
      return {
        value: Number.isInteger(parsed) && parsed > 0 ? parsed : null,
        error: null
      };
    },
    resolveTargetOrganizationId(access, requestedOrganizationId) {
      return requestedOrganizationId || access?.authContext?.organizationId || null;
    },
    parsePositiveIntegerOr(value, fallback = 0) {
      const parsed = Number.parseInt(String(value || "").trim(), 10);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
    },
    resolveOwnAppointmentSpecialistUserId() {
      return null;
    },
    toAppointmentDayNum(value) {
      return {
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6,
        sun: 7
      }[String(value || "").trim().toLowerCase()] || 0;
    },
    normalizeDurationOptions() {
      return [30];
    },
    normalizeReminderChannels() {
      return [];
    },
    normalizeVisibleWeekDays(value) {
      return Array.isArray(value) ? value : [1, 2, 3, 4, 5];
    },
    validateSettingsPayload() {
      return null;
    },
    getAppointmentSettingsByOrganization: async () => ({}),
    saveAppointmentSettings: async () => {
      settingsSaveAttempted = true;
      return { visibleWeekDays: [1, 2, 3, 4, 5] };
    },
    withAppointmentTransaction: async (callback) => callback({
      query: async (sql) => {
        const queryText = String(sql || "");
        if (queryText.includes("FROM information_schema.columns")) {
          return { rows: [] };
        }
        throw new Error(`Unexpected SQL: ${queryText}`);
      }
    }),
    listAppointmentWorkSchedule: async () => [],
    listAppointmentWorkScheduleStaffByOrganization: async () => [],
    createAppointmentWorkScheduleEntry: async () => null,
    updateAppointmentWorkScheduleEntryById: async () => null,
    deleteAppointmentWorkScheduleEntryById: async () => ({ rowCount: 0 }),
    replaceAppointmentDefaultWeeklyWorkSchedule: async () => []
  });

  const patchRoute = recorder.routes.find((item) => item.method === "PATCH" && item.path === "/settings");
  const reply = createReplyRecorder();
  await patchRoute.handler(
    {
      authContext: {
        userId: 1,
        organizationId: 7,
        requester: {
          role_id: 4,
          is_admin: false,
          is_platform_admin: false,
          orgFeatures: ["settings.appointments"]
        }
      },
      body: {
        slotInterval: 30,
        slotSubDivisions: 1,
        slotCellHeightPx: 18,
        historyLockDays: 10,
        appointmentDurationOptions: [30],
        noShowThreshold: 0,
        reminderHours: 0,
        reminderChannels: [],
        visibleWeekDays: [1, 2, 3, 4, 5]
      },
      log: { error() {} }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 200);
  assert.equal(settingsSaveAttempted, true);
});

test("appointment settings patch returns 409 and skips settings save when default weekly schedule conflicts", async () => {
  const recorder = createRouteRecorder();
  let settingsSaveAttempted = false;

  registerAppointmentSettingsConfigRoutes(recorder.fastify, {
    setNoCacheHeaders() {},
    requesterHasOrgFeature() {
      return true;
    },
    hasPermission: async () => true,
    PERMISSIONS: {
      APPOINTMENTS_VIP_CLIENTS_MY_CLASS: "appointments.vip.my-class",
      APPOINTMENTS_VIP_CLIENTS_MY_CHILDREN: "appointments.vip.my-children",
      SETTINGS_APPOINTMENTS_READ: "settings.appointments.read",
      SETTINGS_APPOINTMENTS_UPDATE: "settings.appointments.update"
    },
    DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS: 10,
    DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX: 18,
    parseOptionalOrganizationId(value) {
      const parsed = Number.parseInt(String(value || "").trim(), 10);
      return {
        value: Number.isInteger(parsed) && parsed > 0 ? parsed : null,
        error: null
      };
    },
    resolveTargetOrganizationId(access, requestedOrganizationId) {
      return requestedOrganizationId || access?.authContext?.organizationId || null;
    },
    parsePositiveIntegerOr(value, fallback = 0) {
      const parsed = Number.parseInt(String(value || "").trim(), 10);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
    },
    resolveOwnAppointmentSpecialistUserId() {
      return null;
    },
    toAppointmentDayNum(value) {
      return {
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6,
        sun: 7
      }[String(value || "").trim().toLowerCase()] || 0;
    },
    normalizeDurationOptions() {
      return [30];
    },
    normalizeReminderChannels() {
      return [];
    },
    normalizeVisibleWeekDays() {
      return [1, 2, 3, 4, 5];
    },
    validateSettingsPayload() {
      return null;
    },
    getAppointmentSettingsByOrganization: async () => ({}),
    saveAppointmentSettings: async () => {
      settingsSaveAttempted = true;
      return {};
    },
    withAppointmentTransaction: async (callback) => callback({
      query: async () => ({ rows: [], rowCount: 0 })
    }),
    listAppointmentWorkSchedule: async () => [],
    listAppointmentWorkScheduleStaffByOrganization: async () => [],
    createAppointmentWorkScheduleEntry: async () => null,
    updateAppointmentWorkScheduleEntryById: async () => null,
    deleteAppointmentWorkScheduleEntryById: async () => ({ rowCount: 0 }),
    replaceAppointmentDefaultWeeklyWorkSchedule: async () => {
      const error = new Error("Work schedule cannot be changed. Alice Specialist still has future lessons on 2026-03-23 10:00-10:30. Move those lessons first.");
      error.statusCode = 409;
      error.code = "WORK_SCHEDULE_CONFLICT";
      error.payload = {
        code: "WORK_SCHEDULE_CONFLICT",
        message: error.message,
        specialistId: "9",
        appointmentId: "51",
        appointmentDate: "2026-03-23",
        startTime: "10:00",
        endTime: "10:30"
      };
      throw error;
    }
  });

  const route = recorder.routes.find((item) => item.method === "PATCH" && item.path === "/settings");
  assert.equal(typeof route?.handler, "function");

  const reply = createReplyRecorder();
  await route.handler(
    {
      body: {
        organizationId: 7,
        slotInterval: 30,
        slotSubDivisions: 1,
        appointmentDuration: 30,
        appointmentDurationOptions: [30],
        noShowThreshold: 3,
        reminderHours: 24,
        reminderChannels: [],
        visibleWeekDays: [1, 2, 3, 4, 5],
        defaultWeeklyItems: [{
          dayOfWeek: "mon",
          isActive: true,
          startTime: "11:00",
          endTime: "16:00",
          reason: ""
        }]
      },
      authContext: {
        userId: 1,
        organizationId: 7,
        requester: {
          role_id: 4
        }
      },
      log: {
        error() {}
      }
    },
    reply
  );

  assert.equal(reply.state.statusCode, 409);
  assert.equal(reply.state.payload?.code, "WORK_SCHEDULE_CONFLICT");
  assert.equal(settingsSaveAttempted, false);
});

test("replaceAppointmentDefaultWeeklyWorkSchedule blocks org hours that would invalidate specialist overrides", async () => {
  const restoreConnect = stubPoolConnect(async (sql, params = []) => {
    const queryText = String(sql || "");
    if (queryText === "BEGIN" || queryText === "COMMIT" || queryText.startsWith("ROLLBACK")) {
      return { rows: [], rowCount: 0 };
    }
    if (queryText.includes("FROM appointment_working_hours awh") && queryText.includes("awh.user_id IS NOT NULL")) {
      assert.deepEqual(params, [7]);
      return {
        rows: [{
          user_id: 9,
          day_of_week: 1,
          is_active: true,
          start_time: "10:00",
          end_time: "17:00",
          specialist_name: "Alice Specialist"
        }]
      };
    }
    throw new Error(`Unexpected SQL: ${queryText}`);
  });

  try {
    await assert.rejects(
      () => replaceAppointmentDefaultWeeklyWorkSchedule({
        organizationId: 7,
        actorUserId: 1,
        items: [{
          dayOfWeek: 1,
          isActive: true,
          startTime: "11:00",
          endTime: "16:00",
          reason: ""
        }]
      }),
      (error) => {
        assert.equal(error?.code, "WORK_SCHEDULE_PARENT_CONFLICT");
        assert.equal(error?.statusCode, 409);
        assert.match(String(error?.message || ""), /Alice Specialist/);
        return true;
      }
    );
  } finally {
    restoreConnect();
  }
});

test("replaceAppointmentDefaultWeeklyWorkSchedule blocks org hours while future lessons still exist", async () => {
  const restoreConnect = stubPoolConnect(async (sql, params = []) => {
    const queryText = String(sql || "");
    if (queryText === "BEGIN" || queryText === "COMMIT" || queryText.startsWith("ROLLBACK")) {
      return { rows: [], rowCount: 0 };
    }
    if (queryText.includes("FROM appointment_working_hours awh") && queryText.includes("awh.user_id IS NOT NULL")) {
      assert.deepEqual(params, [7]);
      return {
        rows: []
      };
    }
    if (queryText.includes("jsonb_array_elements($2::jsonb)") && queryText.includes("JOIN appointment_schedules s")) {
      assert.equal(params[0], 7);
      return {
        rows: [{
          appointment_id: 51,
          specialist_id: 9,
          appointment_date: "2026-03-23",
          appointment_start_time: "10:00",
          appointment_end_time: "10:30",
          specialist_name: "Alice Specialist"
        }]
      };
    }
    throw new Error(`Unexpected SQL: ${queryText}`);
  });

  try {
    await assert.rejects(
      () => replaceAppointmentDefaultWeeklyWorkSchedule({
        organizationId: 7,
        actorUserId: 1,
        items: [{
          dayOfWeek: 1,
          isActive: true,
          startTime: "11:00",
          endTime: "16:00",
          reason: ""
        }]
      }),
      (error) => {
        assert.equal(error?.code, "WORK_SCHEDULE_CONFLICT");
        assert.equal(error?.statusCode, 409);
        assert.match(String(error?.message || ""), /Move those lessons first/i);
        return true;
      }
    );
  } finally {
    restoreConnect();
  }
});

test("getAppointmentSettingsByOrganization overlays specialist weekly hours inside org default", async () => {
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");
    if (queryText.includes("FROM information_schema.columns")) {
      return {
        rows: [
          { column_name: "appointment_duration_minutes" },
          { column_name: "appointment_duration_options_minutes" },
          { column_name: "reminder_channels" },
          { column_name: "slot_sub_divisions" },
          { column_name: "history_lock_days" },
          { column_name: "slot_cell_height_px" }
        ]
      };
    }
    if (queryText.includes("FROM appointment_settings")) {
      assert.deepEqual(params, [7]);
      return {
        rows: [{
          id: 1,
          organization_id: 7,
          slot_interval_minutes: 30,
          slot_sub_divisions: 1,
          appointment_duration_minutes: 30,
          appointment_duration_options_minutes: [30],
          no_show_threshold: 3,
          reminder_hours: 24,
          reminder_channels: ["sms"],
          history_lock_days: 10,
          slot_cell_height_px: 18,
          visible_week_days: [1, 2, 3, 4, 5]
        }]
      };
    }
    if (queryText.includes("FROM appointment_working_hours") && queryText.includes("user_id IS NULL")) {
      assert.deepEqual(params, [7]);
      return {
        rows: [
          { day_of_week: 1, is_active: true, start_time: "09:00", end_time: "18:00" },
          { day_of_week: 2, is_active: true, start_time: "09:00", end_time: "18:00" }
        ]
      };
    }
    if (queryText.includes("FROM appointment_working_hours") && queryText.includes("user_id = $2")) {
      assert.deepEqual(params, [7, 9]);
      return {
        rows: [
          { day_of_week: 1, is_active: true, start_time: "10:00", end_time: "17:00" },
          { day_of_week: 2, is_active: false, start_time: null, end_time: null }
        ]
      };
    }
    throw new Error(`Unexpected SQL: ${queryText}`);
  });

  try {
    const item = await getAppointmentSettingsByOrganization(7, { specialistId: 9 });
    assert.equal(item.workingHours.mon.start, "10:00");
    assert.equal(item.workingHours.mon.end, "17:00");
    assert.equal(item.workingHours.tue.start, "");
    assert.equal(item.workingHours.tue.end, "");
  } finally {
    restoreQuery();
  }
});

test("saveAppointmentSettings normalizes duration options without throwing reference errors", async () => {
  const restoreConnect = stubPoolConnect(async (sql) => {
    const queryText = String(sql || "");
    if (queryText === "BEGIN" || queryText === "COMMIT" || queryText.startsWith("ROLLBACK")) {
      return { rows: [], rowCount: 0 };
    }
    if (queryText.includes("INSERT INTO appointment_settings")) {
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected transaction SQL: ${queryText}`);
  });

  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");
    if (queryText.includes("FROM information_schema.columns")) {
      return {
        rows: [
          { column_name: "appointment_duration_minutes" },
          { column_name: "appointment_duration_options_minutes" },
          { column_name: "reminder_channels" },
          { column_name: "slot_sub_divisions" },
          { column_name: "history_lock_days" },
          { column_name: "slot_cell_height_px" }
        ]
      };
    }
    if (queryText.includes("FROM appointment_settings")) {
      assert.deepEqual(params, [7]);
      return {
        rows: [{
          id: 1,
          organization_id: 7,
          slot_interval_minutes: 30,
          slot_sub_divisions: 1,
          appointment_duration_minutes: 30,
          appointment_duration_options_minutes: [30, 45],
          no_show_threshold: 3,
          reminder_hours: 24,
          reminder_channels: ["sms"],
          history_lock_days: 10,
          slot_cell_height_px: 18,
          visible_week_days: [1, 2, 3, 4, 5]
        }]
      };
    }
    if (queryText.includes("FROM appointment_working_hours")) {
      return { rows: [] };
    }
    throw new Error(`Unexpected query SQL: ${queryText}`);
  });

  try {
    const item = await saveAppointmentSettings({
      organizationId: 7,
      actorUserId: 1,
      slotIntervalMinutes: 30,
      slotSubDivisions: 1,
      slotCellHeightPx: 18,
      historyLockDays: 10,
      appointmentDurationMinutes: 30,
      appointmentDurationOptionsMinutes: [30, 45],
      noShowThreshold: 3,
      reminderHours: 24,
      reminderChannels: ["sms"],
      visibleWeekDays: [1, 2, 3, 4, 5]
    });

    assert.equal(item.slotInterval, "30");
    assert.deepEqual(item.appointmentDurationOptions, ["30", "45"]);
  } finally {
    restoreConnect();
    restoreQuery();
  }
});
