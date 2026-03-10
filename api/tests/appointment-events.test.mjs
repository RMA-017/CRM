import assert from "node:assert/strict";
import test from "node:test";

const appointmentEventsModule = await import("../src/modules/appointments/appointment-events.js");

const {
  subscribeAppointmentEvents,
  publishAppointmentEvent
} = appointmentEventsModule;

test("manager-targeted events are delivered to admin subscribers even without manager label", () => {
  const receivedPayloads = [];
  const unsubscribe = subscribeAppointmentEvents({
    organizationId: 3,
    userId: 14,
    roleLabel: "director",
    isAdmin: true,
    listener: (payload) => {
      receivedPayloads.push(payload);
    }
  });

  try {
    const deliveredCount = publishAppointmentEvent({
      organizationId: 3,
      type: "schedule-updated",
      message: "Planner changed.",
      sourceUserId: 9,
      targetRoles: ["manager"],
      data: { scheduleId: "55" }
    });

    assert.equal(deliveredCount, 1);
    assert.equal(receivedPayloads.length, 1);
    assert.equal(receivedPayloads[0]?.type, "schedule-updated");
    assert.equal(receivedPayloads[0]?.data?.scheduleId, "55");
  } finally {
    unsubscribe();
  }
});

test("manager-targeted events are not delivered to non-admin non-manager subscribers", () => {
  const receivedPayloads = [];
  const unsubscribe = subscribeAppointmentEvents({
    organizationId: 3,
    userId: 15,
    roleLabel: "director",
    isAdmin: false,
    listener: (payload) => {
      receivedPayloads.push(payload);
    }
  });

  try {
    const deliveredCount = publishAppointmentEvent({
      organizationId: 3,
      type: "schedule-updated",
      message: "Planner changed.",
      sourceUserId: 9,
      targetRoles: ["manager"]
    });

    assert.equal(deliveredCount, 0);
    assert.deepEqual(receivedPayloads, []);
  } finally {
    unsubscribe();
  }
});
