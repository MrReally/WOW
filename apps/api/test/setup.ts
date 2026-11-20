import { afterEach } from "vitest";
import { stopTelegramBotsForTests } from "../src/core/telegramBot.js";

afterEach(() => {
  stopTelegramBotsForTests();
});
