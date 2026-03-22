import assert from "node:assert/strict";
import test from "node:test";

const poolModule = await import("../src/config/db.js");
const accessModule = await import("../src/modules/users/access.service.js");
const clientsRoutesModule = await import("../src/modules/clients/clients.routes.js");
const clientsServiceModule = await import("../src/modules/clients/clients.service.js");

const pool = poolModule.default;
const { clearRolePermissionsCache } = accessModule;
const clientsRoutes = clientsRoutesModule.default;
const { resetClientsServiceSchemaCacheForTests } = clientsServiceModule;

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
    status(code) {
      state.statusCode = code;
      return this;
    },
    send(payload) {
      state.payload = payload;
      return this;
    },
    header(name, value) {
      state.headers[name] = value;
      return this;
    }
  };
}

function createClientsRouteRecorder() {
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

function findRecordedRoute(routes, method, path) {
  return routes.find((route) => route.method === method && route.path === path);
}

test("vip attendance history route allows statistics readers without clients.read", { concurrency: false }, async () => {
  const recorder = createClientsRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const historyRoute = findRecordedRoute(recorder.routes, "GET", "/vip-attendance/history");
  assert.equal(typeof historyRoute?.handler, "function");

  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [
          { code: "appointments.statistics.class-attendance" }
        ]
      };
    }

    if (queryText.includes("FROM information_schema.tables")) {
      const tableNames = Array.isArray(params?.[1]) ? params[1] : [];
      return {
        rows: tableNames.map((tableName) => ({ table_name: tableName }))
      };
    }

    if (queryText.includes("FROM vip_client_attendance vca")) {
      return {
        rows: [
          {
            id: "1",
            client_id: "101",
            first_name: "Ali",
            last_name: "Valiyev",
            middle_name: "",
            class_id: "201",
            class_name: "Morning Group",
            teacher_user_id: "301",
            teacher_name: "Teacher One",
            tutor_user_id: "401",
            tutor_name: "Tutor One",
            attendance_date: "2026-03-10",
            status: "present",
            arrived_at: null,
            left_at: null,
            note: "",
            updated_at: "2026-03-10T08:00:00.000Z"
          }
        ]
      };
    }

    if (queryText.includes("FROM vip_class_teacher_assignments va")) {
      return {
        rows: [
          {
            id: "201",
            class_name: "Morning Group",
            teacher_user_id: "301",
            teacher_name: "Teacher One"
          }
        ]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText} :: ${JSON.stringify(params)}`);
  });

  try {
    clearRolePermissionsCache();
    resetClientsServiceSchemaCacheForTests();

    const reply = createReplyRecorder();
    await historyRoute.handler({
      authContext: {
        userId: 77,
        organizationId: 5,
        requester: {
          id: 77,
          role_id: 9,
          is_admin: false,
          is_platform_admin: false,
          role_label: "Specialist",
          position_label: "Tutor",
          organization_allowed_features: ["statistics.class_attendance"]
        }
      },
      query: {
        from: "2026-03-01",
        to: "2026-03-16",
        limit: "25"
      },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 200);
    assert.equal(Array.isArray(reply.state.payload?.items), true);
    assert.equal(reply.state.payload?.items.length, 1);
    assert.equal(reply.state.payload?.items[0]?.id, "1");
  } finally {
    clearRolePermissionsCache();
    resetClientsServiceSchemaCacheForTests();
    restoreQuery();
  }
});

test("vip attendance history filters only expose educator and tutor positions in report selects", { concurrency: false }, async () => {
  const recorder = createClientsRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const historyRoute = findRecordedRoute(recorder.routes, "GET", "/vip-attendance/history");
  assert.equal(typeof historyRoute?.handler, "function");

  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [
          { code: "appointments.statistics.class-attendance" }
        ]
      };
    }

    if (queryText.includes("FROM information_schema.tables")) {
      const tableNames = Array.isArray(params?.[1]) ? params[1] : [];
      return {
        rows: tableNames.map((tableName) => ({ table_name: tableName }))
      };
    }

    if (queryText.includes("FROM vip_client_attendance vca")) {
      return { rows: [] };
    }

    if (queryText.includes("FROM vip_class_teacher_assignments va")) {
      return {
        rows: [
          {
            id: "201",
            class_name: "Morning Group",
            teacher_user_id: "301",
            teacher_name: "Educator One"
          }
        ]
      };
    }

    if (
      queryText.includes("FROM users u")
      && queryText.includes("LEFT JOIN position_options p ON p.id = u.position_id")
      && queryText.includes("LOWER(TRIM(COALESCE(p.label, '')))")
    ) {
      const normalizedPosition = String(params?.[1] || "").trim().toLowerCase();
      if (normalizedPosition === "educator") {
        return {
          rows: [
            { id: "301", name: "Educator One" }
          ]
        };
      }
      if (normalizedPosition === "tutor") {
        return {
          rows: [
            { id: "401", name: "Tutor One" }
          ]
        };
      }
    }

    if (queryText.includes("FROM clients c") && queryText.includes("AND c.is_vip = TRUE")) {
      return {
        rows: [
          {
            id: "101",
            first_name: "Ali",
            last_name: "Valiyev",
            middle_name: ""
          }
        ]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText} :: ${JSON.stringify(params)}`);
  });

  try {
    clearRolePermissionsCache();
    resetClientsServiceSchemaCacheForTests();

    const reply = createReplyRecorder();
    await historyRoute.handler({
      authContext: {
        userId: 77,
        organizationId: 5,
        requester: {
          id: 77,
          role_id: 9,
          is_admin: true,
          is_platform_admin: false,
          role_label: "Administrator",
          position_label: "Manager",
          organization_allowed_features: ["statistics.class_attendance"]
        }
      },
      query: {
        from: "2026-03-01",
        to: "2026-03-16",
        limit: "25"
      },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 200);
    assert.deepEqual(reply.state.payload?.teachers, [
      { id: "301", name: "Educator One" }
    ]);
    assert.deepEqual(reply.state.payload?.tutors, [
      { id: "401", name: "Tutor One" }
    ]);
  } finally {
    clearRolePermissionsCache();
    resetClientsServiceSchemaCacheForTests();
    restoreQuery();
  }
});
