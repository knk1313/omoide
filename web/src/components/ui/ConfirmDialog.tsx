import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button, type ButtonTone } from "./Button";
import { ModalDialog } from "./ModalDialog";

// window.confirm の置き換え。ModalDialog を使い、削除などの破壊的な操作の前に確認を取る。
//   const { confirm } = useConfirm();
//   if (!(await confirm({ title: "削除しますか", message: "この操作は取り消せません", tone: "error" }))) return;
// 表示中に confirm() が呼ばれたら待ち行列に積み、前の確認が閉じてから順に表示する
// （上書きすると前の呼び出しの Promise が解決されないまま残るため）。
// DADS の規定により、確認ダイアログだけを安全対策にしない（取り消し・復元できる設計を検討する）。

export type ConfirmOptions = {
    title: string;
    /** 補足説明。取り消せない旨などを書く。 */
    message?: ReactNode;
    /** 確定ボタンのラベル。既定は「OK」。 */
    confirmLabel?: string;
    /** キャンセルボタンのラベル。既定は「キャンセル」。 */
    cancelLabel?: string;
    /** error = 削除・破棄など取り消せない操作（確定ボタンをエラー色にする）。 */
    tone?: ButtonTone;
};

type ConfirmContextValue = {
    /** 確認ダイアログを表示し、確定なら true、キャンセル・Esc なら false を返す。 */
    confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm(): ConfirmContextValue {
    const ctx = useContext(ConfirmContext);
    if (!ctx) throw new Error("useConfirmはConfirmProviderの内側で使ってください");
    return ctx;
}

type Request = ConfirmOptions & { id: number; resolve: (ok: boolean) => void };

export type ConfirmProviderProps = { children: ReactNode };

export function ConfirmProvider({ children }: ConfirmProviderProps) {
    const [queue, setQueue] = useState<Request[]>([]);
    const nextId = useRef(1);

    const confirm = useCallback((options: ConfirmOptions) => {
        return new Promise<boolean>((resolve) => {
            const id = nextId.current++;
            setQueue((q) => [...q, { ...options, id, resolve }]);
        });
    }, []);

    const current = queue[0];

    function settle(ok: boolean) {
        if (!current) return;
        current.resolve(ok);
        setQueue((q) => q.filter((r) => r.id !== current.id));
    }

    return (
        <ConfirmContext.Provider value={{ confirm }}>
            {children}
            {/* key で 1 件ごとに作り直し、初期フォーカスとフォーカス復帰を毎回かける。 */}
            {current && (
                <ModalDialog
                    key={current.id}
                    open
                    onClose={() => settle(false)}
                    title={current.title}
                    actions={
                        <>
                            <Button variant="outline" onClick={() => settle(false)}>
                                {current.cancelLabel ?? "キャンセル"}
                            </Button>
                            <Button tone={current.tone ?? "primary"} onClick={() => settle(true)}>
                                {current.confirmLabel ?? "OK"}
                            </Button>
                        </>
                    }
                >
                    {current.message}
                </ModalDialog>
            )}
        </ConfirmContext.Provider>
    );
}
