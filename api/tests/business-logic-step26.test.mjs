import assert from "node:assert/strict";
import test from "node:test";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";

const poolModule = await import("../src/config/db.js");
const clientsRoutesModule = await import("../src/modules/clients/clients.routes.js");
const clientsServiceModule = await import("../src/modules/clients/clients.service.js");
const accessModule = await import("../src/modules/users/access.service.js");

const pool = poolModule.default;
const clientsRoutes = clientsRoutesModule.default;
const {
  deleteClientMedicalHistoryEntry,
  resetClientsServiceSchemaCacheForTests
} = clientsServiceModule;
const { clearRolePermissionsCache } = accessModule;

function stubPoolQuery(implementation) {
  const originalQuery = pool.query.bind(pool);
  pool.query = implementation;
  return () => {
    pool.query = originalQuery;
  };
}

function createReplyRecorder() {
  const state = {
    statusCode: 200,
    payload: undefined,
    headers: {}
  };

  return {
    state,
    header(name, value) {
      state.headers[String(name || "").toLowerCase()] = value;
      return this;
    },
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
    const options = hasOptions ? optionsOrHandler : {};
    const handler = hasOptions ? maybeHandler : optionsOrHandler;
    routes.push({ method, path, options, handler });
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

test("vip tutor assignment update requires update permission when assignment already exists", async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = recorder.routes.find((item) => item.method === "PUT" && item.path === "/vip-tutor-assignments");
  assert.equal(typeof route?.handler, "function");

  clearRolePermissionsCache();
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return {
        rows: (Array.isArray(params[1]) ? params[1] : []).map((tableName) => ({ table_name: tableName }))
      };
    }
    if (queryText.includes("FROM information_schema.columns")) {
      return {
        rows: [
          { column_name: "organization_id" },
          { column_name: "class_assignment_id" },
          { column_name: "day_of_week" },
          { column_name: "activity_type" },
          { column_name: "start_time" },
          { column_name: "end_time" },
          { column_name: "specialist_user_id" },
          { column_name: "mandatory_exercises" },
          { column_name: "note" },
          { column_name: "created_by" },
          { column_name: "updated_by" },
          { column_name: "created_at" },
          { column_name: "updated_at" }
        ]
      };
    }
    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [
          { code: "appointments.assignments.tutor.read" },
          { code: "appointments.assignments.tutor.create" },
          { code: "appointments.vip-clients.scope.all" }
        ]
      };
    }
    if (queryText.includes("FROM vip_client_tutor_assignments") && queryText.includes("client_id = $2")) {
      return {
        rows: [{
          client_id: "44",
          class_assignment_id: "10",
          tutor_user_id: "20"
        }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await route.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: false,
          is_platform_admin: false,
          role_label: "manager",
          position_label: "staff",
          organization_allowed_features: ["assignments.tutor"]
        }
      },
      body: {
        clientId: "44",
        classId: "10",
        tutorId: "20"
      },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 403);
    assert.equal(reply.state.payload?.message, "Forbidden.");
  } finally {
    clearRolePermissionsCache();
    restoreQuery();
  }
});

test("vip tutor assignment create requires create permission when assignment does not exist", async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = recorder.routes.find((item) => item.method === "PUT" && item.path === "/vip-tutor-assignments");
  assert.equal(typeof route?.handler, "function");

  clearRolePermissionsCache();
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return {
        rows: (Array.isArray(params[1]) ? params[1] : []).map((tableName) => ({ table_name: tableName }))
      };
    }
    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [
          { code: "appointments.assignments.tutor.read" },
          { code: "appointments.assignments.tutor.update" },
          { code: "appointments.vip-clients.scope.all" }
        ]
      };
    }
    if (queryText.includes("FROM vip_client_tutor_assignments") && queryText.includes("client_id = $2")) {
      return { rows: [] };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await route.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: false,
          is_platform_admin: false,
          role_label: "manager",
          position_label: "staff",
          organization_allowed_features: ["assignments.tutor"]
        }
      },
      body: {
        clientId: "44",
        classId: "10",
        tutorId: "20"
      },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 403);
    assert.equal(reply.state.payload?.message, "Forbidden.");
  } finally {
    clearRolePermissionsCache();
    restoreQuery();
  }
});

