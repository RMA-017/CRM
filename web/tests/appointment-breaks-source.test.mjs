import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Appointment breaks panel includes a panel-style search bar and filters visible rows", async () => {
  const source = await readFile(new URL("../src/pages/profile/AppointmentSettingsPanel.jsx", import.meta.url), "utf8");

  assert.match(
    source,
    /className="panel-search-bar"/,
    "Appointment breaks panel should render the shared panel search bar."
  );
  assert.match(
    source,
    /const \[breaksSearchInput, setBreaksSearchInput\] = useState\(""\);/,
    "Appointment breaks panel should keep local search input state."
  );
  assert.match(
    source,
    /const pagedBreakItems = useMemo\(/,
    "Appointment breaks panel should derive paged rows from filtered results."
  );
  assert.match(
    source,
    /pagedBreakItems\.map\(/,
    "Appointment breaks table should render paginated break rows."
  );
  assert.match(
    source,
    /const \[breaksPage, setBreaksPage\] = useState\(1\);/,
    "Appointment breaks panel should keep pagination state."
  );
  assert.match(
    source,
    /Page \{Math\.min\(breaksPage, breaksTotalPages\)\} of \{breaksTotalPages\}/,
    "Appointment breaks panel should render pagination info."
  );
});
