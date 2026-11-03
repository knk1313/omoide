import { describe, expect, it } from "vitest";
import { formatSeconds } from "./format";

describe("formatSeconds", () => {
    it.each([
        [0, "0秒"],
        [46.27, "46秒"],
        [59.6, "1分"],
        [83, "1分23秒"],
        [600, "10分"],
    ])("%s 秒は %s", (seconds, text) => {
        expect(formatSeconds(seconds)).toBe(text);
    });
});