test("vip tutor assignment update blocks assigned-scope users from editing unassigned clients", async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = recorder.routes.find((item) => item.method === "PUT" && item.path === "/vip-tutor-assignments");
  assert.equal(typeof route?.handler, "function");

  clearRolePermissionsCache();
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return {
        rows: (Array.isArray(params[1]) ? params[1] : []).map((tableName) => ({ table_name: tableName }))
      };
    }
    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [
          { code: "appointments.assignments.tutor.read" },
          { code: "appointments.assignments.tutor.update" },
          { code: "appointments.vip-clients.scope.assigned" }
        ]
      };
    }
    if (queryText.includes("FROM vip_client_tutor_assignments vta") && queryText.includes("JOIN vip_class_teacher_assignments vcta")) {
      return { rows: [] };
    }
    if (queryText.includes("FROM vip_client_tutor_assignments") && queryText.includes("client_id = $2")) {
      return {
        rows: [{
          client_id: "44",
          class_assignment_id: "10",
          tutor_user_id: "20"
        }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await route.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: false,
          is_platform_admin: false,
          role_label: "teacher",
          position_label: "staff",
          organization_allowed_features: ["assignments.tutor", "vip_clients.attendance"]
        }
      },
      body: {
        clientId: "44",
        classId: "10",
        tutorId: "20"
      },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 403);
    assert.equal(reply.state.payload?.message, "Forbidden.");
  } finally {
    clearRolePermissionsCache();
    restoreQuery();
  }
});

test("vip attendance update requires update permission when attendance already exists", async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = recorder.routes.find((item) => item.method === "PUT" && item.path === "/vip-attendance");
  assert.equal(typeof route?.handler, "function");

  clearRolePermissionsCache();
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return {
        rows: (Array.isArray(params[1]) ? params[1] : []).map((tableName) => ({ table_name: tableName }))
      };
    }
    if (queryText.includes("FROM information_schema.columns")) {
      return {
        rows: [
          { column_name: "organization_id" },
          { column_name: "class_assignment_id" },
          { column_name: "day_of_week" },
          { column_name: "activity_type" },
          { column_name: "start_time" },
          { column_name: "end_time" },
          { column_name: "specialist_user_id" },
          { column_name: "mandatory_exercises" },
          { column_name: "note" },
          { column_name: "created_by" },
          { column_name: "updated_by" },
          { column_name: "created_at" },
          { column_name: "updated_at" }
        ]
      };
    }
    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [
          { code: "appointments.vip-clients.read" },
          { code: "appointments.vip-clients.create" },
          { code: "appointments.vip-clients.scope.all" }
        ]
      };
    }
    if (queryText.includes("FROM vip_client_attendance") && queryText.includes("attendance_date = $3::date")) {
      return {
        rows: [{
          client_id: "44",
          attendance_date: "2026-03-09",
          status: "present"
        }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await route.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: false,
          is_platform_admin: false,
          role_label: "manager",
          position_label: "staff",
          organization_allowed_features: ["vip_clients.attendance"]
        }
      },
      body: {
        clientId: "44",
        attendanceDate: "2026-03-09",
        status: "present"
      },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 403);
    assert.equal(reply.state.payload?.message, "Forbidden.");
  } finally {
    clearRolePermissionsCache();
    restoreQuery();
  }
});

test("vip attendance create requires create permission when attendance does not exist", async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = recorder.routes.find((item) => item.method === "PUT" && item.path === "/vip-attendance");
  assert.equal(typeof route?.handler, "function");

  clearRolePermissionsCache();
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return {
        rows: (Array.isArray(params[1]) ? params[1] : []).map((tableName) => ({ table_name: tableName }))
      };
    }
    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [
          { code: "appointments.vip-clients.read" },
          { code: "appointments.vip-clients.update" },
          { code: "appointments.vip-clients.scope.all" }
        ]
      };
    }
    if (queryText.includes("FROM vip_client_attendance") && queryText.includes("attendance_date = $3::date")) {
      return { rows: [] };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await route.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: false,
          is_platform_admin: false,
          role_label: "manager",
          position_label: "staff",
          organization_allowed_features: ["vip_clients.attendance"]
        }
      },
      body: {
        clientId: "44",
        attendanceDate: "2026-03-09",
        status: "present"
      },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 403);
    assert.equal(reply.state.payload?.message, "Forbidden.");
  } finally {
    clearRolePermissionsCache();
    restoreQuery();
  }
});

test("vip daily routine update blocks assigned-scope users from editing unassigned classes", async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = recorder.routes.find((item) => item.method === "PUT" && item.path === "/vip-class-daily-routines");
  assert.equal(typeof route?.handler, "function");

  clearRolePermissionsCache();
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return {
        rows: (Array.isArray(params[1]) ? params[1] : []).map((tableName) => ({ table_name: tableName }))
      };
    }
    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [
          { code: "appointments.vip-clients.daily-routines" },
          { code: "appointments.vip-clients.update" },
          { code: "appointments.vip-clients.scope.assigned" }
        ]
      };
    }
    if (queryText.includes("FROM vip_class_daily_routines") && queryText.includes("WHERE organization_id = $1")) {
      return {
        rows: [{
          id: "55",
          class_assignment_id: "99",
          day_of_week: 1,
          activity_type: "lesson"
        }]
      };
    }
    if (queryText.includes("FROM vip_class_teacher_assignments vcta")) {
      return { rows: [] };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await route.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: false,
          is_platform_admin: false,
          role_label: "teacher",
          position_label: "staff",
          organization_allowed_features: ["vip_clients.daily_routines", "vip_clients.attendance"]
        }
      },
      body: {
        id: "55",
        classId: "99",
        specialistId: "9",
        dayOfWeek: "1",
        activityType: "lesson",
        startTime: "09:00",
        endTime: "10:00",
        note: ""
      },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 403);
    assert.equal(reply.state.payload?.message, "Forbidden.");
  } finally {
    clearRolePermissionsCache();
    restoreQuery();
  }
});

