import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";

const poolModule = await import("../src/config/db.js");
const sessionModule = await import("../src/lib/session.js");
const cookiesModule = await import("../src/lib/cookies.js");
const accessModule = await import("../src/modules/users/access.service.js");
const profileRoutesModule = await import("../src/modules/profile/profile.routes.js");
const authServiceModule = await import("../src/modules/auth/auth.service.js");

const pool = poolModule.default;
const { AUTH_COOKIE_NAME } = cookiesModule;
const { signAccessToken, authPreHandler } = sessionModule;
const { clearRolePermissionsCache } = accessModule;
const profileRoutes = profileRoutesModule.default;
const { findAuthUserForLogin, findAuthUserById } = authServiceModule;

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
    clearedCookies: [],
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
    clearCookie(name, options) {
      state.clearedCookies.push({ name, options });
      return this;
    },
    header(name, value) {
      state.headers[name] = value;
      return this;
    }
  };
}

function createProfileRouteRecorder() {
  const routes = [];
  return {
    routes,
    fastify: {
      apiRateLimit: { max: 1, timeWindow: 1000 },
      get(path, options, handler) {
        routes.push({ method: "GET", path, options, handler });
      },
      patch(path, options, handler) {
        routes.push({ method: "PATCH", path, options, handler });
      },
      post(path, options, handler) {
        routes.push({ method: "POST", path, options, handler });
      }
    }
  };
}

function findRecordedRoute(routes, method, path) {
  return routes.find((route) => route.method === method && route.path === path);
}

test("signAccessToken uses HS256", () => {
  const token = signAccessToken({
    userId: 1,
    organizationId: 2,
    organizationCode: "demo",
    username: "tester"
  });

  const decoded = jwt.decode(token, { complete: true });
  assert.equal(decoded?.header?.alg, "HS256");

  const verified = jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: ["HS256"]
  });
  assert.equal(verified.userId, 1);
  assert.equal(verified.organizationId, 2);
});

test("authPreHandler clears invalid auth cookie", async () => {
  const reply = createReplyRecorder();

  await authPreHandler({
    cookies: {
      [AUTH_COOKIE_NAME]: "invalid-token"
    }
  }, reply);

  assert.equal(reply.state.statusCode, 401);
  assert.equal(reply.state.payload?.message, "Invalid or expired token.");
  assert.equal(reply.state.clearedCookies.length, 1);
  assert.equal(reply.state.clearedCookies[0]?.name, AUTH_COOKIE_NAME);
});

test("authPreHandler clears auth cookie when requester cannot be resolved", { concurrency: false }, async () => {
  const seenQueries = [];
  const restoreQuery = stubPoolQuery(async (sql) => {
    const queryText = String(sql || "");
    seenQueries.push(queryText);
    if (queryText.includes("FROM users u")) {
      return { rows: [] };
    }
    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const reply = createReplyRecorder();
    const request = {
      cookies: {
        [AUTH_COOKIE_NAME]: signAccessToken({
          userId: 10,
          organizationId: 20,
          organizationCode: "demo",
          username: "tester"
        })
      },
      method: "GET",
      routeOptions: { url: "/api/profile" },
      ip: "127.0.0.1"
    };

    await authPreHandler(request, reply);

    assert.equal(reply.state.statusCode, 401);
    assert.equal(reply.state.payload?.message, "Unauthorized");
    assert.equal(reply.state.clearedCookies.length, 1);
    assert.equal(reply.state.clearedCookies[0]?.name, AUTH_COOKIE_NAME);
    assert.equal(seenQueries.length, 1);
    assert.doesNotMatch(seenQueries[0], /ALTER TABLE organizations/i);
  } finally {
    restoreQuery();
  }
});

test("profile routes enforce profile read and update permissions", { concurrency: false }, async () => {
  const recorder = createProfileRouteRecorder();
  await profileRoutes(recorder.fastify);

  const profileGet = findRecordedRoute(recorder.routes, "GET", "/");
  const profilePatch = findRecordedRoute(recorder.routes, "PATCH", "/");

  assert.equal(typeof profileGet?.handler, "function");
  assert.equal(typeof profilePatch?.handler, "function");

  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");
    if (queryText.includes("FROM role_options r") && queryText.includes("JOIN role_permissions rp")) {
      return { rows: [] };
    }
    throw new Error(`Unexpected query in test: ${queryText} :: ${JSON.stringify(params)}`);
  });

  try {
    clearRolePermissionsCache();

    const getReply = createReplyRecorder();
    await profileGet.handler({
      authContext: {
        requester: {
          id: 1,
          role_id: 101,
          username: "user",
          full_name: "User Example",
          organization_id: 2,
          organization_code: "demo",
          organization_name: "Demo Org"
        },
        userId: 1,
        organizationId: 2
      },
      log: { error() {} }
    }, getReply);

    assert.equal(getReply.state.statusCode, 403);
    assert.equal(getReply.state.payload?.message, "Forbidden.");

    clearRolePermissionsCache();

    const patchReply = createReplyRecorder();
    await profilePatch.handler({
      authContext: {
        requester: {
          id: 1,
          role_id: 102,
          organization_id: 2
        },
        userId: 1,
        organizationId: 2
      },
      body: {
        field: "fullName",
        value: "Updated User"
      },
      log: { error() {} }
    }, patchReply);

    assert.equal(patchReply.state.statusCode, 403);
    assert.equal(patchReply.state.payload?.message, "Forbidden.");
  } finally {
    clearRolePermissionsCache();
    restoreQuery();
  }
});

test("auth service queries require active roles", { concurrency: false }, async () => {
  const seenQueries = [];
  const restoreQuery = stubPoolQuery(async (sql) => {
    seenQueries.push(String(sql || ""));
    return { rows: [] };
  });

  try {
    await findAuthUserForLogin({ username: "tester" });
    await findAuthUserById(1, 2);
  } finally {
    restoreQuery();
  }

  assert.equal(seenQueries.length, 2);
  seenQueries.forEach((queryText) => {
    assert.match(queryText, /r\.is_active\s*=\s*TRUE/);
  });
});
