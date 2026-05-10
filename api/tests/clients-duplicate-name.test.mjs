import assert from "node:assert/strict";
import test from "node:test";

const poolModule = await import("../src/config/db.js");
const accessModule = await import("../src/modules/users/access.service.js");
const clientsRoutesModule = await import("../src/modules/clients/clients.routes.js");

const pool = poolModule.default;
const { clearRolePermissionsCache } = accessModule;
const clientsRoutes = clientsRoutesModule.default;

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

function createAuthContext() {
  return {
    userId: 7,
    organizationId: 5,
    requester: {
      id: 7,
      role_id: 11,
      is_admin: false,
      is_platform_admin: false,
      role_label: "manager",
      position_label: "staff",
      organization_allowed_features: ["clients.all_clients"]
    },
  };
}

test("client create blocks duplicate normalized full name before insert", { concurrency: false }, async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = findRoute(recorder.routes, "POST", "/");
  assert.equal(typeof route?.handler, "function");

  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [{ code: "clients.create" }]
      };
    }

    if (
      queryText.includes("FROM clients c")
      && queryText.includes("LOWER(TRIM(c.first_name)) = $2")
      && queryText.includes("LOWER(TRIM(COALESCE(c.middle_name, ''))) = $4")
    ) {
      assert.deepEqual(params, [5, "ali", "valiyev", "bek"]);
      return {
        rows: [{
          id: "22",
          first_name: "Ali",
          last_name: "Valiyev",
          middle_name: "Bek"
        }]
      };
    }

    if (queryText.includes("INSERT INTO clients")) {
      throw new Error("Insert should not run when duplicate client name exists.");
    }

    throw new Error(`Unexpected query in test: ${queryText} :: ${JSON.stringify(params)}`);
  });

  try {
    clearRolePermissionsCache();

    const reply = createReplyRecorder();
    await route.handler({
      authContext: createAuthContext(),
      body: {
        firstName: "  Ali  ",
        lastName: "Valiyev",
        middleName: "Bek",
        birthday: "2020-01-01",
        phone: "",
        tgMail: "",
        note: ""
      },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 409);
    assert.deepEqual(reply.state.payload, {
      field: "firstName",
      message: "Client with the same first name, last name, and middle name already exists."
    });
  } finally {
    clearRolePermissionsCache();
    restoreQuery();
  }
});