test("vip daily routine save allows class-level routines without selecting a specialist", async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = recorder.routes.find((item) => item.method === "PUT" && item.path === "/vip-class-daily-routines");
  assert.equal(typeof route?.handler, "function");

  let specialistListQueried = false;
  let specialistConflictQueried = false;

  resetClientsServiceSchemaCacheForTests();
  clearRolePermissionsCache();
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return {
        rows: (Array.isArray(params[1]) ? params[1] : []).map((tableName) => ({ table_name: tableName }))
      };
    }
    if (queryText.includes("FROM information_schema.columns")) {
      return {
        rows: [
          { column_name: "organization_id" },
          { column_name: "class_assignment_id" },
          { column_name: "day_of_week" },
          { column_name: "activity_type" },
          { column_name: "start_time" },
          { column_name: "end_time" },
          { column_name: "specialist_user_id" },
          { column_name: "mandatory_exercises" },
          { column_name: "note" },
          { column_name: "created_by" },
          { column_name: "updated_by" },
          { column_name: "created_at" },
          { column_name: "updated_at" }
        ]
      };
    }
    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [
          { code: "appointments.vip-clients.read" },
          { code: "appointments.vip-clients.create" },
          { code: "appointments.vip-clients.daily-routines" },
          { code: "appointments.vip-clients.scope.all" }
        ]
      };
    }
    if (queryText.includes("WITH accessible_classes AS") && queryText.includes("FROM specialist_sources ss")) {
      specialistListQueried = true;
      return { rows: [] };
    }
    if (queryText.includes("FROM vip_class_daily_routines r") && queryText.includes("r.specialist_user_id = $2")) {
      specialistConflictQueried = true;
      return { rows: [] };
    }
    if (queryText.includes("FROM appointment_schedules s")) {
      return { rows: [] };
    }
    if (queryText.includes("INSERT INTO vip_class_daily_routines")) {
      return {
        rows: [{
          id: "88",
          class_assignment_id: "99",
          class_name: "Alpha",
          teacher_user_id: "4",
          teacher_name: "Teacher",
          specialist_user_id: null,
          specialist_name: "",
          specialist_role: "",
          children_count: 5,
          day_of_week: 1,
          activity_type: "lesson",
          start_time: "09:00",
          end_time: "10:00",
          mandatory_exercises: "",
          note: "Math topic",
          created_by: "7",
          updated_by: "7",
          created_at: "2026-03-19T09:00:00.000Z",
          updated_at: "2026-03-19T09:00:00.000Z"
        }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await route.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: false,
          is_platform_admin: false,
          role_label: "manager",
          position_label: "staff",
          organization_allowed_features: ["vip_clients.daily_routines"]
        }
      },
      body: {
        classId: "99",
        dayOfWeek: "1",
        activityType: "lesson",
        startTime: "09:00",
        endTime: "10:00",
        note: "Math topic"
      },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 200);
    assert.equal(reply.state.payload?.item?.specialistId, "");
    assert.equal(specialistListQueried, false);
    assert.equal(specialistConflictQueried, false);
  } finally {
    resetClientsServiceSchemaCacheForTests();
    clearRolePermissionsCache();
    restoreQuery();
  }
});

