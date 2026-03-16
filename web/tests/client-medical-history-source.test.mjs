import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Client medical history view invalidates stale client list responses", async () => {
  const source = await readFile(new URL("../src/pages/profile/useClientsSection.js", import.meta.url), "utf8");

  assert.match(
    source,
    /const clientsListRequestIdRef = useRef\(0\);/,
    "Clients section should track a shared request id across all clients and medical history list loads."
  );

  assert.match(
    source,
    /useEffect\(\(\) => \{\s*clientsListRequestIdRef\.current \+= 1;[\s\S]*lastClientsRequestKeyRef\.current = \"\";[\s\S]*lastMedicalHistoryRequestKeyRef\.current = \"\";[\s\S]*\}, \[isClientMedicalHistoryView\]\);/s,
    "Switching between all clients and medical history should invalidate stale list requests."
  );

  assert.match(
    source,
    /const loadClients = useCallback\(async[\s\S]*const requestId = clientsListRequestIdRef\.current \+ 1;[\s\S]*if \(requestId !== clientsListRequestIdRef\.current\) \{\s*return;\s*\}[\s\S]*if \(requestId === clientsListRequestIdRef\.current\) \{\s*setClientsLoading\(false\);/s,
    "All clients loader should ignore stale responses before mutating shared list state."
  );

  assert.match(
    source,
    /const loadClientMedicalHistoryClients = useCallback\(async[\s\S]*const requestId = clientsListRequestIdRef\.current \+ 1;[\s\S]*if \(requestId !== clientsListRequestIdRef\.current\) \{\s*return;\s*\}[\s\S]*if \(requestId === clientsListRequestIdRef\.current\) \{\s*setClientsLoading\(false\);/s,
    "Medical history loader should ignore stale responses before mutating shared list state."
  );
});
