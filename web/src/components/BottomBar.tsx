import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import Button from "./Button";

type Props = {
    /** 前の画面へ戻るときの文言と動き。 */
    back?: { label: string; onClick: () => void };
    /** 主な操作の上に添える、短い要約（採用数など）。 */
    summary?: ReactNode;
    /** 主な操作。PRIMARY_ACTION のクラスを付けたボタンかリンクを 1 つだけ置く。 */
    children: ReactNode;
};

/** 主な操作に付けるクラス。どの画面でも同じ大きさ・同じ位置になる。 */
export const PRIMARY_ACTION = "h-12 w-full text-base";

// 画面の一番下に固定する操作の帯。主な操作（次へ・生成・保存）はどの画面でも一番下の全幅に置き、
// 戻る操作と要約はその上の行に置く。iPhone のホームバーに重ならないよう、安全領域の分だけ余白を取る。
export default function BottomBar({ back, summary, children }: Props) {
    return (
        <div className="sticky bottom-0 z-10 -mx-4 mt-auto flex flex-col gap-1 border-t border-hairline bg-canvas/95 px-4 pt-1 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur">
            <div className="flex h-11 items-center justify-between gap-2">
                {back ? (
                    <Button variant="text" size="sm" className="-ml-2 h-11 gap-1 px-2" onClick={back.onClick}>
                        <ChevronLeft className="h-4 w-4" aria-hidden />
                        {back.label}
                    </Button>
                ) : (
                    <span />
                )}
                {summary && (
                    <p className="truncate text-right text-sm text-muted" aria-live="polite">
                        {summary}
                    </p>
                )}
            </div>
            {children}
        </div>
    );
}