test("vip daily routine save blocks class-level routines when a child in the class already has an appointment", async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = recorder.routes.find((item) => item.method === "PUT" && item.path === "/vip-class-daily-routines");
  assert.equal(typeof route?.handler, "function");

  resetClientsServiceSchemaCacheForTests();
  clearRolePermissionsCache();
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return {
        rows: (Array.isArray(params[1]) ? params[1] : []).map((tableName) => ({ table_name: tableName }))
      };
    }
    if (queryText.includes("FROM information_schema.columns")) {
      return {
        rows: [
          { column_name: "organization_id" },
          { column_name: "class_assignment_id" },
          { column_name: "day_of_week" },
          { column_name: "activity_type" },
          { column_name: "start_time" },
          { column_name: "end_time" },
          { column_name: "specialist_user_id" },
          { column_name: "mandatory_exercises" },
          { column_name: "note" },
          { column_name: "created_by" },
          { column_name: "updated_by" },
          { column_name: "created_at" },
          { column_name: "updated_at" }
        ]
      };
    }
    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [
          { code: "appointments.vip-clients.read" },
          { code: "appointments.vip-clients.create" },
          { code: "appointments.vip-clients.daily-routines" },
          { code: "appointments.vip-clients.scope.all" }
        ]
      };
    }
    if (queryText.includes("appointment_schedules")) {
      return {
        rows: [{
          appointment_id: "92",
          appointment_date: "2026-03-23",
          appointment_start_time: "09:30",
          appointment_end_time: "10:00",
          client_name: "Class Child",
          conflict_scope: "client"
        }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await route.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: false,
          is_platform_admin: false,
          role_label: "manager",
          position_label: "staff",
          organization_allowed_features: ["vip_clients.daily_routines"]
        }
      },
      body: {
        classId: "99",
        dayOfWeek: "1",
        activityType: "lesson",
        startTime: "09:00",
        endTime: "10:00",
        note: "Math topic"
      },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 409);
    assert.equal(
      reply.state.payload?.message,
      "This time slot conflicts with an existing appointment for a child in this class: 2026-03-23 09:30-10:00 (Class Child)."
    );
  } finally {
    resetClientsServiceSchemaCacheForTests();
    clearRolePermissionsCache();
    restoreQuery();
  }
});

test("vip daily routine save blocks overlapping routine times for the same specialist across classes", async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = recorder.routes.find((item) => item.method === "PUT" && item.path === "/vip-class-daily-routines");
  assert.equal(typeof route?.handler, "function");

  resetClientsServiceSchemaCacheForTests();
  clearRolePermissionsCache();
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return {
        rows: (Array.isArray(params[1]) ? params[1] : []).map((tableName) => ({ table_name: tableName }))
      };
    }
    if (queryText.includes("FROM information_schema.columns")) {
      return {
        rows: [
          { column_name: "organization_id" },
          { column_name: "class_assignment_id" },
          { column_name: "day_of_week" },
          { column_name: "activity_type" },
          { column_name: "start_time" },
          { column_name: "end_time" },
          { column_name: "specialist_user_id" },
          { column_name: "mandatory_exercises" },
          { column_name: "note" },
          { column_name: "created_by" },
          { column_name: "updated_by" },
          { column_name: "created_at" },
          { column_name: "updated_at" }
        ]
      };
    }
    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [
          { code: "appointments.vip-clients.read" },
          { code: "appointments.vip-clients.create" },
          { code: "appointments.vip-clients.daily-routines" },
          { code: "appointments.vip-clients.scope.all" }
        ]
      };
    }
    if (queryText.includes("WITH accessible_classes AS") && queryText.includes("FROM specialist_sources ss")) {
      return {
        rows: [{
          class_assignment_id: "99",
          specialist_user_id: "9",
          specialist_name: "Teacher Ali",
          specialist_role: "Specialist"
        }]
      };
    }
    if (queryText.includes("FROM vip_class_daily_routines r") && queryText.includes("r.specialist_user_id = $2")) {
      return {
        rows: [{
          id: "81",
          class_assignment_id: "12",
          class_name: "Alpha",
          activity_type: "lesson",
          start_time: "09:00",
          end_time: "10:00"
        }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await route.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: false,
          is_platform_admin: false,
          role_label: "manager",
          position_label: "staff",
          organization_allowed_features: ["vip_clients.daily_routines"]
        }
      },
      body: {
        classId: "99",
        specialistId: "9",
        dayOfWeek: "1",
        activityType: "breakfast",
        startTime: "09:30",
        endTime: "09:45",
        note: ""
      },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 409);
    assert.equal(
      reply.state.payload?.message,
      "The selected specialist already has another VIP daily routine at this time: Alpha 09:00-10:00 (lesson)."
    );
  } finally {
    resetClientsServiceSchemaCacheForTests();
    clearRolePermissionsCache();
    restoreQuery();
  }
});


