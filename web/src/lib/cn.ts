// className を結合する小さなヘルパー（文字列以外（false / null / undefined / 0）を除き、空白で連結する）。
export type ClassValue = string | boolean | number | bigint | null | undefined;

export function cn(...values: ClassValue[]): string {
    return values.filter((v): v is string => typeof v === "string" && v !== "").join(" ");
}
