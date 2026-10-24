# Internal schedule shortcuts

Apply the new database migration before deploying the updated API/frontend:

```bash
cd /var/www/aaron-crm/api
pnpm run migrate
```

- Weekday badges show completed/total for the current Tashkent calendar week using existing journal marks. Empty placeholders do not count.
- Copy is available inside a lesson's edit dialog. Choose weekdays for the new lesson. Journal marks are never copied.
- Drag a card to another open weekday to move that weekday occurrence while preserving its other weekdays. If the lesson already includes the destination day, the move is rejected; use Copy for an additional session. Editing weekdays remains available for touch/keyboard operation.
- Enable selection using the check icon in the header, then click lessons. Selecting a recurring lesson highlights all its weekday cards. Group edit can change the specialist and/or replace weekdays; group delete asks for confirmation. Changes affect all weekdays of the selected lessons. Group operations commit together or roll back together.
- Successful creates, edits, moves and deletes offer Undo for 45 seconds. Only the actor's latest successful action can be undone, with the corresponding original and inverse permissions. A concurrent edit blocks Undo. Updates use a revision counter, including legacy update endpoints.
- Undo deletion restores the original lesson ID and reconnects its previously attached journal rows. Completion records, snapshots, versions and events are never rewritten by schedule operations. Undo creation removes only the created lesson and preserves any journal history recorded meanwhile.

The migration adds a revision counter/trigger and a short-lived undo table. Expired records are pruned on subsequent successful actions. No existing schedule or journal rows are deleted by the migration. No planner therapy behavior is changed.