test("vip attendance teachers endpoint scopes assigned-only users to their related class teachers", async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = recorder.routes.find((item) => item.method === "GET" && item.path === "/vip-attendance/teachers");
  assert.equal(typeof route?.handler, "function");

  clearRolePermissionsCache();
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return {
        rows: (Array.isArray(params[1]) ? params[1] : []).map((tableName) => ({ table_name: tableName }))
      };
    }
    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [
          { code: "clients.read" },
          { code: "appointments.vip-clients.read" },
          { code: "appointments.vip-clients.scope.assigned" }
        ]
      };
    }
    if (queryText.includes("FROM vip_class_teacher_assignments va")) {
      return {
        rows: [
          { id: "10", class_name: "Alpha", teacher_user_id: "7", teacher_name: "Teacher Self" },
          { id: "11", class_name: "Beta", teacher_user_id: "9", teacher_name: "Teacher Two" },
          { id: "12", class_name: "Gamma", teacher_user_id: "9", teacher_name: "Teacher Two" }
        ]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await route.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: false,
          is_platform_admin: false,
          role_label: "teacher",
          position_label: "staff",
          organization_allowed_features: ["vip_clients.attendance"]
        }
      },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 200);
    assert.deepEqual(reply.state.payload?.items, [
      { id: "7", name: "Teacher Self" },
      { id: "9", name: "Teacher Two" }
    ]);
  } finally {
    clearRolePermissionsCache();
    restoreQuery();
  }
});

test("vip client search rejects plain clients read without vip permission", async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = recorder.routes.find((item) => item.method === "GET" && item.path === "/search");
  assert.equal(typeof route?.handler, "function");

  clearRolePermissionsCache();
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [{ code: "clients.read" }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await route.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: false,
          is_platform_admin: false,
          role_label: "manager",
          position_label: "staff",
          organization_allowed_features: ["vip_clients.attendance"]
        }
      },
      query: {
        isVip: "true"
      },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 403);
    assert.equal(reply.state.payload?.message, "Forbidden.");
  } finally {
    clearRolePermissionsCache();
    restoreQuery();
  }
});

test("medical history single delete does not require author match when delete permission already passed", async () => {
  resetClientsServiceSchemaCacheForTests();
  let capturedQuery = "";
  let capturedParams = null;
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return {
        rows: [{ table_name: "client_medical_history_entries" }]
      };
    }

    if (queryText.includes("DELETE FROM client_medical_history_entries h")) {
      capturedQuery = queryText;
      capturedParams = params;
      return {
        rows: [{ id: "15", client_id: "9" }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const item = await deleteClientMedicalHistoryEntry({
      organizationId: 3,
      clientId: 9,
      entryId: 15,
      deletedBy: 44,
      isAdmin: false
    });

    assert.deepEqual(item, { id: "15", client_id: "9" });
    assert.equal(capturedQuery.includes("author_user_id"), false);
    assert.deepEqual(capturedParams, [3, 9, 15]);
  } finally {
    resetClientsServiceSchemaCacheForTests();
    restoreQuery();
  }
});

test("clients list still works when medical history schema is missing and no history filters are used", async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = recorder.routes.find((item) => item.method === "GET" && item.path === "/");
  assert.equal(typeof route?.handler, "function");

  clearRolePermissionsCache();
  resetClientsServiceSchemaCacheForTests();
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return { rows: [] };
    }
    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [{ code: "clients.read" }]
      };
    }
    if (queryText.includes("WITH filtered_clients AS") && queryText.includes("FROM clients c")) {
      assert.equal(queryText.includes("client_medical_history_entries"), false);
      assert.deepEqual(params.slice(-2), [20, 1]);
      return {
        rows: [{
          total: 1,
          total_pages: 1,
          id: "44",
          organization_id: "3",
          first_name: "Ali",
          last_name: "Valiyev",
          middle_name: "",
          birthday: "2016-01-01",
          phone_number: "+998900000000",
          tg_mail: "",
          is_vip: false,
          created_by: "7",
          updated_by: "7",
          created_by_name: "Manager User",
          updated_by_name: "Manager User",
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
          note: "",
          history_entry_date: null,
          history_condition_name: "",
          history_symptoms: "",
          history_diagnosis: "",
          history_treatment_plan: "",
          history_note: "",
          history_specialist_name: "",
          history_specialist_position: "",
          _sort_client_id: 44
        }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await route.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: false,
          is_platform_admin: false,
          role_label: "manager",
          position_label: "staff",
          organization_allowed_features: ["clients.all_clients"]
        }
      },
      query: {},
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 200);
    assert.equal(reply.state.payload?.pagination?.total, 1);
    assert.equal(reply.state.payload?.items?.[0]?.id, "44");
  } finally {
    clearRolePermissionsCache();
    resetClientsServiceSchemaCacheForTests();
    restoreQuery();
  }
});

test("clients list returns migration-required when medical history filters are used without schema", async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = recorder.routes.find((item) => item.method === "GET" && item.path === "/");
  assert.equal(typeof route?.handler, "function");

  clearRolePermissionsCache();
  resetClientsServiceSchemaCacheForTests();
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return { rows: [] };
    }
    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [{ code: "clients.read" }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await route.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: false,
          is_platform_admin: false,
          role_label: "manager",
          position_label: "staff",
          organization_allowed_features: ["clients.all_clients"]
        }
      },
      query: {
        historyDateFrom: "2026-03-01"
      },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 409);
    assert.equal(reply.state.payload?.code, "MIGRATION_REQUIRED");
  } finally {
    clearRolePermissionsCache();
    resetClientsServiceSchemaCacheForTests();
    restoreQuery();
  }
});

