// 画面に出す日付と時間の書き方。日付は端末のタイムゾーンで表示する。

const dateFormatter = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });

/** ISO 8601 の日時を「2026年9月19日(土)」の形にする。 */
export function formatDate(iso: string): string {
    return dateFormatter.format(new Date(iso));
}

/** `2026-09-19` を「2026年9月19日(土)」の形にする。端末のタイムゾーンで日がずれないよう、その日の 0 時として読む。 */
export function formatDay(day: string): string {
    const [y, m, d] = day.split("-").map(Number);
    return dateFormatter.format(new Date(y, m - 1, d));
}

/** バイト数を「512B」「3.4MB」「1.2GB」の形にする（1024 進み）。 */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value.toFixed(value < 10 ? 1 : 0)}${units[unit]}`;
}

/** 秒を「46秒」「1分23秒」の形にする。 */
export function formatSeconds(seconds: number): string {
    const total = Math.round(seconds);
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    if (minutes === 0) return `${rest}秒`;
    return rest === 0 ? `${minutes}分` : `${minutes}分${rest}秒`;
}
