import type { HTMLAttributes, ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

// DADS ステップナビゲーション（https://design.digital.go.jp/dads/components/step-navigation/ / HTML 版 step-navigation.css）。
// 申請などの複数画面にわたる手続きで、全体の流れと現在位置を示す。
//   - <ol> + <li>。番号付きの丸（44px）を線でつなぐ。
//   - 完了（done）: キーカラー塗り + チェック、現在（current）: aria-current="step" + キーカラーの太枠、未到達: グレー枠。
//   - スクリーンリーダー向けに「ステップ n / N（完了 / 現在）」を sr-only で読み上げる。番号・アイコンは装飾。
//   - orientation: horizontal（横に並べて幅不足なら横スクロール）/ vertical（モバイル推奨）。
// 本テンプレートでは DADS の黒（solid-gray-800）ではなくキーカラーで現在地・完了を示し、他のナビゲーションの現在地表現と揃えた。

export type Step = {
    label: ReactNode;
    description?: ReactNode;
};

export type StepNavigationProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
    steps: readonly Step[];
    /** 現在のステップ（0 始まり）。steps.length 以上にするとすべて完了。 */
    current: number;
    orientation?: "horizontal" | "vertical";
    /** nav の aria-label。 */
    label?: string;
};

type StepState = "done" | "current" | "upcoming";

const CIRCLE: Record<StepState, string> = {
    done: "border-primary bg-primary text-text-on-primary",
    // 二重の円の隙間は白で塗り、つなぐ線が隙間から見えないようにする（outline ではなく ring + ring-offset）。
    current: "border-primary bg-surface text-primary ring-2 ring-primary ring-offset-2 ring-offset-surface",
    upcoming: "border-border bg-surface text-text",
};

const STATE_LABEL: Record<StepState, string> = { done: "完了", current: "現在のステップ", upcoming: "" };

export function StepNavigation({ steps, current, orientation = "horizontal", label = "手続きの流れ", className, ...props }: StepNavigationProps) {
    const horizontal = orientation === "horizontal";
    const total = steps.length;

    return (
        <nav aria-label={label} className={cn("min-w-0 text-16 leading-170 tracking-2 text-text", horizontal && "overflow-x-auto py-1", className)} {...props}>
            <ol className={cn("m-0 flex list-none p-0", horizontal ? "flex-row" : "flex-col")}>
                {steps.map((step, i) => {
                    const state: StepState = i < current ? "done" : i === current ? "current" : "upcoming";
                    return (
                        <li
                            key={i}
                            aria-current={state === "current" ? "step" : undefined}
                            className={cn(
                                "relative",
                                // 丸をつなぐ線（擬似要素）。丸の中心（余白 4px + 44px の半分 = 26px）に合わせる。
                                horizontal
                                    ? cn(
                                          "min-w-40 flex-1 px-4 text-center",
                                          "before:absolute before:top-6.5 before:right-1/2 before:left-0 before:border-t before:border-border first:before:hidden",
                                          "after:absolute after:top-6.5 after:right-0 after:left-1/2 after:border-t after:border-border last:after:hidden",
                                      )
                                    : cn(
                                          "flex gap-4 pb-6 last:pb-0",
                                          "before:absolute before:top-13 before:bottom-0 before:left-6.5 before:border-l before:border-border last:before:hidden",
                                      ),
                            )}
                        >
                            <span className="sr-only">
                                ステップ {i + 1} / {total}
                                {STATE_LABEL[state] && `、${STATE_LABEL[state]}`}
                            </span>
                            <span
                                aria-hidden="true"
                                className={cn(
                                    // z-10: つなぐ線（::after）より前面に描き、線が丸の中に入り込まないようにする。
                                    "relative z-10 m-1 grid size-11 shrink-0 place-content-center rounded-full border-2 text-20 leading-150 font-bold tracking-2",
                                    horizontal && "mx-auto",
                                    CIRCLE[state],
                                )}
                            >
                                {state === "done" ? <Icon icon={Check} size="lg" /> : i + 1}
                            </span>
                            <span className={cn("block min-w-0", horizontal ? "mt-4" : "py-2.5")}>
                                <span className="block text-18 leading-160 font-bold tracking-2 break-words">{step.label}</span>
                                {step.description && <span className="mt-1 block text-text-muted break-words">{step.description}</span>}
                            </span>
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
