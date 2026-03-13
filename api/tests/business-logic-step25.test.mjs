import assert from "node:assert/strict";
import test from "node:test";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";

const poolModule = await import("../src/config/db.js");
const createUserRoutesModule = await import("../src/modules/create-user/create-user.routes.js");
const usersRoutesModule = await import("../src/modules/users/users.routes.js");
const usersServiceModule = await import("../src/modules/users/users.service.js");
const settingsRoutesModule = await import("../src/modules/settings/settings.routes.js");
const accessModule = await import("../src/modules/users/access.service.js");

const pool = poolModule.default;
const createUserRoutes = createUserRoutesModule.default;
const usersRoutes = usersRoutesModule.default;
const { getUserScopeById, updateUserByAdmin } = usersServiceModule;
const settingsRoutes = settingsRoutesModule.default;
const { clearRolePermissionsCache } = accessModule;

function stubPoolQuery(implementation) {
  const originalQuery = pool.query.bind(pool);
  pool.query = implementation;
  return () => {
    pool.query = originalQuery;
  };
}

function stubPoolConnect(clientImplementation) {
  const originalConnect = pool.connect.bind(pool);
  pool.connect = async () => {
    const client = {
      query: clientImplementation,
      release() {}
    };
    return client;
  };
  return () => {
    pool.connect = originalConnect;
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

function createRouteRecorder() {
  const routes = [];
  return {
    routes,
    fastify: {
      apiRateLimit: { max: 1, timeWindow: 1000 },
      get(path, options, handler) {
        routes.push({ method: "GET", path, options, handler });
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

test("create-user route respects users org feature gate", async () => {
  const recorder = createRouteRecorder();
  await createUserRoutes(recorder.fastify);

  const createUserRoute = recorder.routes.find((route) => route.method === "POST" && route.path === "/");
  assert.equal(typeof createUserRoute?.handler, "function");

  const seenQueries = [];
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");
    seenQueries.push({ queryText, params });

    if (queryText.includes("FROM users u") && queryText.includes("o.allowed_features AS organization_allowed_features")) {
      return {
        rows: [{
          id: 7,
          role_id: 11,
          is_admin: true,
          is_platform_admin: false,
          organization_id: 3,
          organization_allowed_features: []
        }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText} :: ${JSON.stringify(params)}`);
  });

  try {
    const reply = createReplyRecorder();
    await createUserRoute.handler({
      authContext: {
        userId: 7,
        organizationId: 3
      },
      body: {
        username: "new.user",
        fullName: "New User",
        role: "5"
      },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 403);
    assert.equal(reply.state.payload?.message, "Forbidden.");
    assert.equal(seenQueries.length, 1);
  } finally {
    restoreQuery();
  }
});

test("users update blocks non-platform admins from managing admin users", async () => {
  const recorder = createRouteRecorder();
  await usersRoutes(recorder.fastify);

  const usersPatchRoute = recorder.routes.find((route) => route.method === "PATCH" && route.path === "/:id");
  assert.equal(typeof usersPatchRoute?.handler, "function");

  clearRolePermissionsCache();
  const restoreQuery = stubPoolQuery(async (sql) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return { rows: [{ code: "users.update" }] };
    }
    if (queryText.includes("FROM users u") && queryText.includes("LEFT JOIN role_options r ON r.id = u.role_id")) {
      return {
        rows: [{
          id: "9",
          organization_id: "3",
          role_id: "22",
          is_admin: true,
          is_platform_admin: false
        }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await usersPatchRoute.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: true,
          is_platform_admin: false,
          organization_id: 3,
          organization_allowed_features: ["users.all_users"]
        }
      },
      params: { id: "9" },
      body: {
        username: "target.user",
        email: "",
        fullName: "Target User",
        birthday: "2000-01-01",
        phone: "",
        role: "22",
        organizationCode: ""
      },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 403);
    assert.equal(reply.state.payload?.message, "Only platform admin can manage admin users.");
  } finally {
    clearRolePermissionsCache();
    restoreQuery();
  }
});

test("users delete blocks non-platform admins from managing admin users", async () => {
  const recorder = createRouteRecorder();
  await usersRoutes(recorder.fastify);

  const usersDeleteRoute = recorder.routes.find((route) => route.method === "DELETE" && route.path === "/:id");
  assert.equal(typeof usersDeleteRoute?.handler, "function");

  clearRolePermissionsCache();
  const restoreQuery = stubPoolQuery(async (sql) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return { rows: [{ code: "users.delete" }] };
    }
    if (queryText.includes("FROM users u") && queryText.includes("LEFT JOIN role_options r ON r.id = u.role_id")) {
      return {
        rows: [{
          id: "9",
          organization_id: "3",
          role_id: "22",
          is_admin: true,
          is_platform_admin: false
        }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await usersDeleteRoute.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: true,
          is_platform_admin: false,
          organization_id: 3,
          organization_allowed_features: ["users.all_users"]
        }
      },
      params: { id: "9" },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 403);
    assert.equal(reply.state.payload?.message, "Only platform admin can manage admin users.");
  } finally {
    clearRolePermissionsCache();
    restoreQuery();
  }
});

test("settings role update blocks deactivation when users are still assigned", async () => {
  const recorder = createRouteRecorder();
  await settingsRoutes(recorder.fastify);

  const rolePatchRoute = recorder.routes.find((route) => route.method === "PATCH" && route.path === "/roles/:id");
  assert.equal(typeof rolePatchRoute?.handler, "function");

  clearRolePermissionsCache();
  const restoreQuery = stubPoolQuery(async (sql) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return { rows: [{ code: "settings.roles.update" }] };
    }
    if (queryText.includes("SELECT") && queryText.includes("FROM role_options r") && queryText.includes("permission_codes")) {
      return {
        rows: [{
          id: 14,
          organization_id: 3,
          label: "Managers",
          sort_order: 0,
          is_admin: false,
          is_active: true,
          created_at: new Date().toISOString(),
          permission_codes: []
        }]
      };
    }

    throw new Error(`Unexpected pool.query in test: ${queryText}`);
  });
  const restoreConnect = stubPoolConnect(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText === "BEGIN" || queryText === "ROLLBACK") {
      return { rows: [], rowCount: 0 };
    }
    if (queryText.includes("SELECT is_admin") && queryText.includes("FROM role_options")) {
      return {
        rows: [{ is_admin: false }],
        rowCount: 1
      };
    }
    if (queryText.includes("SELECT COUNT(*)::int AS total") && queryText.includes("FROM users")) {
      return {
        rows: [{ total: 2 }],
        rowCount: 1
      };
    }

    throw new Error(`Unexpected client.query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await rolePatchRoute.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: true,
          is_platform_admin: false,
          organization_id: 3,
          organization_allowed_features: ["settings.roles"]
        }
      },
      params: { id: "14" },
      body: {
        label: "Managers",
        sortOrder: 0,
        isActive: false,
        permissionCodes: []
      },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 409);
    assert.equal(reply.state.payload?.field, "isActive");
  } finally {
    clearRolePermissionsCache();
    restoreConnect();
    restoreQuery();
  }
});

test("users update blocks self role changes through admin route", async () => {
  const recorder = createRouteRecorder();
  await usersRoutes(recorder.fastify);

  const usersPatchRoute = recorder.routes.find((route) => route.method === "PATCH" && route.path === "/:id");
  assert.equal(typeof usersPatchRoute?.handler, "function");

  clearRolePermissionsCache();
  const restoreQuery = stubPoolQuery(async (sql) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return { rows: [{ code: "users.update" }] };
    }
    if (queryText.includes("FROM users u") && queryText.includes("LEFT JOIN role_options r ON r.id = u.role_id")) {
      return {
        rows: [{
          id: "7",
          organization_id: "3",
          role_id: "22",
          is_admin: false,
          is_platform_admin: false
        }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await usersPatchRoute.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: true,
          is_platform_admin: false,
          organization_id: 3,
          organization_allowed_features: ["users.all_users"]
        }
      },
      params: { id: "7" },
      body: {
        username: "self.user",
        email: "",
        fullName: "Self User",
        birthday: "2000-01-01",
        phone: "",
        role: "25",
        organizationCode: ""
      },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 400);
    assert.equal(reply.state.payload?.field, "role");
  } finally {
    clearRolePermissionsCache();
    restoreQuery();
  }
});

test("users update preserves legacy username when edit keeps the same value", async () => {
  const restoreConnect = stubPoolConnect(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText === "BEGIN" || queryText === "COMMIT" || queryText === "ROLLBACK") {
      return { rows: [], rowCount: 0 };
    }
    if (queryText.includes("SELECT role_id, username") && queryText.includes("FROM users")) {
      return {
        rows: [{ role_id: 22, username: "LegacyUser" }],
        rowCount: 1
      };
    }
    if (queryText.includes("SELECT label FROM role_options")) {
      return {
        rows: [{ label: "Manager" }],
        rowCount: 1
      };
    }
    if (queryText.includes("UPDATE users")) {
      assert.equal(params[1], "LegacyUser");
      return {
        rows: [],
        rowCount: 1
      };
    }
    if (queryText.includes("SELECT") && queryText.includes("FROM users u") && queryText.includes("JOIN organizations o ON o.id = u.organization_id")) {
      return {
        rows: [{
          id: "9",
          organization_id: "3",
          organization_code: "main",
          organization_name: "Main",
          username: "LegacyUser",
          email: null,
          full_name: "Target User",
          birthday: "2000-01-01",
          role_id: "22",
          role: "Manager",
          phone_number: null,
          position_id: null,
          position: null,
          created_at: "2026-03-12T00:00:00.000Z"
        }],
        rowCount: 1
      };
    }
    if (queryText === "COMMIT") {
      return { rows: [], rowCount: 0 };
    }

    throw new Error(`Unexpected client.query in test: ${queryText} :: ${JSON.stringify(params)}`);
  });

  try {
    const user = await updateUserByAdmin({
      currentOrganizationId: 3,
      nextOrganizationId: null,
      actorUserId: 7,
      userId: 9,
      username: "legacyuser",
      email: "",
      fullName: "Target User",
      birthday: "2000-01-01",
      phone: "",
      positionId: null,
      roleId: 22,
      password: ""
    });

    assert.equal(user?.username, "LegacyUser");
  } finally {
    restoreConnect();
  }
});

test("getUserScopeById queries users id without ambiguous column reference", async () => {
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    assert.match(queryText, /WHERE u\.id = \$1/);
    assert.equal(params[0], 9);

    return {
      rows: [{
        id: "9",
        organization_id: "3",
        role_id: "22",
        is_admin: false,
        is_platform_admin: false
      }]
    };
  });

  try {
    const user = await getUserScopeById(9);
    assert.equal(user?.id, "9");
  } finally {
    restoreQuery();
  }
});

