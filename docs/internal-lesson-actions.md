# Internal schedule shortcuts

Apply the new database migration before deploying the updated API/frontend:

```bash
cd /var/www/aaron-crm/api
pnpm run migrate
```

- Weekday badges show completed/total for the current Tashkent calendar week using existing journal marks. Empty placeholders do not count.
- Drag a card to another open weekday to move that weekday occurrence while preserving its other weekdays. If the lesson already includes the destination day, the move is rejected; create a new lesson using + for an additional session. Editing weekdays remains available for touch/keyboard operation.
- Enable selection using the check icon in the header, then click lessons. Selecting a recurring lesson highlights all its weekday cards. Group edit can change the specialist and/or add/remove specific weekdays; group delete asks for confirmation. Weekdays are always shown, with indeterminate checkboxes and counts for mixed selections. Untouched weekdays remain unchanged for each lesson. Clearing the last day is rejected; delete the lesson explicitly instead. Group operations commit together or roll back together.


The revision counter protects against concurrent edits. Schedule changes never rewrite journal completion marks or events. The follow-up migration removes the temporary undo table without affecting schedules or journal history. Historical applied migrations are retained unchanged. No planner therapy behavior is changed.
