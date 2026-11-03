import type { ReactNode, Ref } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

// DADS ノティフィケーションバナー（HTML 版 notification-banner.css）。
// ページや要素に関わる重要度の高い情報を、ユーザーの操作に関わらずサービス側から提示する。
//   type: success / error / warning / info（情報提示 1 = プライマリー色）/ neutral（情報提示 2 = solid-gray-536）
//   style: standard（枠 3px、角丸 12px）/ color-chip（枠 2px + 左端の帯）
// アイコンとタイトルは必須。説明・年月日・閉じるボタン・アクションボタンは任意。
// アクションボタンで「閉じる」を作らない（閉じるには onClose の「閉じる」パーツを使う）。
// 固定表示（fixed / sticky）で使うときは必ず onClose を渡す。
// ページ読み込み時に静的に表示する前提なので既定では role を付けない。操作の結果として動的に出す場合は live を付ける。

export type NotificationBannerType = "success" | "error" | "warning" | "info" | "neutral";
export type NotificationBannerStyle = "standard" | "color-chip";

export type NotificationBannerProps = {
    type?: NotificationBannerType;
    style?: NotificationBannerStyle;
    /** バナータイトル（必須）。 */
    title: ReactNode;
    /** タイトルの見出しレベル。ページの見出し構造に合わせる。 */
    as?: "h2" | "h3" | "h4";
    /** 本文（バナーデスクリプション）。 */
    description?: ReactNode;
    /** 表示する年月日や掲載期間（例: 2026年4月1日）。 */
    date?: string;
    /** <time> の dateTime 属性（例: 2026-04-01）。省略時は date をそのまま使う。 */
    dateTime?: string;
    /** 「閉じる」ボタンを表示し、押されたときに呼ぶ。閉じた状態はサービス側で記憶する。 */
    onClose?: () => void;
    /** アクションボタン群（Button）。md 以上では右寄せ、モバイルでは縦に積む。 */
    actions?: ReactNode;
    /**
     * 動的に表示する通知として role="status" を付ける（ページ読み込み時の静的表示では付けない）。
     * "assertive" は role="alert"。操作の結果としてすぐ伝えるべきエラーに使う（omoideでの追加。web/README.mdの「テンプレートとの違い」）。
     */
    live?: boolean | "assertive";
    id?: string;
    /** タイトル見出しの ref。送信エラーの後などに見出しへフォーカスを移すときに使う（見出しは tabIndex=-1）。 */
    headingRef?: Ref<HTMLHeadingElement>;
    className?: string;
};

const ICONS: Record<NotificationBannerType, LucideIcon> = {
    success: CircleCheck,
    error: CircleAlert,
    warning: TriangleAlert,
    info: Info,
    neutral: Info,
};

// 枠線の色・アイコンの色（文字と同じ意味色）と、カラーチップ（左端の帯）の色。
// warning の帯は非テキスト要素なので DADS と同じく Yellow-400 を使う。
const COLORS: Record<NotificationBannerType, { frame: string; icon: string; chip: string }> = {
    success: { frame: "border-success", icon: "text-success", chip: "border-l-success" },
    error: { frame: "border-error", icon: "text-error", chip: "border-l-error" },
    warning: { frame: "border-warning", icon: "text-warning", chip: "border-l-warning-chip" },
    info: { frame: "border-info", icon: "text-info", chip: "border-l-info" },
    neutral: { frame: "border-neutral", icon: "text-neutral", chip: "border-l-neutral" },
};

export function NotificationBanner({
    type = "info",
    style = "standard",
    title,
    as: Heading = "h2",
    description,
    date,
    dateTime,
    onClose,
    actions,
    live = false,
    id,
    headingRef,
    className,
}: NotificationBannerProps) {
    const TypeIcon = ICONS[type];
    const color = COLORS[type];
    const hasBody = Boolean(description || date);

    return (
        <div
            id={id}
            role={live === "assertive" ? "alert" : live ? "status" : undefined}
            data-type={type}
            data-style={style}
            className={cn(
                "flex flex-col gap-4 bg-surface pt-2 pr-4 pb-6 text-16 leading-170 tracking-2 text-text md:gap-6 md:pt-6 md:pr-6 md:pb-8",
                color.frame,
                // standard は 3px 枠 + 角丸 12px。color-chip は 2px 枠 + 左 8px の帯（帯の分だけ左の余白を減らす）。
                style === "standard" ? "rounded-12 border-3 pl-4 md:pl-6" : cn("border-2 border-l-8 pl-4 md:pl-8", color.chip),
                className,
            )}
        >
            <div className="flex items-start gap-4 md:gap-6">
                {/* 見出しと同じ文字設定で 1 行分の高さの枠を作り、その中央にアイコンを置く（見出しが折り返しても 1 行目にそろう） */}
                <span className="mt-0.75 flex h-lh w-6 shrink-0 items-center justify-center text-17 leading-170 md:mt-0.5 md:w-9 md:text-20 md:leading-150">
                    <TypeIcon aria-hidden="true" focusable="false" className={cn("size-7 shrink-0 md:size-11", color.icon)} />
                </span>
                <Heading ref={headingRef} tabIndex={-1} id={id ? `${id}-title` : undefined} className="m-0 min-w-0 focus-visible:focus-ring-fill flex-1 pt-0.75 text-17 font-bold leading-170 text-text-strong md:pt-0.5 md:text-20 md:leading-150">
                    {title}
                </Heading>
                {onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        className="-mt-1 -mr-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-8 text-16 leading-none text-text-strong hover:bg-surface-muted hover:underline hover:underline-offset-3 focus-visible:focus-ring-fill md:-mr-3 md:min-h-0 md:min-w-0 md:px-3 md:pt-1 md:pb-1.5"
                    >
                        <Icon icon={X} size="lg" className="md:mt-0.5" />
                        {/* モバイルはアイコンのみ表示し、テキストはスクリーンリーダーにだけ渡す。 */}
                        <span className="sr-only md:not-sr-only">閉じる</span>
                    </button>
                )}
            </div>
            {hasBody && (
                <div className="-mt-1 flex flex-col gap-2 md:mt-0 md:pl-15">
                    {date && (
                        <p className="m-0">
                            <time dateTime={dateTime ?? date}>{date}</time>
                        </p>
                    )}
                    {description && <div className="min-w-0">{description}</div>}
                </div>
            )}
            {actions && <div className="-mb-2 flex flex-col gap-2 md:flex-row md:justify-end md:gap-4 md:pl-15">{actions}</div>}
        </div>
    );
}
