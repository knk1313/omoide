import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

type ToastType = "success" | "error";
type ToastItem = { id: number; message: string; type: ToastType; leaving: boolean };
type ToastContextValue = { toast: (message: string, type?: ToastType) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

// 成功/失敗の通知を1つの仕組みに集約する（alert 等の乱立をなくす）。
export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToast は ToastProvider の内側で使ってください");
    return ctx;
}

// 1件のトースト。マウント時に降りてきて、leaving で退場アニメ（アンマウントは親が遅延）。
// エラーは読み上げでもすぐ伝わるよう alert にする。タップで消せる。
function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
    const [entered, setEntered] = useState(false);
    useEffect(() => {
        const id = requestAnimationFrame(() => setEntered(true));
        return () => cancelAnimationFrame(id);
    }, []);
    const show = entered && !item.leaving;
    return (
        <div
            role={item.type === "error" ? "alert" : "status"}
            onClick={onDismiss}
            className={`pointer-events-auto flex w-full items-start gap-2.5 rounded-surface bg-dark-surface py-3 pl-4 pr-5 text-sm leading-relaxed text-on-dark shadow-toast transition-[transform,opacity] duration-[550ms] ease-spring ${
                show ? "translate-y-0 scale-100 opacity-100" : "-translate-y-[140%] scale-90 opacity-0"
            }`}
        >
            {/* 1 行目の高さの箱の中央に置き、文言が折り返しても 1 行目とそろえる */}
            <span className="flex h-[1lh] shrink-0 items-center">
                {item.type === "error" ? (
                    <XCircle className="h-4 w-4 text-on-dark-danger" />
                ) : (
                    <CheckCircle2 className="h-4 w-4 text-on-dark-success" />
                )}
            </span>
            {item.message}
        </div>
    );
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<ToastItem[]>([]);
    const nextId = useRef(1);

    const dismiss = useCallback((id: number) => {
        setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
        setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 600);
    }, []);

    const toast = useCallback((message: string, type: ToastType = "success") => {
        const id = nextId.current++;
        setItems((prev) => [...prev, { id, message, type, leaving: false }]);
        // 成功は 3.5 秒、エラーは読み終えられるよう 6 秒で退場アニメを始め、アニメ後に取り除く。
        setTimeout(() => dismiss(id), type === "error" ? 6000 : 3500);
    }, [dismiss]);

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            {/* 画面の上に出す。下に固定した操作のボタンと重ねない。iPhone のノッチの下から始める */}
            <div className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),0.75rem)] z-[60] mx-auto flex w-full max-w-md flex-col gap-2 px-4">
                {items.map((t) => (
                    <ToastView key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}
