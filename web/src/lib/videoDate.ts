import type { Video } from "@/api/types";
import { formatDay } from "./format";

// 撮影日の入力の検査。サーバー（Mac 側）も同じ規則で検査し、そちらを正とする。
// 画面では、送る前にその場で知らせるために使う（docs/errors.md）。

/** 端末の今日の日付（`2026-11-04`）。 */
export function localToday(now: Date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 撮影日として受け付けられなければ、その理由と次に取る操作。受け付けられれば null。 */
export function videoDateProblem(value: string, name: string, videos: readonly Video[], today: string = localToday()): string | null {
    if (!value) return "撮影日を入力してください";
    if (value > today) return `明日以降の日付は入力できません。${formatDay(today)}までの、撮影した日を入力してください`;
    const other = videos.find((v) => v.name !== name && v.date === value);
    if (other) return `${formatDay(value)}は「${other.name}」の撮影日になっています。別の日付を入力するか、先に「${other.name}」の日付を直してください`;
    return null;
}
