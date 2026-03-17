import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("norm auth errors use alerts instead of inline modal banners", async () => {
  const settingsCreateSource = await readFile(new URL("../src/pages/profile/panels/SettingsCreateModals.jsx", import.meta.url), "utf8");
  const profileModalsSource = await readFile(new URL("../src/pages/profile/ProfileModals.jsx", import.meta.url), "utf8");

  assert.match(
    settingsCreateSource,
    /const message = String\(normCreateError \|\| ""\)\.trim\(\);[\s\S]*window\.alert\(message\);[\s\S]*setNormCreateError\(""\);/s,
    "Norm create modal errors should be surfaced through alert and then cleared."
  );
  assert.doesNotMatch(
    settingsCreateSource,
    /<p className="auth-error" role="alert">\{normCreateError\}<\/p>/,
    "Norm create modal should not render auth-error text inside the modal."
  );

  assert.match(
    profileModalsSource,
    /const message = String\(normEditError \|\| ""\)\.trim\(\);[\s\S]*window\.alert\(message\);[\s\S]*setNormEditError\(""\);/s,
    "Norm edit modal errors should be surfaced through alert and then cleared."
  );
  assert.doesNotMatch(
    profileModalsSource,
    /<p className="auth-error" role="alert">\{normEditError\}<\/p>/,
    "Norm edit modal should not render auth-error text inside the modal."
  );
});