test("client create persists VIP flag", { concurrency: false }, async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = findRoute(recorder.routes, "POST", "/");
  assert.equal(typeof route?.handler, "function");

  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [{ code: "clients.create" }]
      };
    }

    if (
      queryText.includes("FROM clients c")
      && queryText.includes("LOWER(TRIM(c.first_name)) = $2")
      && queryText.includes("LOWER(TRIM(COALESCE(c.middle_name, ''))) = $4")
    ) {
      return { rows: [] };
    }

    if (queryText.includes("INSERT INTO clients")) {
      assert.match(queryText, /\bis_vip\b/);
      assert.deepEqual(params, [
        5,
        "Ali",
        "Valiyev",
        null,
        "2020-01-01",
        "+998901234567",
        null,
        true,
        7,
        7,
        null
      ]);
      return {
        rows: [{
          id: "44",
          organization_id: "5",
          first_name: "Ali",
          last_name: "Valiyev",
          middle_name: null,
          birthday: "2020-01-01",
          phone_number: "+998901234567",
          tg_mail: null,
          is_vip: true,
          created_by: "7",
          updated_by: "7",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
          note: null
        }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText} :: ${JSON.stringify(params)}`);
  });

  try {
    clearRolePermissionsCache();

    const reply = createReplyRecorder();
    await route.handler({
      authContext: createAuthContext(),
      body: {
        firstName: "Ali",
        lastName: "Valiyev",
        middleName: "",
        birthday: "2020-01-01",
        phone: "90 123 45 67",
        tgMail: "",
        note: "",
        isVip: true
      },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 201);
    assert.equal(reply.state.payload?.item?.isVip, true);
  } finally {
    clearRolePermissionsCache();
    restoreQuery();
  }
});

test("client update blocks duplicate normalized full name before update", { concurrency: false }, async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = findRoute(recorder.routes, "PATCH", "/:id");
  assert.equal(typeof route?.handler, "function");

  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [{ code: "clients.update" }]
      };
    }

    if (
      queryText.includes("FROM clients c")
      && queryText.includes("LOWER(TRIM(c.first_name)) = $2")
      && queryText.includes("AND c.id <> $5")
    ) {
      assert.deepEqual(params, [5, "ali", "valiyev", "bek", 44]);
      return {
        rows: [{
          id: "22",
          first_name: "Ali",
          last_name: "Valiyev",
          middle_name: "Bek"
        }]
      };
    }

    if (queryText.includes("UPDATE clients")) {
      throw new Error("Update should not run when duplicate client name exists.");
    }

    throw new Error(`Unexpected query in test: ${queryText} :: ${JSON.stringify(params)}`);
  });

  try {
    clearRolePermissionsCache();

    const reply = createReplyRecorder();
    await route.handler({
      authContext: createAuthContext(),
      params: {
        id: "44"
      },
      body: {
        firstName: "Ali",
        lastName: "Valiyev",
        middleName: "Bek",
        birthday: "2020-01-01",
        phone: "",
        tgMail: "",
        note: ""
      },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 409);
    assert.deepEqual(reply.state.payload, {
      field: "firstName",
      message: "Client with the same first name, last name, and middle name already exists."
    });
  } finally {
    clearRolePermissionsCache();
    restoreQuery();
  }
});

test("client update persists VIP flag", { concurrency: false }, async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = findRoute(recorder.routes, "PATCH", "/:id");
  assert.equal(typeof route?.handler, "function");

  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [{ code: "clients.update" }]
      };
    }

    if (
      queryText.includes("FROM clients c")
      && queryText.includes("LOWER(TRIM(c.first_name)) = $2")
      && queryText.includes("AND c.id <> $5")
    ) {
      return { rows: [] };
    }

    if (queryText.includes("UPDATE clients")) {
      assert.match(queryText, /is_vip\s*=\s*\$8/);
      assert.deepEqual(params, [
        "Ali",
        "Valiyev",
        null,
        "2020-01-01",
        "+79161234567",
        null,
        null,
        true,
        7,
        44,
        5
      ]);
      return {
        rows: [{
          id: "44",
          organization_id: "5",
          first_name: "Ali",
          last_name: "Valiyev",
          middle_name: null,
          birthday: "2020-01-01",
          phone_number: "+79161234567",
          tg_mail: null,
          is_vip: true,
          created_by: "7",
          updated_by: "7",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
          note: null
        }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText} :: ${JSON.stringify(params)}`);
  });

  try {
    clearRolePermissionsCache();

    const reply = createReplyRecorder();
    await route.handler({
      authContext: createAuthContext(),
      params: {
        id: "44"
      },
      body: {
        firstName: "Ali",
        lastName: "Valiyev",
        middleName: "",
        birthday: "2020-01-01",
        phone: "8 (916) 123-45-67",
        tgMail: "",
        note: "",
        isVip: true
      },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 200);
    assert.equal(reply.state.payload?.item?.isVip, true);
  } finally {
    clearRolePermissionsCache();
    restoreQuery();
  }
});

test("client update to inactive removes future planner lessons", { concurrency: false }, async () => {
  const recorder = createRouteRecorder();
  await clientsRoutes(recorder.fastify);

  const route = findRoute(recorder.routes, "PATCH", "/:id");
  assert.equal(typeof route?.handler, "function");

  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return {
        rows: [{ code: "clients.update" }]
      };
    }

    if (
      queryText.includes("FROM clients c")
      && queryText.includes("LOWER(TRIM(c.first_name)) = $2")
      && queryText.includes("AND c.id <> $5")
    ) {
      return { rows: [] };
    }

    if (queryText.includes("UPDATE clients")) {
      assert.match(queryText, /DELETE FROM appointment_schedules s/);
      assert.match(queryText, /\$8::boolean = FALSE/);
      assert.deepEqual(params, [
        "Ali",
        "Valiyev",
        null,
        "2020-01-01",
        null,
        null,
        null,
        false,
        7,
        44,
        5
      ]);
      return {
        rows: [{
          id: "44",
          organization_id: "5",
          first_name: "Ali",
          last_name: "Valiyev",
          middle_name: null,
          birthday: "2020-01-01",
          phone_number: null,
          tg_mail: null,
          is_vip: false,
          created_by: "7",
          updated_by: "7",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
          note: null,
          deleted_future_appointment_count: 2
        }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText} :: ${JSON.stringify(params)}`);
  });

  try {
    clearRolePermissionsCache();

    const reply = createReplyRecorder();
    await route.handler({
      authContext: createAuthContext(),
      params: {
        id: "44"
      },
      body: {
        firstName: "Ali",
        lastName: "Valiyev",
        middleName: "",
        birthday: "2020-01-01",
        phone: "",
        tgMail: "",
        note: "",
        isVip: false
      },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 200);
    assert.equal(reply.state.payload?.item?.isVip, false);
  } finally {
    clearRolePermissionsCache();
    restoreQuery();
  }
});
