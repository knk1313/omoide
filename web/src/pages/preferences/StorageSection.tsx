import { useState } from "react";
import { api, ApiError } from "@/api/client";
import type { StorageFolders, StorageKind, StorageStatus } from "@/api/types";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { NotificationBanner } from "@/components/ui/NotificationBanner";
import { useToast } from "@/components/ui/Toast";
import { formatBytes } from "@/lib/format";
import { useSession } from "@/session/Session";

const KINDS: { kind: StorageKind; label: string; description: string }[] = [
    { kind: "input", label: "動画", description: "取り込んだ動画" },
    { kind: "output", label: "完成版", description: "保存した完成版の動画" },
    { kind: "work", label: "作業用ファイル", description: "サムネイル、プレビュー、選んだ内容など" },
];

/** 「12件・34MB」の形。 */
export function describeUsage({ count, bytes }: { count: number; bytes: number }): string {
    return count === 0 ? "ファイルはありません" : `${count}件・${formatBytes(bytes)}`;
}

function sameFolders(a: StorageFolders, b: StorageFolders): boolean {
    return KINDS.every(({ kind }) => a[kind] === b[kind]);
}

// 保存先（Mac の中で、動画・完成版・作業用ファイルを置くフォルダ）。
// 単体アプリでは変えられる。変えても今は移さず、次に Mac で omoide を起動したときに、今のファイルを新しい場所へ移す
// （使っている最中のファイルを動かさないため）。開発環境では、起動したフォルダの中に置き、変えられない。
// 入力欄の初期値はサーバーの状態から決める。保存・取りやめの後は、呼び出し側が key を変えて作り直す。
export default function StorageSection({ status, onChange }: { status: StorageStatus; onChange: (next: StorageStatus) => void }) {
    const { confirm } = useConfirm();
    const { toast } = useToast();
    const { handleError } = useSession();
    const [draft, setDraft] = useState<StorageFolders>(status.pending ?? status.current);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    if (!status.editable) {
        return (
            <section aria-labelledby="storage-title" className="flex flex-col gap-3">
                <h2 id="storage-title" className="m-0 text-std-20B-150 text-text-strong">
                    保存先
                </h2>
                <p className="m-0 text-text-muted">開発環境では、omoideを起動したフォルダの中に置きます。変えられるのは、配布している単体アプリだけです。</p>
                <FolderList folders={status.current} usage={status.usage} />
            </section>
        );
    }

    const total = KINDS.reduce((sum, { kind }) => sum + status.usage[kind].bytes, 0);

    async function save() {
        setError(null);
        const ok = await confirm({
            title: "保存先を変えますか",
            message: `次にMacでomoideを起動したときに、今のファイル（合計${formatBytes(total)}）を新しい場所へ移します。今使っている間は、今の保存先のままです。`,
            confirmLabel: "変える",
        });
        if (!ok) return;
        setSaving(true);
        try {
            onChange(await api.setStorage(draft));
            toast({ title: "次の起動から、新しい保存先を使います", type: "success" });
        } catch (err) {
            if (!handleError(err)) setError(err instanceof ApiError ? err.message : "保存できませんでした。もう一度お試しください");
        } finally {
            setSaving(false);
        }
    }

    async function cancel() {
        try {
            onChange(await api.cancelStorageChange());
            toast({ title: "保存先の変更を取りやめました", type: "success" });
        } catch (err) {
            if (!handleError(err)) toast({ title: err instanceof ApiError ? err.message : "取りやめられませんでした", type: "error" });
        }
    }

    const changed = !sameFolders(draft, status.pending ?? status.current);

    return (
        <section aria-labelledby="storage-title" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
                <h2 id="storage-title" className="m-0 text-std-20B-150 text-text-strong">
                    保存先
                </h2>
                <p className="m-0 text-text-muted">Macの中で、動画・完成版・作業用ファイルを置くフォルダです。変えると、次にMacでomoideを起動したときに、今のファイルを新しい場所へ移します。</p>
            </div>

            {status.pending && (
                <NotificationBanner
                    type="info"
                    as="h3"
                    title="次の起動で、保存先を変えます"
                    description={<FolderList folders={status.pending} />}
                    actions={
                        <Button variant="outline" block onClick={() => void cancel()}>
                            変更を取りやめる
                        </Button>
                    }
                />
            )}

            {status.presets.length > 0 && (
                <div className="flex flex-col gap-2">
                    <p className="m-0 font-bold">よく使う場所にまとめる</p>
                    <div className="flex flex-wrap gap-2">
                        {status.presets.map(({ label, ...folders }) => (
                            <Button
                                key={label}
                                variant="outline"
                                size="sm"
                                aria-pressed={sameFolders(draft, folders)}
                                onClick={() => {
                                    setDraft(folders);
                                    setError(null);
                                }}
                            >
                                {label}
                            </Button>
                        ))}
                    </div>
                </div>
            )}

            {error && <NotificationBanner id="storage-error" type="error" live="assertive" as="h3" title={error} />}

            {KINDS.map(({ kind, label, description }) => (
                <FormField key={kind} label={label} supportText={`${description}。今は${describeUsage(status.usage[kind])}`}>
                    <Input
                        value={draft[kind]}
                        onChange={(e) => {
                            setDraft({ ...draft, [kind]: e.target.value });
                            setError(null);
                        }}
                        invalid={error !== null}
                        // エラーのときだけ、上のバナーと結び付ける（undefined を渡すと、FormField の補足との結び付けが消える）
                        {...(error ? { "aria-describedby": "storage-error" } : {})}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                    />
                </FormField>
            ))}

            <Button variant="outline" block loading={saving} disabled={!changed} onClick={() => void save()}>
                保存先を変える
            </Button>
        </section>
    );
}

function FolderList({ folders, usage }: { folders: StorageFolders; usage?: StorageStatus["usage"] }) {
    return (
        <dl className="m-0 flex flex-col gap-2">
            {KINDS.map(({ kind, label }) => (
                <div key={kind} className="flex flex-col">
                    <dt className="font-bold">
                        {label}
                        {usage && <span className="font-normal text-text-muted">（{describeUsage(usage[kind])}）</span>}
                    </dt>
                    <dd className="m-0 break-all text-text-muted">{folders[kind]}</dd>
                </div>
            ))}
        </dl>
    );
}
