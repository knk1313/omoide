import { describe, expect, it } from "vitest";
import { formatBytes, formatSeconds } from "./format";

describe("formatSeconds", () => {
    it.each([
        [0, "0秒"],
        [46.27, "46秒"],
        [59.6, "1分"],
        [83, "1分23秒"],
        [600, "10分"],
    ])("%s秒は %s", (seconds, text) => {
        expect(formatSeconds(seconds)).toBe(text);
    });
});

describe("formatBytes", () => {
    it("1024進みで、10未満は小数1桁にする", () => {
        expect(formatBytes(512)).toBe("512B");
        expect(formatBytes(3.5 * 1024 * 1024)).toBe("3.5MB");
        expect(formatBytes(30_000_000)).toBe("29MB");
        expect(formatBytes(1.2 * 1024 ** 3)).toBe("1.2GB");
    });
});
