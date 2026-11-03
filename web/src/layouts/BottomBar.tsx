import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Button, type ButtonStyleProps } from "@/components/ui/Button";

type Props = {
    /** 前の画面へ戻るときの文言と動き。 */
    back?: { label: string; onClick: () => void };
    /** 主な操作の上に添える、短い要約（採用数など）。 */
    summary?: ReactNode;
    /** 主な操作。PRIMARY_ACTION を付けた Button か ButtonAnchor を 1 つだけ置く。 */
    children: ReactNode;
};

/** 主な操作のボタンの見た目。どの画面でも同じ大きさ（DADS ボタン lg・幅いっぱい）にする。 */
export const PRIMARY_ACTION: ButtonStyleProps = { variant: "solid-fill", size: "lg", block: true };

// 画面の一番下に固定する操作の帯（omoideの業務部品。web/README.mdの「テンプレートとの違い」）。
// 主な操作（次へ・生成・保存）はどの画面でも一番下の全幅に置き、戻る操作と要約はその上の行に置く。
// iPhone のホームバーに重ならないよう、安全領域の分だけ余白を取る。
export default function BottomBar({ back, summary, children }: Props) {
    return (
        <div className="sticky bottom-0 z-10 -mx-4 mt-auto flex flex-col gap-2 border-t border-border bg-surface px-4 pt-2 pb-safe-3">
            <div className="flex min-h-11 items-center justify-between gap-2">
                {back ? (
                    <Button variant="text" size="sm" leadIcon={ChevronLeft} className="-ml-1" onClick={back.onClick}>
                        {back.label}
                    </Button>
                ) : (
                    <span />
                )}
                {summary && (
                    <p className="m-0 truncate text-right text-16 text-text-muted" aria-live="polite">
                        {summary}
                    </p>
                )}
            </div>
            {children}
        </div>
    );
}