test("vip class assignments endpoint scopes assigned-only users to visible classes and teachers", async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = recorder.routes.find((item) => item.method === "GET" && item.path === "/vip-class-assignments");
  assert.equal(typeof route?.handler, "function");

  clearRolePermissionsCache();
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return {
        rows: (Array.isArray(params[1]) ? params[1] : []).map((tableName) => ({ table_name: tableName }))
      };
    }
    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [
          { code: "clients.read" },
          { code: "appointments.assignments.class.read" },
          { code: "appointments.vip-clients.scope.assigned" }
        ]
      };
    }
    if (queryText.includes("FROM vip_class_teacher_assignments va")) {
      assert.match(queryText, /vta\.tutor_user_id = \$3::integer/);
      return {
        rows: [
          { id: "10", class_name: "Alpha", teacher_user_id: "7", teacher_name: "Teacher Self", children_count: 1, created_by: "7", created_by_name: "Teacher Self", created_at: "2026-03-09T00:00:00.000Z" },
          { id: "11", class_name: "Beta", teacher_user_id: "9", teacher_name: "Teacher Two", children_count: 1, created_by: "7", created_by_name: "Teacher Self", created_at: "2026-03-09T00:00:00.000Z" }
        ]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await route.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: false,
          is_platform_admin: false,
          role_label: "teacher",
          position_label: "staff",
          organization_allowed_features: ["assignments.class", "vip_clients.attendance"]
        }
      },
      query: {},
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 200);
    assert.deepEqual(reply.state.payload?.teachers, [
      { id: "7", name: "Teacher Self" },
      { id: "9", name: "Teacher Two" }
    ]);
    assert.equal(reply.state.payload?.items?.length, 2);
  } finally {
    clearRolePermissionsCache();
    restoreQuery();
  }
});

test("vip class assignment history endpoint scopes assigned-only users to related history rows", async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = recorder.routes.find((item) => item.method === "GET" && item.path === "/vip-class-assignments/history");
  assert.equal(typeof route?.handler, "function");

  clearRolePermissionsCache();
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return {
        rows: (Array.isArray(params[1]) ? params[1] : []).map((tableName) => ({ table_name: tableName }))
      };
    }
    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [
          { code: "clients.read" },
          { code: "appointments.assignments.class.read" },
          { code: "appointments.vip-clients.scope.assigned" }
        ]
      };
    }
    if (queryText.includes("FROM vip_class_teacher_assignment_history h")) {
      assert.match(queryText, /vip_client_tutor_assignment_history vth/);
      assert.match(queryText, /h\.teacher_user_id = \$\d+/);
      return {
        rows: [{
          id: "91",
          class_assignment_id: "10",
          class_name: "Alpha",
          teacher_user_id: "7",
          teacher_name: "Teacher Self",
          assigned_by: "7",
          assigned_by_name: "Teacher Self",
          assigned_at: "2026-03-08T00:00:00.000Z",
          changed_by: "7",
          changed_by_name: "Teacher Self",
          changed_at: "2026-03-09T00:00:00.000Z"
        }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await route.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: false,
          is_platform_admin: false,
          role_label: "teacher",
          position_label: "staff",
          organization_allowed_features: ["assignments.class", "vip_clients.attendance"]
        }
      },
      query: {},
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 200);
    assert.equal(reply.state.payload?.items?.[0]?.id, "91");
  } finally {
    clearRolePermissionsCache();
    restoreQuery();
  }
});

