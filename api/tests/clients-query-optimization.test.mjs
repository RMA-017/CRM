import assert from "node:assert/strict";
import test from "node:test";
import pool from "../src/config/db.js";
import {
  getClientsPage,
  resetClientsServiceSchemaCacheForTests
} from "../src/modules/clients/clients.service.js";

function stubPoolQuery(implementation) {
  const originalQuery = pool.query.bind(pool);
  pool.query = implementation;
  return () => {
    pool.query = originalQuery;
  };
}

test("getClientsPage uses one paged query", async () => {
  resetClientsServiceSchemaCacheForTests();
  let callCount = 0;
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    callCount += 1;
    const text = String(sql || "");

    assert.match(text, /WITH filtered_clients AS/i);
    assert.doesNotMatch(text, /SELECT COUNT\(\*\)::int AS total[\s\S]*FROM clients c/i);
    assert.deepEqual(params.slice(-2), [10, 5]);
    return {
      rows: [{
        total: 13,
        total_pages: 2,
        id: "77",
        organization_id: "9",
        first_name: "Ali",
        last_name: "Valiyev",
        middle_name: "",
        birthday: null,
        phone_number: "",
        tg_mail: "",
        is_vip: false,
        created_by: "4",
        updated_by: "4",
        created_by_name: "Admin",
        updated_by_name: "Admin",
        created_at: "2026-03-10T00:00:00.000Z",
        updated_at: "2026-03-10T00:00:00.000Z",
        note: "",
        history_entry_date: null,
        history_condition_name: "",
        history_symptoms: "",
        history_diagnosis: "",
        history_treatment_plan: "",
        history_note: "",
        history_specialist_name: "",
        history_specialist_position: "",
        _sort_client_id: 77
      }]
    };
  });

  try {
    const result = await getClientsPage({
      organizationId: 9,
      page: 5,
      limit: 10,
      search: ""
    });

    assert.equal(callCount, 1);
    assert.equal(result.total, 13);
    assert.equal(result.totalPages, 2);
    assert.equal(result.page, 2);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].id, "77");
    assert.equal(Object.hasOwn(result.rows[0], "_sort_client_id"), false);
  } finally {
    restoreQuery();
    resetClientsServiceSchemaCacheForTests();
  }
});

test("getClientsPage filters active clients when requested", async () => {
  resetClientsServiceSchemaCacheForTests();
  let callCount = 0;
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    callCount += 1;
    const text = String(sql || "");

    assert.match(text, /WITH filtered_clients AS/i);
    assert.match(text, /c\.is_vip = TRUE/i);
    assert.deepEqual(params.slice(-2), [10, 1]);
    return {
      rows: [{
        total: 1,
        total_pages: 1,
        id: "77",
        organization_id: "9",
        first_name: "Ali",
        last_name: "Valiyev",
        middle_name: "",
        birthday: null,
        phone_number: "",
        tg_mail: "",
        is_vip: true,
        created_by: "4",
        updated_by: "4",
        created_by_name: "Admin",
        updated_by_name: "Admin",
        created_at: "2026-03-10T00:00:00.000Z",
        updated_at: "2026-03-10T00:00:00.000Z",
        note: "",
        _sort_client_id: 77
      }]
    };
  });

  try {
    const result = await getClientsPage({
      organizationId: 9,
      page: 1,
      limit: 10,
      activeOnly: true
    });

    assert.equal(callCount, 1);
    assert.equal(result.total, 1);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].is_vip, true);
  } finally {
    restoreQuery();
    resetClientsServiceSchemaCacheForTests();
  }
});

test("getClientsPage supports client table column filters", async () => {
  resetClientsServiceSchemaCacheForTests();
  let callCount = 0;
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    callCount += 1;
    const text = String(sql || "");

    assert.match(text, /c\.id = \$\d+/i);
    assert.match(text, /c\.birthday >= \$\d+::date/i);
    assert.match(text, /c\.birthday <= \$\d+::date/i);
    assert.match(text, /COALESCE\(c\.phone_number, ''\) LIKE \$\d+/i);
    assert.match(text, /LOWER\(COALESCE\(c\.tg_mail, ''\)\) LIKE \$\d+/i);
    assert.match(text, /c\.created_at::date >= \$\d+::date/i);
    assert.match(text, /c\.created_at::date <= \$\d+::date/i);
    assert.match(text, /LOWER\(COALESCE\(c\.note, ''\)\) LIKE \$\d+/i);
    assert.deepEqual(params.slice(0, -2), [
      9,
      "ali%",
      "vali%",
      "bek%",
      77,
      "2026-06-01",
      "2026-06-02",
      "%+998%",
      "%parent@example.com%",
      "2026-05-01",
      "2026-05-31",
      "%deposit%"
    ]);
    assert.deepEqual(params.slice(-2), [10, 1]);
    return {
      rows: []
    };
  });

  try {
    const result = await getClientsPage({
      organizationId: 9,
      page: 1,
      limit: 10,
      clientId: 77,
      firstName: "Ali",
      lastName: "Vali",
      middleName: "Bek",
      birthdayFrom: "2026-06-01",
      birthdayTo: "2026-06-02",
      phone: "+998",
      email: "Parent@Example.com",
      createdFrom: "2026-05-01",
      createdTo: "2026-05-31",
      note: "Deposit"
    });

    assert.equal(callCount, 1);
    assert.equal(result.total, 0);
    assert.equal(result.rows.length, 0);
  } finally {
    restoreQuery();
    resetClientsServiceSchemaCacheForTests();
  }
});
