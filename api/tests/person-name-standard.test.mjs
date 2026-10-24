import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { formatPersonName } from "../../shared/person-name.js";

test("shared FIO standard preserves multiword parts and supports API, database and planner fields", () => {
  for (const person of [
    { firstName: " Ali ", lastName: "Karimov", middleName: "Vali o‘g‘li" },
    { first_name: "Ali", last_name: "Karimov", middle_name: "Vali o‘g‘li" },
    { clientFirstName: "Ali", clientLastName: "Karimov", clientMiddleName: "Vali o‘g‘li" },
    { client_first_name: "Ali", client_last_name: "Karimov", client_middle_name: "Vali o‘g‘li" }
  ]) assert.equal(formatPersonName(person), "Ali Karimov Vali o‘g‘li");
  assert.equal(formatPersonName({ firstName: "Ali", middleName: "Valiyevich" }), "Ali Valiyevich");
  assert.equal(formatPersonName({ fullName: "Do not guess stored name parts" }), "");
});

test("CRM full-name composition never puts surname before first name", async () => {
  async function audit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
      if (entry.isDirectory()) { await audit(url); continue; }
      if (!/\.jsx?$/.test(entry.name)) continue;
      const source = await readFile(url, "utf8");
      assert.doesNotMatch(source, /concat_ws\(' ',\s*(?:\w+\.)?last_name,\s*(?:\w+\.)?first_name/i, url.pathname);
      assert.doesNotMatch(source, /\[lastName,\s*firstName,\s*middleName\]/, url.pathname);
    }
  }
  await audit(new URL("../src/", import.meta.url));
  await audit(new URL("../../web/src/", import.meta.url));
});
