import { createContext, useCallback, useContext, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

// トースト通知。DADS に該当コンポーネントがないため、ノティフィケーションバナーの縮小版として設計する（docs/decisions.md D-10）。
//   - 画面右上（モバイルは下部中央）に固定表示、role="status"（aria-live="polite"）のリージョン
//   - 意味色の枠 2px、角丸 8px、elevation-3、アイコン、閉じるボタン（固定表示には必ず閉じるボタンを付ける）
//   - 8 秒で自動消去。ホバー・フォーカス中は止める。フォーカスがあるときは Esc で閉じる。同時表示は 3 件まで
//   const { toast } = useToast();
//   toast({ type: "success", title: "保存しました" });

export type ToastType = "success" | "error" | "info";

export type ToastOptions = {
    title: string;
    description?: string;
    type?: ToastType;
    /** 自動で消すまでのミリ秒。0 なら自動で消さない。既定は 8000。 */
    duration?: number;
};

type ToastItem = Required<Omit<ToastOptions, "description">> & { id: number; description?: string };

type ToastContextValue = {
    toast: (options: ToastOptions) => number;
    dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToast は ToastProvider の内側で使ってください");
    return ctx;
}

export const TOAST_DEFAULT_DURATION = 8000;
export const TOAST_MAX = 3;

const ICONS: Record<ToastType, LucideIcon> = { success: CircleCheck, error: CircleAlert, info: Info };
const COLORS: Record<ToastType, { frame: string; icon: string }> = {
    success: { frame: "border-success", icon: "text-success" },
    error: { frame: "border-error", icon: "text-error" },
    info: { frame: "border-info", icon: "text-info" },
};

export type ToastProviderProps = { children: ReactNode };

export function ToastProvider({ children }: ToastProviderProps) {
    const [items, setItems] = useState<ToastItem[]>([]);
    const nextId = useRef(1);

    const dismiss = useCallback((id: number) => {
        setItems((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const toast = useCallback(({ title, description, type = "info", duration = TOAST_DEFAULT_DURATION }: ToastOptions) => {
        const id = nextId.current++;
        // 上限を超えたら古いものから消す（画面を覆い尽くさないため）。
        setItems((prev) => [...prev, { id, title, description, type, duration }].slice(-TOAST_MAX));
        return id;
    }, []);

    return (
        <ToastContext.Provider value={{ toast, dismiss }}>
            {children}
            {/* リージョンは常に置いておく（追加時に aria-live が機能するように）。モバイルは下部中央、md 以上は右上。 */}
            <div
                role="status"
                aria-live="polite"
                className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col gap-2 md:inset-x-auto md:top-4 md:right-4 md:bottom-auto md:w-full md:max-w-sm"
            >
                {items.map((item) => (
                    <ToastView key={item.id} item={item} dismiss={dismiss} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

function ToastView({ item, dismiss }: { item: ToastItem; dismiss: (id: number) => void }) {
    const onDismiss = useCallback(() => dismiss(item.id), [dismiss, item.id]);
    const TypeIcon = ICONS[item.type];
    const color = COLORS[item.type];
    // ホバー・フォーカス中は自動消去を止め、離れたら残り時間から再開する。
    const [paused, setPaused] = useState(false);
    const remaining = useRef(item.duration);
    const startedAt = useRef(0);

    useEffect(() => {
        if (item.duration <= 0 || paused) return;
        startedAt.current = Date.now();
        const timer = setTimeout(onDismiss, remaining.current);
        return () => {
            clearTimeout(timer);
            remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
        };
    }, [paused, item.duration, onDismiss]);

    function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
        if (e.key === "Escape") {
            e.stopPropagation();
            onDismiss();
        }
    }

    return (
        <div
            data-type={item.type}
            className={cn("pointer-events-auto flex items-start gap-2 rounded-8 border-2 bg-surface p-4 pr-2 text-16 leading-170 tracking-2 text-text shadow-3", color.frame)}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
            }}
            onKeyDown={onKeyDown}
        >
            <span className="flex h-lh shrink-0 items-center">
                <TypeIcon aria-hidden="true" focusable="false" className={cn("size-6", color.icon)} />
            </span>
            <div className="min-w-0 flex-1">
                <p className="m-0 font-bold text-text-strong">{item.title}</p>
                {item.description && <p className="m-0 text-text-muted">{item.description}</p>}
            </div>
            <button
                type="button"
                onClick={onDismiss}
                aria-label="通知を閉じる"
                className="-my-2 flex size-11 shrink-0 items-center justify-center rounded-6 text-text-strong hover:bg-surface-muted focus-visible:focus-ring-fill"
            >
                <Icon icon={X} size="lg" />
            </button>
        </div>
    );
}
