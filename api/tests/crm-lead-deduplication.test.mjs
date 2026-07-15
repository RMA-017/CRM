import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createOrUpdateCrmLead } from "../src/modules/crm/crm.service.js";

const crmServiceSource = await readFile(
  new URL("../src/modules/crm/crm.service.js", import.meta.url),
  "utf8"
);
const crmRoutesSource = await readFile(
  new URL("../src/modules/crm/crm.routes.js", import.meta.url),
  "utf8"
);
const telegramBotSource = await readFile(
  new URL("../src/modules/telegram-bot/telegram-bot.service.js", import.meta.url),
  "utf8"
);

test("CRM lead ingestion inserts only phone numbers absent from clients and leads", async () => {
  let capturedQuery = "";
  let capturedParams = [];
  const db = {
    async query(query, params) {
      capturedQuery = query;
      capturedParams = params;
      return { rows: [] };
    }
  };

  const result = await createOrUpdateCrmLead({
    organizationId: 7,
    fullName: "Test Parent",
    phoneNumber: "90 123 45 67",
    source: "website",
    db
  });

  assert.equal(result, null);
  assert.equal(capturedParams[0], 7);
  assert.equal(capturedParams[2], "+998901234567");
  assert.equal(capturedParams[3], "998901234567");
  assert.match(
    capturedQuery,
    /INSERT INTO crm_leads[\s\S]*SELECT \$1,\$2,\$3,\$4::text[\s\S]*WHERE NOT EXISTS \([\s\S]*FROM clients c[\s\S]*c\.organization_id = \$1[\s\S]*= \$4::text[\s\S]*ON CONFLICT \(organization_id, phone_digits\)[\s\S]*DO NOTHING/s
  );
  assert.doesNotMatch(capturedQuery, /DO UPDATE SET/);
});

test("website and Telegram use the shared new-phone-only lead ingestion rule", () => {
  assert.match(
    crmRoutesSource,
    /"\/public-leads"[\s\S]*await createOrUpdateCrmLead\([\s\S]*source: "website"[\s\S]*return reply\.status\(201\)\.send\(\{ message: "Request saved\." \}\)/s,
    "Website submissions should not reveal whether a phone already exists."
  );
  assert.match(
    telegramBotSource,
    /async function handleContactMessage[\s\S]*await createOrUpdateCrmLead\([\s\S]*source: "telegram"/s,
    "Telegram contacts should pass through the same lead deduplication service."
  );
  assert.match(
    crmServiceSource,
    /ON CONFLICT \(organization_id, phone_digits\)[\s\S]*DO NOTHING/,
    "An existing CRM lead should not be updated or moved back to the top."
  );
});
