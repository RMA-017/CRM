import assert from "node:assert/strict";
import test from "node:test";

const poolModule = await import("../src/config/db.js");
const notificationsRoutesModule = await import("../src/modules/notifications/notifications.routes.js");
const notificationsServiceModule = await import("../src/modules/notifications/notifications.service.js");

const pool = poolModule.default;
const notificationsRoutes = notificationsRoutesModule.default;
const { resolveNotificationRecipientIds } = notificationsServiceModule;

function stubPoolQuery(implementation) {
  const originalQuery = pool.query.bind(pool);
  pool.query = implementation;
  return () => {
    pool.query = originalQuery;
  };
}

function stubPoolConnect(implementation) {
  const originalConnect = pool.connect.bind(pool);
  pool.connect = implementation;
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
      patch: (path, optionsOrHandler, maybeHandler) => record("PATCH", path, optionsOrHandler, maybeHandler),
      delete: (path, optionsOrHandler, maybeHandler) => record("DELETE", path, optionsOrHandler, maybeHandler)
    }
  };
}

test("resolveNotificationRecipientIds maps manager semantic target to localized manager roles", async () => {
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM users u") && queryText.includes("JOIN role_options r")) {
      assert.match(queryText, /COALESCE\(r\.is_admin,\s*FALSE\)\s*=\s*TRUE/);
      assert.match(queryText, /COALESCE\(u\.is_platform_admin,\s*FALSE\)\s*=\s*TRUE/);
      assert.equal(params[4], true);
      return {
        rows: [
          { id: 18 },
          { id: 21 }
        ]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const recipientUserIds = await resolveNotificationRecipientIds({
      organizationId: 3,
      targetRoles: ["manager"]
    });

    assert.deepEqual(recipientUserIds, [18, 21]);
  } finally {
    restoreQuery();
  }
});

test("resolveNotificationRecipientIds keeps non-manager role targets exact", async () => {
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM users u") && queryText.includes("JOIN role_options r")) {
      assert.deepEqual(params[2], ["specialist"]);
      return {
        rows: [{ id: 31 }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const recipientUserIds = await resolveNotificationRecipientIds({
      organizationId: 3,
      targetRoles: ["specialist"]
    });

    assert.deepEqual(recipientUserIds, [31]);
  } finally {
    restoreQuery();
  }
});

test("resolveNotificationRecipientIds excludes direct target users with inactive roles", async () => {
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM users u") && queryText.includes("JOIN role_options r")) {
      assert.deepEqual(params[1], [41, 42]);
      return {
        rows: [{ id: 41 }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const recipientUserIds = await resolveNotificationRecipientIds({
      organizationId: 3,
      targetUserIds: [41, 42]
    });

    assert.deepEqual(recipientUserIds, [41]);
  } finally {
    restoreQuery();
  }
});

test("notifications send fallback returns 400 when schema is missing and no recipients match", async () => {
  const recorder = createRouteRecorder();
  await notificationsRoutes(recorder.fastify);

  const route = recorder.routes.find((item) => item.method === "POST" && item.path === "/send");
  assert.equal(typeof route?.handler, "function");

  const restoreConnect = stubPoolConnect(async () => ({
    async query(sql, params = []) {
      const queryText = String(sql || "");
      if (queryText === "BEGIN") {
        return { rows: [] };
      }
      if (queryText.includes("FROM users u") && queryText.includes("JOIN role_options r")) {
        return { rows: [{ id: 99 }] };
      }
      if (queryText.includes("INSERT INTO user_notifications")) {
        const error = new Error('relation "user_notifications" does not exist');
        error.code = "42P01";
        throw error;
      }
      if (queryText === "ROLLBACK") {
        return { rows: [] };
      }
      throw new Error(`Unexpected connect query in test: ${queryText}`);
    },
    release() {}
  }));
  const restoreQuery = stubPoolQuery(async (sql) => {
    const queryText = String(sql || "");
    if (queryText.includes("FROM users u") && queryText.includes("JOIN role_options r")) {
      return { rows: [] };
    }
    throw new Error(`Unexpected pool query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    await route.handler(
      {
        authContext: {
          organizationId: 3,
          userId: 7,
          username: "actor",
          requester: {
            id: 7,
            role_id: 11,
            is_admin: true,
            is_platform_admin: false
          }
        },
        body: {
          message: "Hello",
          targetUserIds: [99]
        },
        log: { error() {} }
      },
      reply
    );

    assert.equal(reply.state.statusCode, 400);
    assert.equal(reply.state.payload?.message, "No matching recipients found.");
    assert.equal(reply.state.payload?.schemaReady, false);
  } finally {
    restoreConnect();
    restoreQuery();
  }
});
