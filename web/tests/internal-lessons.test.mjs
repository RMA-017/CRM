import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getInternalLessonCards, toggleInternalLessonDay, changeInternalLessonFilter } from "../src/pages/profile/internal-lessons.helpers.js";
import { useProfileAccess } from "../src/pages/profile/useProfileAccess.js";

test("every day initially has five clickable places and grows beyond five lessons", () => {
  assert.deepEqual(getInternalLessonCards([], 1), [null, null, null, null, null]);
  const lessons = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, weekDays: [1, 3] }));
  assert.equal(getInternalLessonCards(lessons, 1).length, 6);
  assert.equal(getInternalLessonCards(lessons, 2).length, 5);
  assert.equal(getInternalLessonCards(lessons.slice(0, 1), 3).filter(Boolean).length, 1);
});

test("removing weekdays leaves other days intact and can clear a card entirely", () => {
  assert.deepEqual(toggleInternalLessonDay([1, 3, 5], 3), [1, 5]);
  assert.deepEqual(toggleInternalLessonDay([1], 1), []);
  assert.deepEqual(toggleInternalLessonDay([1, 5], 3), [1, 3, 5]);
});

test("child and specialist selectors clear each other and switch the displayed view", () => {
  let filter = { clientId: "", specialistId: "", mode: "client" };
  filter = changeInternalLessonFilter(filter, "specialistId", "8");
  assert.equal(filter.mode, "specialist");
  filter = changeInternalLessonFilter(filter, "clientId", "4");
  assert.deepEqual(filter, { clientId: "4", specialistId: "", mode: "client" });
  filter = changeInternalLessonFilter(filter, "specialistId", "8");
  assert.deepEqual(filter, { clientId: "", specialistId: "8", mode: "specialist" });
});

test("internal lessons have independent route and action permissions", () => {
  let snapshot;
  function Probe({ permissions }) {
    snapshot = useProfileAccess({ username: "tester", permissions }, "internal-lessons");
    return React.createElement("div");
  }
  renderToStaticMarkup(React.createElement(Probe, { permissions: ["appointments.internal-lessons.read", "appointments.internal-lessons.create"] }));
  assert.equal(snapshot.canAccessForcedView, true);
  assert.equal(snapshot.hasAppointmentsMenuAccess, true);
  assert.equal(snapshot.canOpenAppointmentSchedule, false);
  assert.deepEqual(snapshot.internalLessonsAccess, { read: true, create: true, update: false, delete: false });
  renderToStaticMarkup(React.createElement(Probe, { permissions: ["appointments.planner.read"] }));
  assert.equal(snapshot.canAccessForcedView, false);
});

test("journal-only users can open the journal without planner or schedule editing access", () => {
  let snapshot;
  function Probe() {
    snapshot = useProfileAccess({ username: "auditor", permissions: ["appointments.internal-journal.read"] }, "internal-journal");
    return React.createElement("div");
  }
  renderToStaticMarkup(React.createElement(Probe));
  assert.equal(snapshot.canAccessForcedView, true);
  assert.equal(snapshot.hasAppointmentsMenuAccess, true);
  assert.equal(snapshot.canOpenAppointmentSchedule, false);
  assert.equal(snapshot.internalLessonsAccess.read, false);
  assert.deepEqual(snapshot.internalJournalAccess, { read: true, update: false });
});
