import assert from "node:assert/strict";
import test from "node:test";
import pool from "../src/config/db.js";
import { getFinanceClientDiscounts } from "../src/modules/finance/finance-discounts.service.js";

function stubPoolQuery(implementation) {
  const originalQuery = pool.query.bind(pool);
  pool.query = implementation;
  return () => {
    pool.query = originalQuery;
  };
}

function assertContiguousSqlParams(sql, params) {
  const indexes = [...String(sql || "").matchAll(/\$(\d+)/g)]
    .map((match) => Number.parseInt(match[1], 10))
    .filter(Number.isFinite);
  const maxIndex = Math.max(0, ...indexes);
  assert.equal(params.length, maxIndex);
  for (let index = 1; index <= maxIndex; index += 1) {
    assert.ok(indexes.includes(index), `Expected SQL to use $${index}`);
  }
}

test("client discount list quick client search keeps SQL params contiguous for one-word text", async () => {
  const calls = [];
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    calls.push({ sql: String(sql || ""), params });
    assertContiguousSqlParams(sql, params);
    if (/COUNT\(\*\)::integer AS total/i.test(String(sql || ""))) {
      return { rows: [{ total: 0 }] };
    }
    return { rows: [] };
  });

  try {
    const result = await getFinanceClientDiscounts({
      organizationId: 2,
      filters: {
        page: 1,
        pageSize: 20,
        client: "ktq",
        isActive: "true"
      }
    });

    assert.equal(result.totalItems, 0);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].params, [2, "%ktq%", "ktq", "%ktq%", "", true]);
    assert.match(calls[0].sql, /COALESCE\(c\.phone_number, ''\) LIKE \$4/);
    assert.match(calls[0].sql, /\(\$5 <> '' AND regexp_replace/);
    assert.match(calls[0].sql, /r\.is_active = \$6::boolean/);
  } finally {
    restoreQuery();
  }
});