test("users update maps cross-organization transfer conflicts to 409", async () => {
  const recorder = createRouteRecorder();
  await usersRoutes(recorder.fastify);

  const usersPatchRoute = recorder.routes.find((route) => route.method === "PATCH" && route.path === "/:id");
  assert.equal(typeof usersPatchRoute?.handler, "function");

  clearRolePermissionsCache();
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return { rows: [{ code: "users.update" }] };
    }
    if (queryText.includes("FROM users u") && queryText.includes("LEFT JOIN role_options r ON r.id = u.role_id")) {
      return {
        rows: [{
          id: "9",
          organization_id: "3",
          role_id: "22",
          is_admin: false,
          is_platform_admin: false
        }]
      };
    }
    if (queryText.includes("FROM organizations") && queryText.includes("LOWER(code) = LOWER($1)")) {
      return {
        rows: [{
          id: 5,
          code: "branch-b",
          is_active: true
        }]
      };
    }
    if (queryText.includes("FROM role_options") && queryText.includes("SELECT id, organization_id, label, is_admin, is_active")) {
      return {
        rows: [{
          id: 22,
          organization_id: 5,
          label: "Manager",
          is_admin: false,
          is_active: true
        }]
      };
    }

    throw new Error(`Unexpected pool.query in test: ${queryText} :: ${JSON.stringify(params)}`);
  });
  const restoreConnect = stubPoolConnect(async (sql) => {
    const queryText = String(sql || "");

    if (queryText === "BEGIN" || queryText === "ROLLBACK") {
      return { rows: [], rowCount: 0 };
    }
    if (queryText.includes("SELECT role_id") && queryText.includes("FROM users")) {
      return {
        rows: [{ role_id: 22 }],
        rowCount: 1
      };
    }
    if (queryText.includes("SELECT label FROM role_options")) {
      return {
        rows: [{ label: "Manager" }],
        rowCount: 1
      };
    }
    if (queryText.includes("UPDATE users")) {
      const error = new Error("fk violation");
      error.code = "23503";
      throw error;
    }

    throw new Error(`Unexpected client.query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await usersPatchRoute.handler({
      authContext: {
        userId: 1,
        organizationId: 3,
        requester: {
          id: 1,
          role_id: 11,
          is_admin: true,
          is_platform_admin: true,
          organization_id: 3,
          organization_allowed_features: null
        }
      },
      params: { id: "9" },
      body: {
        username: "target.user",
        email: "",
        fullName: "Target User",
        birthday: "2000-01-01",
        phone: "",
        role: "22",
        organizationCode: "branch-b"
      },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 409);
    assert.equal(reply.state.payload?.field, "organizationCode");
  } finally {
    clearRolePermissionsCache();
    restoreConnect();
    restoreQuery();
  }
});

test("users delete maps linked-record conflicts to 409", async () => {
  const recorder = createRouteRecorder();
  await usersRoutes(recorder.fastify);

  const usersDeleteRoute = recorder.routes.find((route) => route.method === "DELETE" && route.path === "/:id");
  assert.equal(typeof usersDeleteRoute?.handler, "function");

  clearRolePermissionsCache();
  const restoreQuery = stubPoolQuery(async (sql) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return { rows: [{ code: "users.delete" }] };
    }
    if (queryText.includes("FROM users u") && queryText.includes("LEFT JOIN role_options r ON r.id = u.role_id")) {
      return {
        rows: [{
          id: "9",
          organization_id: "3",
          role_id: "22",
          is_admin: false,
          is_platform_admin: false
        }]
      };
    }
    if (queryText.startsWith("DELETE FROM users")) {
      const error = new Error("fk violation");
      error.code = "23503";
      throw error;
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await usersDeleteRoute.handler({
      authContext: {
        userId: 7,
        organizationId: 3,
        requester: {
          id: 7,
          role_id: 11,
          is_admin: true,
          is_platform_admin: false,
          organization_id: 3,
          organization_allowed_features: ["users.all_users"]
        }
      },
      params: { id: "9" },
      log: { error() {} }
    }, reply);

    assert.equal(reply.state.statusCode, 409);
    assert.equal(reply.state.payload?.message, "User has linked records and cannot be deleted.");
  } finally {
    clearRolePermissionsCache();
    restoreQuery();
  }
});
