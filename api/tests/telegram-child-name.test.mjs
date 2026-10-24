import assert from "node:assert/strict";
import test from "node:test";
import { telegramChildName } from "../src/modules/telegram-bot/telegram-child-name.js";
import { formatSpecialistNotification } from "../src/modules/telegram-bot/telegram-specialist-notifications.service.js";

test("bot child names consistently show first name, surname, then patronymic for supported data sources", () => {
  for (const child of [
    { first_name: "Юсуфбек", last_name: "Лутфуллаев", middle_name: "Саидович" },
    { firstName: "Юсуфбек", lastName: "Лутфуллаев", middleName: "Саидович" },
    { clientFirstName: "Юсуфбек", clientLastName: "Лутфуллаев", clientMiddleName: "Саидович" }
  ]) assert.equal(telegramChildName(child), "Юсуфбек Лутфуллаев Саидович");
  assert.equal(telegramChildName({ first_name: " Ali ", last_name: " Karimov ", middle_name: null }), "Ali Karimov");
  assert.equal(telegramChildName(null), "");
});

test("bot notifications prefer ordered name fields over planner's preformatted surname-first text", () => {
  const message = formatSpecialistNotification({ language: "uz", user_id: 8, event_type: "schedule-created",
    payload: { data: { clientName: "Karimov Ali Valiyevich", items: [{ specialistId: 8,
      firstName: "Ali", lastName: "Karimov", middleName: "Valiyevich" }] } } });
  assert.equal(message, "Dars yaratildi\nAli Karimov Valiyevich");
});
