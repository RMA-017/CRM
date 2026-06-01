import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("services panel keeps search in the header before close", async () => {
  const source = await readFile(
    new URL("../src/pages/profile/panels/ServicesPanel.jsx", import.meta.url),
    "utf8"
  );
  const styles = await readFile(
    new URL("../src/css/components/components.css", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /<div className="all-users-head-actions">[\s\S]*className="panel-search-input"[\s\S]*aria-label=\{translate\("Search"\)\}[\s\S]*aria-label=\{translate\("Close services panel"\)\}/s,
    "Services search should render in the header actions before the close button."
  );
  assert.doesNotMatch(
    source,
    /<div className="services-toolbar">/,
    "Services search should no longer take a separate toolbar row."
  );
  assert.match(
    styles,
    /\.services-panel \.all-users-head-actions \.panel-search-input \{[\s\S]*width: min\(360px, 44vw\);/s,
    "Services header search should use compact header sizing."
  );
});
