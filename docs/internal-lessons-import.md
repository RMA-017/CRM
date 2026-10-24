# Import school-kindergarten schedules

Workbook columns: **A = child ID, B = specialist ID, C = weekday**. First row contains headers. One source row represents one weekday occurrence. Russian, Uzbek, English weekday names and ISO weekday numbers 1–7 are accepted. Duplicate occurrences within a file are rejected.

Run from `api`:

```powershell
python scripts/prepare-internal-lessons-import.py C:\Users\user\Desktop\123.xlsx "$env:TEMP\123-internal-lessons.json"
node --env-file=.env scripts/import-internal-lessons.mjs "--file=$env:TEMP\123-internal-lessons.json"
```

The second command previews against the database without writing. If several active organizations exist, specify `--organization=ID`. To apply the validated import, rerun with `--apply`. Optionally add `--report=report.json` to save validation results.

Children must already be enrolled in the Caregivers child roster; no caregiver contact is required. Specialists must be active. Newly added weekdays must be open in appointment settings. Errors block the whole import. The import neither creates client accounts nor enrolls children automatically.

Rows for the same child/specialist pair are grouped into one weekly lesson. Existing occurrences are preserved and skipped; only missing weekdays are inserted. Reimporting the same file adds no duplicate occurrences. This mode imports the weekly schedule, not multiple sessions for the same pair on the same weekday. It does not modify therapy appointments or journal history.

The supplied `123.xlsx` contains 1,322 rows, 655 weekly pairs, 54 child IDs and 23 specialist IDs. File validation passed; actual ID/enrollment checks and insertion await a running database. No records were inserted into the real CRM database during preparation.
