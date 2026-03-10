import { toBoundedInteger } from "./bounded-integer.js";

export function normalizeNotificationListLimit(value) {
  return toBoundedInteger(value, 50, 1, 200);
}
