import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, launcherApi } from "@/api/client";
import type { LauncherStatus, ShareExpiry } from "@/api/types";
import { LoadFailure, Loading } from "@/components/app/PageStatus";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { NotificationBanner } from "@/components/ui/NotificationBanner";
import { PageHeader } from "@/components/ui/PageHeader";
import { RadioGroup } from "@/components/ui/RadioGroup";

const MIN_PASSWORD_LENGTH = 4;

const EXPIRY_OPTIONS: { value: ShareExpiry; label: string }[] = [
    { value: "1h", label: "1時間" },
    { value: "2h", label: "2時間" },
    { value: "4h", label: "4時間" },
];

/** 共有中に、期限が来て止まったことに気づけるよう、様子を読み直す間隔。 */
export const statusPolling = { intervalMs: 3000 };

// Mac のブラウザーで開く「始める」画面。パスワードと期限を決めて、スマホ向けの共有を始める。
// 共有中は QR コードを大きく出す。Mac の中からしか開けない（setlog_join/launcher.py）。
export default function LauncherPage() {
    const [status, setStatus] = useState<LauncherStatus | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [quitted, setQuitted] = useState(false);

    const load = useCallback(() => {
        launcherApi.status().then(
            (s) => {
                setStatus(s);
                setLoadError(null);
            },
            (error: unknown) => setLoadError(error instanceof ApiError ? error.message : "読み込めませんでした"),
        );
    }, []);

    useEffect(load, [load]);

    // 共有中は、期限が来て止まったことを画面に出せるよう、ときどき読み直す
    const running = status?.state === "running";
    useEffect(() => {
        if (!running) return;
        const timer = setInterval(load, statusPolling.intervalMs);
        return () => clearInterval(timer);
    }, [running, load]);

    if (quitted) {
        return (
            <div className="flex flex-col gap-6">
                <PageHeader title="omoideを終了しました" description="このタブは閉じてかまいません。もう一度使うときは、omoideを起動し直してください。" />
            </div>
        );
    }
    if (loadError) {
        return (
            <div className="flex flex-col gap-6">
                <PageHeader title="omoideを始める" />
                <LoadFailure message={loadError} onRetry={load} />
            </div>
        );
    }
    if (!status) return <Loading />;
    return status.state === "running" ? (
        <Sharing status={status} onChange={setStatus} onQuit={() => setQuitted(true)} />
    ) : (
        <StartForm status={status} onStarted={setStatus} />
    );
}

function StartForm({ status, onStarted }: { status: LauncherStatus; onStarted: (s: LauncherStatus) => void }) {
    const [password, setPassword] = useState("");
    const [confirmation, setConfirmation] = useState("");
    const [expires, setExpires] = useState<ShareExpiry>("2h");
    const [errors, setErrors] = useState<{ password?: string; confirmation?: string }>({});
    const [serverError, setServerError] = useState<string | null>(null);
    const [starting, setStarting] = useState(false);

    async function submit(e: FormEvent) {
        e.preventDefault();
        // 送る前に、その場で分かる誤りを入力欄の下に出す
        const next: typeof errors = {};
        if (password.length < MIN_PASSWORD_LENGTH) next.password = `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください`;
        else if (confirmation !== password) next.confirmation = "上のパスワードと同じものを入力してください";
        setErrors(next);
        setServerError(null);
        if (next.password || next.confirmation) return;
        setStarting(true);
        try {
            onStarted(await launcherApi.start(password, expires));
        } catch (error) {
            setServerError(error instanceof ApiError ? error.message : "始められませんでした。もう一度お試しください");
        } finally {
            setStarting(false);
        }
    }

    return (
        <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-6">
            <PageHeader
                title="omoideを始める"
                description="スマホで入力するパスワードを決めて、共有を始めます。始めると、スマホで読み取るQRコードが出ます。"
            />
            {status.notice && <NotificationBanner type="info" as="h2" title={status.notice} />}
            {serverError && <NotificationBanner type="error" live="assertive" as="h2" title={serverError} />}

            <FormField label="パスワード" requirement="required" supportText={`${MIN_PASSWORD_LENGTH}文字以上。スマホで入力します。`} errorText={errors.password}>
                <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </FormField>
            <FormField label="パスワード（確認）" requirement="required" errorText={errors.confirmation}>
                <Input type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
            </FormField>
            <FormField label="共有の期限" as="fieldset" supportText="期限が来ると、スマホの画面は使えなくなります。">
                <RadioGroup name="expires" direction="horizontal" size="md" value={expires} onChange={(v) => setExpires(v as ShareExpiry)} options={EXPIRY_OPTIONS} />
            </FormField>

            <Button type="submit" size="lg" block loading={starting}>
                共有を始める
            </Button>
            <p className="m-0 text-text-muted">
                動画の保存先：<span className="break-all">{status.storage.input}</span>
            </p>
        </form>
    );
}

function Sharing({ status, onChange, onQuit }: { status: LauncherStatus; onChange: (s: LauncherStatus) => void; onQuit: () => void }) {
    const { confirm } = useConfirm();
    const endsAt = status.ends_at ? new Date(status.ends_at) : null;
    const [busy, setBusy] = useState(false);

    async function stop() {
        const ok = await confirm({ title: "共有を止めますか", message: "スマホの画面は使えなくなります。選んだ内容は残ります。", confirmLabel: "止める" });
        if (!ok) return;
        setBusy(true);
        try {
            onChange(await launcherApi.stop());
        } finally {
            setBusy(false);
        }
    }

    async function quit() {
        const ok = await confirm({ title: "omoideを終了しますか", message: "共有を止めて、omoideを終了します。選んだ内容は残ります。", confirmLabel: "終了する" });
        if (!ok) return;
        await launcherApi.quit().catch(() => undefined);
        onQuit();
    }

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="スマホでQRコードを読み取ってください"
                description="Macと同じWi-Fiにつないだスマホのカメラで読み取り、決めたパスワードを入力します。"
            />
            <Card padding="sm">
                <CardBody className="flex flex-col items-center gap-4">
                    {/* QR コードは、暗い配色でも読み取れるよう白地に置く */}
                    <span className="rounded-8 bg-white p-4">
                        <img src={launcherApi.qrUrl(status.url ?? "")} alt="共有のURLのQRコード" width={256} height={256} className="size-64" />
                    </span>
                    <dl className="m-0 flex w-full flex-col gap-2">
                        <div className="flex flex-col">
                            <dt className="font-bold">共有のURL</dt>
                            <dd className="m-0 break-all text-text-muted">{status.url}</dd>
                        </div>
                        {endsAt && (
                            <div className="flex flex-col">
                                <dt className="font-bold">期限</dt>
                                <dd className="nums m-0 text-text-muted">
                                    {endsAt.getHours()}:{String(endsAt.getMinutes()).padStart(2, "0")}まで
                                </dd>
                            </div>
                        )}
                        <div className="flex flex-col">
                            <dt className="font-bold">取り込み済みの動画</dt>
                            <dd className="nums m-0 text-text-muted">{status.videos ?? 0}本</dd>
                        </div>
                    </dl>
                </CardBody>
            </Card>
            <div className="flex flex-wrap gap-x-4 gap-y-3">
                <Button variant="outline" loading={busy} onClick={() => void stop()}>
                    共有を止める
                </Button>
                <Button variant="outline" tone="error" onClick={() => void quit()}>
                    omoideを終了する
                </Button>
            </div>
        </div>
    );
}
