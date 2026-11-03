import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Wifi } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { api, ApiError } from "@/api/client";
import { Loading } from "@/components/app/PageStatus";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { NotificationBanner } from "@/components/ui/NotificationBanner";
import { PageHeader } from "@/components/ui/PageHeader";
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
        return <Loading label="確認しています" />;
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
        <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
            <PageHeader
                title="パスワードを入力"
                description={
                    <span className="flex items-start gap-2">
                        {/* 1 行目の高さ (1lh) の箱の中央に置き、文字が折り返しても 1 行目とそろえる（テンプレートの D-21） */}
                        <span className="flex h-lh shrink-0 items-center">
                            <Icon icon={Wifi} size="sm" className="text-primary" />
                        </span>
                        Mac と同じ Wi-Fi に接続してから、Mac で設定したパスワードを入力してください。
                    </span>
                }
            />

            {/* 送信の結果のエラーは、入力欄の上にまとめて出し、すぐ読み上げる（docs/migration-decisions.md M-10） */}
            {error && <NotificationBanner id="login-error" type="error" live="assertive" title={error} />}

            <FormField label="パスワード" id="password">
                <div className="relative">
                    <Input
                        type={visible ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        invalid={error !== null}
                        aria-describedby={error ? "login-error" : undefined}
                        className="pr-14"
                    />
                    <IconButton
                        icon={visible ? EyeOff : Eye}
                        label={visible ? "パスワードを隠す" : "パスワードを表示"}
                        aria-pressed={visible}
                        className="absolute top-0.5 right-0.5"
                        onClick={() => setVisible((v) => !v)}
                    />
                </div>
            </FormField>

            <Button type="submit" size="lg" block loading={submitting} disabled={!password}>
                {submitting ? "接続しています…" : "接続する"}
            </Button>
        </form>
    );
}
