import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Wifi } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { api, ApiError } from "@/api/client";
import Button from "@/components/Button";
import IconButton from "@/components/IconButton";
import { useSession } from "@/session/Session";
import ShareProblem, { isShareProblem } from "@/session/ShareProblem";

export default function LoginPage() {
    const { status, loggedIn, handleError } = useSession();
    const navigate = useNavigate();
    const location = useLocation();
    const [password, setPassword] = useState("");
    const [visible, setVisible] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ログイン後は、ログインを求められる前に開こうとしていた画面へ戻す
    const from = (location.state as { from?: string } | null)?.from ?? "/";

    if (status === "checking") {
        return <p className="pt-8 text-center text-sm text-muted">確認しています…</p>;
    }
    if (status === "ready") {
        return <Navigate to={from} replace />;
    }
    if (isShareProblem(status)) {
        return <ShareProblem status={status} />;
    }

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (!password || submitting) return;
        setSubmitting(true);
        setError(null);
        try {
            await api.login(password);
            loggedIn();
            navigate(from, { replace: true });
        } catch (err) {
            // 401 はパスワード違いなのでこの画面で伝える。期限切れや接続切れは画面ごと切り替える
            if (!(err instanceof ApiError && err.status === 401) && handleError(err)) return;
            setError(err instanceof ApiError ? err.message : "ログインできませんでした。もう一度お試しください");
            setPassword("");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <form onSubmit={submit} className="flex flex-1 flex-col gap-5 pt-6" noValidate>
            <div className="flex flex-col gap-2">
                <h1 className="text-xl font-semibold text-ink">パスワードを入力</h1>
                <p className="flex items-start gap-2 text-sm leading-relaxed text-muted">
                    {/* 1 行目の高さ (1lh) の箱の中央に置き、文字が折り返しても 1 行目とそろえる */}
                    <span className="flex h-[1lh] shrink-0 items-center">
                        <Wifi className="h-4 w-4 text-brand" aria-hidden />
                    </span>
                    Mac と同じ Wi-Fi に接続してから、Mac で設定したパスワードを入力してください。
                </p>
            </div>

            <div className="flex flex-col gap-1.5">
                <label htmlFor="password" className="text-sm font-medium text-ink">
                    パスワード
                </label>
                <div className="relative">
                    <input
                        id="password"
                        type={visible ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        aria-invalid={error !== null}
                        aria-describedby={error ? "login-error" : undefined}
                        // iOS Safari は 16px 未満の入力欄にフォーカスすると画面を拡大するので、16px にする
                        className="h-12 w-full rounded-control border border-control-border bg-surface pl-4 pr-12 text-base text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 aria-[invalid=true]:border-danger"
                    />
                    <IconButton
                        className="absolute right-1 top-1/2 h-10 w-10 -translate-y-1/2"
                        onClick={() => setVisible((v) => !v)}
                        aria-label={visible ? "パスワードを隠す" : "パスワードを表示"}
                        aria-pressed={visible}
                    >
                        {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </IconButton>
                </div>
                {error && (
                    <p id="login-error" role="alert" className="text-sm text-danger">
                        {error}
                    </p>
                )}
            </div>

            <Button type="submit" className="h-12 w-full text-base" disabled={!password || submitting}>
                {submitting ? "接続しています…" : "接続する"}
            </Button>
        </form>
    );
}
