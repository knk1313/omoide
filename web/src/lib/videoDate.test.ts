import { describe, expect, it } from "vitest";
import type { Video } from "@/api/types";
import { localToday, videoDateProblem } from "./videoDate";

const videos: Video[] = [
    { name: "sep", created_at: null, metadata_date: null, date: "2026-09-20", panel_count: 1 },
    { name: "oct", created_at: null, metadata_date: null, date: null, panel_count: 1 },
];

describe("videoDateProblem", () => {
    const today = "2026-11-04";

    it("今日までの、ほかの動画と重ならない日付は受け付ける", () => {
        expect(videoDateProblem("2026-11-04", "oct", videos, today)).toBeNull();
        expect(videoDateProblem("2026-10-01", "oct", videos, today)).toBeNull();
    });

    it("空なら入力を求める", () => {
        expect(videoDateProblem("", "oct", videos, today)).toBe("撮影日を入力してください");
    });

    it("明日以降は受け付けず、今日の日付を示す", () => {
        expect(videoDateProblem("2026-11-05", "oct", videos, today)).toMatch(/^明日以降の日付は入力できません。2026年11月4日\(水\)まで/);
    });

    it("ほかの動画の撮影日と同じなら、その動画の名前を示す", () => {
        expect(videoDateProblem("2026-09-20", "oct", videos, today)).toMatch(/「sep」の撮影日になっています/);
        // 自分の日付を入れ直すのは問題ない
        expect(videoDateProblem("2026-09-20", "sep", videos, today)).toBeNull();
    });

    it("今日の日付は端末のタイムゾーンで数える", () => {
        expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    });
});
