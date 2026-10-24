# Historical internal lesson journal import

Headerless Excel: **A = lesson date, B = child ID, C = specialist ID**. Every nonempty row is read, including the first. Numeric Excel dates (1900/1904 workbook systems), ISO dates and `DD.MM.YYYY`/`DD/MM/YYYY` text dates are supported. Formulas are rejected. The lesson date is retained; the audit event records the actual import time.

From the server's `api` directory:

```bash
python3 scripts/prepare-internal-journal-import.py /tmp/234.xlsx /tmp/234-journal.json
node --env-file=.env scripts/import-internal-journal.mjs --file=/tmp/234-journal.json --organization=2 --report=/tmp/234-journal-report.json
node --env-file=.env scripts/import-internal-journal.mjs --file=/tmp/234-journal.json --organization=2 --apply --report=/tmp/234-journal-report.json
```

The preview writes nothing; apply is atomic and refuses all rows if any validation fails. The console shows at most 20 errors; the report contains all of them.

- Client and specialist IDs must belong to the selected organization. Specialists must have the specialist role/position; OFF specialists are accepted without reactivating them. Historic children do not need current caregiver enrollment.
- Names and position snapshots come from CRM. Future dates are rejected.
- Matching recurring lessons receive the imported completion. Other past sessions become standalone journal history; recurring schedules are not created or changed.
- Repeated same-day rows represent distinct sessions. Existing occurrences count toward that number, including removed/corrected marks, so reimport does not duplicate or restore them.
- Standalone history uses negative immutable source lesson IDs and null lesson references. It remains visible in the journal and existing Telegram historical lesson views, and supports admin correction/removal.

The provided `234.xlsx` has 1,989 rows covering 1–23 October 2026, 54 children and 19 specialists. Its first row is data, not a header. File validation and isolated SQL tests passed; production IDs and the actual import are checked on the server.