test("vip tutor assignments endpoint scopes assigned-only tutor options to visible rows", async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = recorder.routes.find((item) => item.method === "GET" && item.path === "/vip-tutor-assignments");
  assert.equal(typeof route?.handler, "function");

  clearRolePermissionsCache();
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return {
        rows: (Array.isArray(params[1]) ? params[1] : []).map((tableName) => ({ table_name: tableName }))
      };
    }
    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [
          { code: "clients.read" },
          { code: "appointments.assignments.tutor.read" },
          { code: "appointments.vip-clients.scope.assigned" }
        ]
      };
    }
    if (queryText.includes("FROM clients c") && queryText.includes("LEFT JOIN vip_client_tutor_assignments vta")) {
      assert.match(queryText, /vta\.tutor_user_id = \$3::integer/);
      return {
        rows: [
          {
            id: "44",
            organization_id: "3",
            first_name: "Ali",
            last_name: "Valiyev",
            middle_name: "",
            is_vip: true,
            class_assignment_id: "10",
            class_name: "Alpha",
            teacher_user_id: "7",
            teacher_name: "Teacher Self",
            tutor_user_id: "21",
            tutor_name: "Tutor One",
            updated_by: "7",
            updated_by_name: "Teacher Self",
            created_at: "2026-03-09T00:00:00.000Z",
            updated_at: "2026-03-09T00:00:00.000Z"
          },
          {
            id: "45",
            organization_id: "3",
            first_name: "Vali",
            last_name: "Aliyev",
            middle_name: "",
            is_vip: true,
            class_assignment_id: "11",
            class_name: "Beta",
            teacher_user_id: "9",
            teacher_name: "Teacher Two",
            tutor_user_id: "22",
            tutor_name: "Tutor Two",
            updated_by: "7",
            updated_by_name: "Teacher Self",
            created_at: "2026-03-09T00:00:00.000Z",
            updated_at: "2026-03-09T00:00:00.000Z"
          }
        ]
      };
    }
    if (queryText.includes("FROM vip_class_teacher_assignments va")) {
      assert.match(queryText, /vta\.tutor_user_id = \$3::integer/);
      return {
        rows: [{
          id: "10",
          class_name: "Alpha",
          teacher_user_id: "7",
          teacher_name: "Teacher Self"
        }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await route.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: false,
          is_platform_admin: false,
          role_label: "teacher",
          position_label: "staff",
          organization_allowed_features: ["assignments.tutor", "vip_clients.attendance"]
        }
      },
      query: {},
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 200);
    assert.deepEqual(reply.state.payload?.tutors, [
      { id: "21", name: "Tutor One" },
      { id: "22", name: "Tutor Two" }
    ]);
  } finally {
    clearRolePermissionsCache();
    restoreQuery();
  }
});

test("vip tutor assignments endpoint allows my class access without tutor assignments feature", async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = recorder.routes.find((item) => item.method === "GET" && item.path === "/vip-tutor-assignments");
  assert.equal(typeof route?.handler, "function");

  clearRolePermissionsCache();
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return {
        rows: (Array.isArray(params[1]) ? params[1] : []).map((tableName) => ({ table_name: tableName }))
      };
    }
    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [
          { code: "appointments.vip-clients.my-class" }
        ]
      };
    }
    if (queryText.includes("FROM clients c") && queryText.includes("LEFT JOIN vip_client_tutor_assignments vta")) {
      assert.match(queryText, /vta\.tutor_user_id = \$3::integer/);
      return {
        rows: [{
          id: "44",
          organization_id: "3",
          first_name: "Ali",
          last_name: "Valiyev",
          middle_name: "",
          is_vip: true,
          class_assignment_id: "10",
          class_name: "Alpha",
          teacher_user_id: "7",
          teacher_name: "Teacher Self",
          tutor_user_id: "21",
          tutor_name: "Tutor One",
          updated_by: "7",
          updated_by_name: "Teacher Self",
          created_at: "2026-03-09T00:00:00.000Z",
          updated_at: "2026-03-09T00:00:00.000Z"
        }]
      };
    }
    if (queryText.includes("FROM vip_class_teacher_assignments va")) {
      assert.match(queryText, /vta\.tutor_user_id = \$3::integer/);
      return {
        rows: [{
          id: "10",
          class_name: "Alpha",
          teacher_user_id: "7",
          teacher_name: "Teacher Self"
        }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await route.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: false,
          is_platform_admin: false,
          role_label: "teacher",
          position_label: "staff",
          organization_allowed_features: ["vip_clients.my_class"]
        }
      },
      query: {},
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 200);
    assert.equal(reply.state.payload?.items?.[0]?.id, "44");
    assert.deepEqual(reply.state.payload?.classes, [
      {
        id: "10",
        className: "Alpha",
        teacherId: "7",
        teacherName: "Teacher Self"
      }
    ]);
  } finally {
    clearRolePermissionsCache();
    restoreQuery();
  }
});

