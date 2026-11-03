import { describe, expect, it } from "vitest";
import { fileNamePlaceholder, fileNameProblem, stripExtension } from "./fileName";

describe("fileNameProblem", () => {
    it("日本語や記号の多くは使える", () => {
        expect(fileNameProblem("9月の旅行（京都）")).toBeNull();
        expect(fileNameProblem("trip_2026-09.mp4")).toBeNull();
    });

    it("空や空白だけは、入力を求める", () => {
        expect(fileNameProblem("")).toBe("ファイル名を入力してください");
        expect(fileNameProblem("   ")).toBe("ファイル名を入力してください");
        expect(fileNameProblem(".mp4")).toBe("ファイル名を入力してください");
    });

    it("パスの区切りや使えない記号は、どの文字かを示す", () => {
        expect(fileNameProblem("旅行/京都")).toBe("「/」はファイル名に使えません。ほかの文字に置き換えてください");
        expect(fileNameProblem('a:b?c:"d"')).toMatch(/^「: \? "」/);
    });

    it("制御文字・先頭の「.」・長すぎる名前は使えない", () => {
        expect(fileNameProblem("旅行\t京都")).toMatch(/改行やタブ/);
        expect(fileNameProblem(".hidden")).toMatch(/「\.」で始まる/);
        expect(fileNameProblem("あ".repeat(81))).toMatch(/80文字以内/);
    });

    it("拡張子は外して扱い、例には当日の日付を使う", () => {
        expect(stripExtension(" 旅行.MP4 ")).toBe("旅行");
        expect(fileNamePlaceholder(new Date(2026, 10, 4))).toBe("例：20261104の動画");
    });
});
