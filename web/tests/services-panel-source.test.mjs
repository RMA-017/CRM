import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("services panel keeps search in the header before close", async () => {
  const source = await readFile(
    new URL("../src/pages/profile/panels/ServicesPanel.jsx", import.meta.url),
    "utf8"
  );
  const settingsSource = await readFile(
    new URL("../src/pages/profile/panels/ServicesSettingsPanel.jsx", import.meta.url),
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
    /\.services-panel \.all-users-head-actions \.panel-search-input,[\s\S]*\.services-settings-panel \.all-users-head-actions \.panel-search-input \{[\s\S]*width: min\(360px, 44vw\);/s,
    "Services header search should use compact header sizing."
  );
  assert.match(
    settingsSource,
    /const \[search, setSearch\] = useState\(""\);[\s\S]*const filteredItems = useMemo\(\(\) => \{[\s\S]*String\(item\?\.name \|\| ""\)\.toLowerCase\(\)\.includes\(query\)[\s\S]*String\(item\?\.positionLabel \|\| ""\)\.toLowerCase\(\)\.includes\(query\)/s,
    "Service settings should filter services by name and position like the public services panel."
  );
  assert.match(
    settingsSource,
    /<div className="all-users-head-actions">[\s\S]*className="panel-search-input"[\s\S]*aria-label=\{translate\("Search"\)\}[\s\S]*id="openServiceCreateModalBtn"[\s\S]*aria-label=\{translate\("Close service settings panel"\)\}/s,
    "Service settings search should render in the header actions before create and close buttons."
  );
  assert.match(
    settingsSource,
    /hidden=\{filteredItems\.length === 0\}[\s\S]*filteredItems\.map\(\(item\) =>/s,
    "Service settings table should render the filtered service rows."
  );
});
