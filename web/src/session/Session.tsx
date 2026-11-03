import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError } from "@/api/client";

/**
 * この端末の状態。
 * - checking：サーバーに確かめている
 * - ready：ログイン済み
 * - login：パスワードの入力が要る
 * - no-share：共有 URL（QR コード）を開いていない
 * - expired：共有の期限が切れた
 * - offline：Mac につながらない
 */
export type SessionStatus = "checking" | "ready" | "login" | "no-share" | "expired" | "offline";

type SessionValue = {
    status: SessionStatus;
    /** ログインに成功したときに呼ぶ。 */
    loggedIn: () => void;
    /**
     * API のエラーを渡すと、ログイン切れ・期限切れ・接続切れなら状態を切り替えて true を返す。
     * true のときは画面の切り替えに任せ、呼び出し側でエラーを表示しなくてよい。
     */
    handleError: (error: unknown) => boolean;
};

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
    const value = useContext(SessionContext);
    if (!value) throw new Error("useSession は SessionProvider の内側で使ってください");
    return value;
}

function statusOf(error: unknown): SessionStatus | null {
    if (!(error instanceof ApiError)) return null;
    if (error.status === 0) return "offline";
    if (error.status === 401) return "login";
    if (error.status === 410) return "expired";
    return null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<SessionStatus>("checking");

    useEffect(() => {
        let active = true;
        api.health()
            .then(() => active && setStatus("ready"))
            .catch((error: unknown) => {
                if (!active) return;
                // 入場用の Cookie が無いと、サーバーはどのパスにも 404 を返す。
                // 404 で見分けるのはこの確認だけにする（API は存在しないパネルにも 404 を返すため）
                setStatus(error instanceof ApiError && error.status === 404 ? "no-share" : (statusOf(error) ?? "offline"));
            });
        return () => {
            active = false;
        };
    }, []);

    const loggedIn = useCallback(() => setStatus("ready"), []);
    const handleError = useCallback((error: unknown) => {
        const next = statusOf(error);
        if (next === null) return false;
        setStatus(next);
        return true;
    }, []);

    const value = useMemo(() => ({ status, loggedIn, handleError }), [status, loggedIn, handleError]);
    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
