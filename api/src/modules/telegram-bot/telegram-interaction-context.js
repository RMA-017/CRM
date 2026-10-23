import { AsyncLocalStorage } from "node:async_hooks";

// Only interactive responses use the shared menu screen. Reminders and broadcasts stay separate.
export const telegramInteractionContext = new AsyncLocalStorage();
