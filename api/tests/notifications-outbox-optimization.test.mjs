import assert from "node:assert/strict";
import test from "node:test";
import pool from "../src/config/db.js";
import { processPendingOutboxEvents } from "../src/modules/notifications/notifications.service.js";

function stubPoolQuery(implementation) {
  const originalQuery = pool.query.bind(pool);
  pool.query = implementation;
  return () => {
    pool.query = originalQuery;
  };
}

test("processPendingOutboxEvents batches successful status updates", async () => {
  let callCount = 0;
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    callCount += 1;
    const queryText = String(sql || "");

    if (queryText.includes("FOR UPDATE SKIP LOCKED")) {
      assert.equal(params[0], 100);
      assert.equal(params[1], 120);
      return {
        rows: [
          {
            id: 11,
            organization_id: 3,
            event_type: "notification-manual",
            aggregate_type: "notification",
            aggregate_id: "",
            payload: {}
          },
          {
            id: 12,
            organization_id: 3,
            event_type: "notification-manual",
            aggregate_type: "notification",
            aggregate_id: "",
            payload: {}
          }
        ]
      };
    }

    if (queryText.includes("SET status = 'sent'")) {
      assert.deepEqual(params[0], [11, 12]);
      return { rowCount: 2 };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    let processedByProcessor = 0;
    const result = await processPendingOutboxEvents({
      processor: async () => {
        processedByProcessor += 1;
      }
    });

    assert.equal(callCount, 2);
    assert.equal(processedByProcessor, 2);
    assert.deepEqual(result, {
      fetchedCount: 2,
      processedCount: 2,
      requeuedCount: 0,
      failedCount: 0
    });
  } finally {
    restoreQuery();
  }
});

test("processPendingOutboxEvents batches mixed sent, failed and requeued updates", async () => {
  let callCount = 0;
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    callCount += 1;
    const queryText = String(sql || "");

    if (queryText.includes("FOR UPDATE SKIP LOCKED")) {
      assert.equal(params[0], 100);
      assert.equal(params[1], 120);
      return {
        rows: [
          {
            id: 21,
            organization_id: 3,
            event_type: "notification-manual",
            aggregate_type: "notification",
            aggregate_id: "",
            payload: {},
            retry_count: 0,
            max_retries: 2
          },
          {
            id: 22,
            organization_id: 3,
            event_type: "notification-manual",
            aggregate_type: "notification",
            aggregate_id: "",
            payload: {},
            retry_count: 0,
            max_retries: 2
          },
          {
            id: 23,
            organization_id: 3,
            event_type: "notification-manual",
            aggregate_type: "notification",
            aggregate_id: "",
            payload: {},
            retry_count: 2,
            max_retries: 2
          }
        ]
      };
    }

    if (queryText.includes("SET status = 'sent'")) {
      assert.deepEqual(params[0], [21]);
      return { rowCount: 1 };
    }

    if (queryText.includes("SET status = 'failed'")) {
      assert.deepEqual(params[0], [23]);
      assert.deepEqual(params[1], [3]);
      return { rowCount: 1 };
    }

    if (queryText.includes("SET status = 'pending'") && queryText.includes("next_retry_at = CURRENT_TIMESTAMP")) {
      assert.deepEqual(params[0], [22]);
      assert.deepEqual(params[1], [1]);
      assert.equal(params[3], 45);
      return { rowCount: 1 };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const result = await processPendingOutboxEvents({
      retryDelaySeconds: 45,
      processor: async ({ id }) => {
        if (id === 22 || id === 23) {
          throw new Error(`processor failed for ${id}`);
        }
      }
    });

    assert.equal(callCount, 4);
    assert.deepEqual(result, {
      fetchedCount: 3,
      processedCount: 1,
      requeuedCount: 1,
      failedCount: 1
    });
  } finally {
    restoreQuery();
  }
});

test("processPendingOutboxEvents uses configurable claim lease for retry-capable rows", async () => {
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FOR UPDATE SKIP LOCKED")) {
      assert.equal(params[0], 100);
      assert.equal(params[1], 240);
      return { rows: [] };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const result = await processPendingOutboxEvents({
      claimTtlSeconds: 240
    });

    assert.deepEqual(result, {
      fetchedCount: 0,
      processedCount: 0,
      requeuedCount: 0,
      failedCount: 0
    });
  } finally {
    restoreQuery();
  }
});