test("vip tutor assignment history endpoint scopes assigned-only users to related history rows", async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = recorder.routes.find((item) => item.method === "GET" && item.path === "/vip-tutor-assignments/history");
  assert.equal(typeof route?.handler, "function");

  clearRolePermissionsCache();
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return {
        rows: (Array.isArray(params[1]) ? params[1] : []).map((tableName) => ({ table_name: tableName }))
      };
    }
    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [
          { code: "clients.read" },
          { code: "appointments.assignments.tutor.read" },
          { code: "appointments.vip-clients.scope.assigned" }
        ]
      };
    }
    if (queryText.includes("FROM vip_client_tutor_assignment_history h")) {
      assert.match(queryText, /vip_class_teacher_assignment_history vch/);
      assert.match(queryText, /h\.tutor_user_id = \$\d+/);
      return {
        rows: [{
          id: "81",
          client_id: "44",
          first_name: "Ali",
          last_name: "Valiyev",
          middle_name: "",
          class_assignment_id: "10",
          class_name: "Alpha",
          teacher_user_id: "7",
          teacher_name: "Teacher Self",
          tutor_user_id: "21",
          tutor_name: "Tutor One",
          assigned_by: "7",
          assigned_by_name: "Teacher Self",
          assigned_at: "2026-03-08T00:00:00.000Z",
          changed_by: "7",
          changed_by_name: "Teacher Self",
          changed_at: "2026-03-09T00:00:00.000Z"
        }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await route.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: false,
          is_platform_admin: false,
          role_label: "teacher",
          position_label: "staff",
          organization_allowed_features: ["assignments.tutor", "vip_clients.attendance"]
        }
      },
      query: {},
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 200);
    assert.equal(reply.state.payload?.items?.[0]?.id, "81");
  } finally {
    clearRolePermissionsCache();
    restoreQuery();
  }
});

test("vip class assignments route returns migration-required when assignment schema is missing", async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = recorder.routes.find((item) => item.method === "GET" && item.path === "/vip-class-assignments");
  assert.equal(typeof route?.handler, "function");

  clearRolePermissionsCache();
  resetClientsServiceSchemaCacheForTests();
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return { rows: [] };
    }
    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [{ code: "appointments.assignments.class.read" }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await route.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: false,
          is_platform_admin: false,
          role_label: "teacher",
          position_label: "staff",
          organization_allowed_features: ["assignments.class", "vip_clients.attendance"]
        }
      },
      query: {},
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 409);
    assert.equal(reply.state.payload?.code, "MIGRATION_REQUIRED");
  } finally {
    clearRolePermissionsCache();
    resetClientsServiceSchemaCacheForTests();
    restoreQuery();
  }
});

test("vip client search returns migration-required when vip schema is missing", async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = recorder.routes.find((item) => item.method === "GET" && item.path === "/search");
  assert.equal(typeof route?.handler, "function");

  clearRolePermissionsCache();
  resetClientsServiceSchemaCacheForTests();
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return { rows: [] };
    }
    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [{ code: "appointments.vip-clients.read" }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await route.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: false,
          is_platform_admin: false,
          role_label: "teacher",
          position_label: "staff",
          organization_allowed_features: ["vip_clients.attendance"]
        }
      },
      query: {
        isVip: "true"
      },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 409);
    assert.equal(reply.state.payload?.code, "MIGRATION_REQUIRED");
  } finally {
    clearRolePermissionsCache();
    resetClientsServiceSchemaCacheForTests();
    restoreQuery();
  }
});

test("vip daily routines list returns migration-required when specialist schema columns are missing", async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = recorder.routes.find((item) => item.method === "GET" && item.path === "/vip-class-daily-routines");
  assert.equal(typeof route?.handler, "function");

  clearRolePermissionsCache();
  resetClientsServiceSchemaCacheForTests();
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return {
        rows: [
          { table_name: "vip_class_teacher_assignments" },
          { table_name: "vip_client_tutor_assignments" },
          { table_name: "vip_class_teacher_assignment_history" },
          { table_name: "vip_client_tutor_assignment_history" },
          { table_name: "vip_class_daily_routines" }
        ]
      };
    }
    if (queryText.includes("FROM information_schema.columns")) {
      return {
        rows: [
          { column_name: "organization_id" },
          { column_name: "class_assignment_id" },
          { column_name: "day_of_week" },
          { column_name: "activity_type" },
          { column_name: "start_time" },
          { column_name: "end_time" },
          { column_name: "note" },
          { column_name: "created_by" },
          { column_name: "updated_by" },
          { column_name: "created_at" },
          { column_name: "updated_at" }
        ]
      };
    }
    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [
          { code: "appointments.vip-clients.read" },
          { code: "appointments.vip-clients.daily-routines" },
          { code: "appointments.vip-clients.scope.all" }
        ]
      };
    }
    if (queryText.includes("FROM vip_class_teacher_assignments va")) {
      return { rows: [] };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await route.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: false,
          is_platform_admin: false,
          role_label: "teacher",
          position_label: "staff",
          organization_allowed_features: ["vip_clients.daily_routines"]
        }
      },
      query: { limit: "2000" },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 409);
    assert.equal(reply.state.payload?.code, "MIGRATION_REQUIRED");
    assert.deepEqual(reply.state.payload?.details?.missingColumns?.vip_class_daily_routines, [
      "specialist_user_id",
      "mandatory_exercises"
    ]);
  } finally {
    clearRolePermissionsCache();
    resetClientsServiceSchemaCacheForTests();
    restoreQuery();
  }
});
