import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { registerAppointmentEventRoutes } from "../src/modules/appointments/routes/events.routes.js";

test("planner SSE connections close before Fastify shutdown", async () => {
  const hooks = new Map();
  const routes = new Map();
  const fastify = {
    apiRateLimit: {},
    addHook(name, handler) {
      hooks.set(name, handler);
    },
    get(path, _options, handler) {
      routes.set(path, handler);
    }
  };
  let unsubscribeCount = 0;
  registerAppointmentEventRoutes(fastify, {
    PERMISSIONS: { APPOINTMENTS_PLANNER_READ: "appointments.planner.read" },
    async requireAppointmentsAccess() {
      return {
        authContext: { organizationId: 1, userId: 2 },
        requester: { role_label: "Manager", is_admin: true }
      };
    },
    isAllowedCorsOrigin() {
      return true;
    },
    subscribeAppointmentEvents() {
      return () => {
        unsubscribeCount += 1;
      };
    }
  });

  const request = {
    headers: {},
    raw: new EventEmitter()
  };
  const response = new EventEmitter();
  response.writableEnded = false;
  response.setHeader = () => {};
  response.flushHeaders = () => {};
  response.write = () => true;
  response.end = () => {
    response.writableEnded = true;
    response.emit("finish");
  };
  const reply = {
    raw: response,
    hijack() {},
    status() {
      return this;
    },
    send() {}
  };

  await routes.get("/events")(request, reply);
  assert.equal(response.writableEnded, false);

  await new Promise((resolve) => hooks.get("preClose")(resolve));
  assert.equal(response.writableEnded, true);
  assert.equal(unsubscribeCount, 1);
});
