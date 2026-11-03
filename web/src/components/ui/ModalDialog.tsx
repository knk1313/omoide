import { Children, Fragment, isValidElement, useId, useRef, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import { Icon } from "./Icon";

// DADS モーダルダイアログ（HTML 版 modal-dialog.css）。
// 削除などの破壊的な操作の確認や、ダイアログ内で完結する短いメッセージに使う。
// ユーザーのボタン押下なしに開かない、フォームを入れない、告知に使わない（DADS の規定）。
//   - 見出し（h2）に初期フォーカス、Esc で閉じる、Tab はダイアログ内で巡回、閉じたら開く前の要素へ戻す
//   - 背景はスクロールを止め、inert で操作と読み上げの対象から外す
//   - 暗幕は opacity-gray-600、パネルは角丸 8px・枠 1px 黒・elevation-3、幅は最小 480px（モバイルは画面幅いっぱい）
//   - アクションボタンがあるときは「閉じる」ボタンを出さない（操作結果の違いが分からなくなるため）
// document.body にポータルで描画する。

export type ModalDialogSize = "md" | "lg";

export type ModalDialogProps = {
    open: boolean;
    /** 閉じる操作（Esc、閉じるボタン、暗幕クリック）で呼ぶ。 */
    onClose: () => void;
    /** 見出し（h2）。初期フォーカスが当たる。 */
    title: ReactNode;
    children?: ReactNode;
    /** アクションボタン。1 つなら中央、2 つなら左がキャンセル・右が確定、3 つ以上は右寄せ。モバイルでは縦に積む（確定が上）。 */
    actions?: ReactNode;
    /** md = 内容に合わせた幅（最小 480px）、lg = 広い幅（md 以上で最大 896px）。 */
    size?: ModalDialogSize;
    /** 閉じるボタンのラベル。 */
    closeLabel?: string;
    /** 閉じるボタンを表示するか。既定は actions がないときだけ表示する。 */
    showClose?: boolean;
    /** 暗幕のクリックで閉じるか。誤操作で入力内容が消えるのを防ぐため既定は false。 */
    dismissOnBackdrop?: boolean;
    id?: string;
    className?: string;
};

const SIZE: Record<ModalDialogSize, string> = {
    md: "md:w-fit md:min-w-dialog md:max-w-2xl",
    lg: "md:w-full md:max-w-4xl",
};

/**
 * アクションボタンの並び（DADS: 1 つは中央、2 つは左がキャンセル・右が確定、3 つ以上は右寄せ）。
 * モバイルでも同じ並びにする。収まらないときだけ折り返す（DOM 順 = 見た目の順 = フォーカス順を保つ）。
 */
export function actionsLayoutClass(count: number): string {
    if (count <= 1) return "justify-center";
    if (count === 2) return "justify-between";
    return "justify-end";
}

/** アクションの数。<>…</> でまとめて渡された場合は中身を数える。 */
function countActions(actions: ReactNode): number {
    return Children.toArray(actions).reduce<number>((sum, child) => {
        if (isValidElement(child) && child.type === Fragment) return sum + countActions((child as ReactElement<{ children?: ReactNode }>).props.children);
        return sum + 1;
    }, 0);
}

export function ModalDialog({
    open,
    onClose,
    title,
    children,
    actions,
    size = "md",
    closeLabel = "閉じる",
    showClose,
    dismissOnBackdrop = false,
    id,
    className,
}: ModalDialogProps) {
    const autoId = useId();
    const dialogId = id ?? autoId;
    const titleId = `${dialogId}-title`;
    const bodyId = `${dialogId}-body`;
    const overlayRef = useRef<HTMLDivElement>(null);
    const titleRef = useRef<HTMLHeadingElement>(null);

    useModalBehavior({ open, onClose, containerRef: overlayRef, initialFocusRef: titleRef, inertOutside: true });

    if (!open) return null;

    const actionCount = countActions(actions);
    const close = showClose ?? actionCount === 0;

    function onBackdropMouseDown(e: MouseEvent<HTMLDivElement>) {
        // 暗幕そのものを押したときだけ閉じる（パネル内のクリックでは閉じない）。
        if (dismissOnBackdrop && e.target === e.currentTarget) onClose();
    }

    return createPortal(
        <div
            ref={overlayRef}
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-scrim p-4 md:p-6"
            onMouseDown={onBackdropMouseDown}
        >
            <div
                id={dialogId}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={children ? bodyId : undefined}
                className={cn(
                    "flex max-h-full w-full max-w-full flex-col gap-3 rounded-8 border border-border-emphasis bg-surface text-16 leading-170 tracking-2 text-text shadow-3 break-words md:gap-4",
                    SIZE[size],
                    className,
                )}
            >
                <div className="flex shrink-0 items-start gap-4 px-4 pt-2 md:px-6 md:pt-6">
                    <h2 ref={titleRef} id={titleId} tabIndex={-1} className="m-0 min-w-0 flex-1 text-std-24B-150 text-text-strong md:text-std-28B-150">
                        {title}
                    </h2>
                    {close && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="tap-area -mr-3 flex shrink-0 items-center gap-1 rounded-6 px-3 pt-1 pb-1.5 text-16 leading-none tracking-2 text-text hover:bg-surface-muted hover:underline hover:underline-offset-3 focus-visible:focus-ring-fill"
                        >
                            <Icon icon={X} size="lg" className="mt-0.5 text-text-strong" />
                            {closeLabel}
                        </button>
                    )}
                </div>
                {children && (
                    <div id={bodyId} className="min-h-0 min-w-0 overflow-y-auto px-4 pb-8 md:px-6">
                        {children}
                    </div>
                )}
                {actionCount > 0 && (
                    <div className={cn("flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-4 md:px-6 md:pb-6", actionsLayoutClass(actionCount))}>
                        {actions}
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
}
