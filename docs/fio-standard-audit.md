# FIO display standard

All structured personal names use **first name → surname → patronymic** in both CRM languages. Missing parts are omitted. Multiword parts are kept intact. The shared formatter is `shared/person-name.js`.

Audited and corrected:

- Client API names, client cards, edit/delete labels and lead conversion defaults.
- Planner attendance/report names and appointment notification payloads.
- Caregiver child lists, internal schedules, journal selectors and Excel exports.
- Finance tickets, cashier boards, discounts, reports and Google Sheets exports.
- CRM header notifications, Telegram screens, reminders and notifications.
- Employee/profile/caregiver full-name inputs now show the intended order as a placeholder.

Existing journal rows use structured client fields for display where that client still exists. Stored historical snapshots are not rewritten. If a client was deleted and only a name snapshot survives, the original snapshot remains visible; its parts cannot safely be inferred.

Employee, caregiver and lead `full_name` values are free-form text. Existing values are displayed as entered: automatically swapping their words would corrupt names that already use the standard, as well as multiword names. These records require manual review if their entered order is wrong. The new placeholders guide future entry. Legacy single-string client API input and lead conversion use the new order; integrations should send separate name fields to avoid ambiguity.

Compact Telegram therapy buttons retain the agreed exception: time + first name + surname, with a shortened surname when necessary. Structured name storage and database field meanings are unchanged. Sorting and SQL grouping are independent from FIO display order.

Validation: API and web quality suites; a regression audit rejects surname-first full-name composition in source files. Live database/Telegram verification requires a running PostgreSQL instance.
