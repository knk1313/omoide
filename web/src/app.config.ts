// アプリ全体の設定。
// index.html の <title> と description も、ビルド時にここの値で置き換える（vite.config.ts）。
import { Film, type LucideIcon } from "lucide-react";

/** 共有 URL を開いてログインした後に、順に進む画面。 */
export const steps = [
    { label: "選ぶ", path: "/" },
    { label: "速度", path: "/settings" },
    { label: "確認", path: "/preview" },
] as const;

export const appConfig = {
    /** ヘッダーとブラウザタイトルに表示するアプリ名。 */
    name: "omoide",
    /** index.html の meta description。 */
    description: "Setlog の動画をスマホで選んで、1 本にまとめる",
    /** ヘッダーのアプリ名の左に置くアイコン。 */
    logo: Film as LucideIcon,
    /** 日付の表示。時刻は端末のタイムゾーンで表示する。 */
    locale: "ja-JP",
};
