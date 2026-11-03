import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { CalendarDays, Film, Upload } from "lucide-react";
import { useNavigate } from "react-router";
import { api, ApiError, uploadVideo } from "@/api/client";
import type { Job, Project, Video } from "@/api/types";
import BottomBar, { PRIMARY_ACTION } from "@/components/BottomBar";
import Button from "@/components/Button";
import Card from "@/components/Card";
import { useToast } from "@/components/Toast";
import { formatDay } from "@/lib/format";
import { useSession } from "@/session/Session";
import { isTransient, polling } from "./preview/useJob";

/** 取り込みの段階。1 本ずつ、送る → 解析する → 撮影日を確かめる の順に進む。 */
type Upload =
    | { stage: "sending"; fileName: string; sent: number }
    | { stage: "analyzing"; fileName: string; job: Job; failures: number }
    | { stage: "date"; video: Video }
    | { stage: "failed"; fileName: string; message: string };

export default function VideosPage() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { handleError } = useSession();
    const [project, setProject] = useState<Project | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [upload, setUpload] = useState<Upload | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let active = true;
        api.project()
            .then((p) => active && setProject(p))
            .catch((error: unknown) => {
                if (active && !handleError(error)) setLoadError(error instanceof ApiError ? error.message : "読み込めませんでした");
            });
        return () => {
            active = false;
        };
    }, [attempt, handleError]);

    // 解析が終わるまで、進み具合を取りに行く
    const analyzing = upload?.stage === "analyzing" ? upload : null;
    useEffect(() => {
        if (!analyzing) return;
        const timer = setTimeout(() => {
            api.job(analyzing.job.id).then(
                (job) => {
                    if (job.status === "done" && job.result) {
                        setUpload({ stage: "date", video: job.result });
                    } else if (job.status === "failed") {
                        setUpload({ stage: "failed", fileName: analyzing.fileName, message: job.error ?? "動画を読み取れませんでした" });
                    } else {
                        setUpload({ ...analyzing, job, failures: 0 });
                    }
                },
                (error: unknown) => {
                    // Wi-Fi が一瞬途切れただけなら、もう一度取りに行く
                    if (isTransient(error, analyzing.failures + 1)) {
                        setUpload({ ...analyzing, failures: analyzing.failures + 1 });
                    } else if (!handleError(error)) {
                        setUpload({ stage: "failed", fileName: analyzing.fileName, message: "解析の進み具合を取得できませんでした" });
                    }
                },
            );
        }, polling.intervalMs);
        return () => clearTimeout(timer);
    }, [analyzing, handleError]);

    // 送っている間に画面を閉じたり再読み込みしたりすると中断するので、ブラウザの確認を出す
    const sending = upload?.stage === "sending";
    useEffect(() => {
        if (!sending) return;
        const warn = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [sending]);

    async function chooseFile(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        // 同じファイルを選び直しても change が起きるよう、選択を空に戻す
        e.target.value = "";
        if (!file) return;
        setUpload({ stage: "sending", fileName: file.name, sent: 0 });
        try {
            const job = await uploadVideo(file, (sent) => setUpload({ stage: "sending", fileName: file.name, sent }));
            setUpload({ stage: "analyzing", fileName: file.name, job, failures: 0 });
        } catch (error) {
            if (handleError(error)) return;
            setUpload({ stage: "failed", fileName: file.name, message: error instanceof ApiError ? error.message : "送れませんでした" });
        }
    }

    // 撮影日を保存し、一覧を新しくする
    async function saveDate(video: Video, date: string): Promise<boolean> {
        try {
            const saved = await api.setVideoDate(video.name, date || null);
            setProject(await api.project());
            toast(`${saved.date ? formatDay(saved.date) : "撮影日"}にしました`);
            return true;
        } catch (error) {
            if (!handleError(error)) toast(error instanceof ApiError ? error.message : "保存できませんでした", "error");
            return false;
        }
    }

    if (loadError) {
        return (
            <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 pb-[14vh] text-center">
                <p className="text-sm text-muted">{loadError}</p>
                <Button
                    variant="secondary"
                    className="h-12 px-8"
                    onClick={() => {
                        setLoadError(null);
                        setAttempt((n) => n + 1);
                    }}
                >
                    もう一度読み込む
                </Button>
            </div>
        );
    }
    if (!project) {
        return <p className="pt-8 text-center text-sm text-muted">読み込んでいます…</p>;
    }

    const busy = upload?.stage === "sending" || upload?.stage === "analyzing";

    return (
        <div className="flex flex-1 flex-col gap-5 pt-1">
            <div className="flex flex-col gap-2">
                <h1 className="text-xl font-semibold text-ink">動画を取り込む</h1>
                <p className="text-sm leading-relaxed text-muted">Setlog から書き出した動画を選び、撮影した日を入力してください。</p>
            </div>

            <input
                ref={fileInput}
                type="file"
                accept="video/mp4,video/quicktime,.mp4,.mov"
                className="hidden"
                onChange={(e) => void chooseFile(e)}
                aria-label="動画ファイル"
            />

            {upload ? (
                <UploadStatus
                    upload={upload}
                    onSaveDate={async (video, date) => {
                        if (await saveDate(video, date)) setUpload(null);
                    }}
                    onRetry={() => fileInput.current?.click()}
                    onDismiss={() => setUpload(null)}
                />
            ) : (
                <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="flex h-28 flex-col items-center justify-center gap-2 rounded-surface border-2 border-dashed border-control-border bg-surface text-ink transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                    <Upload className="h-6 w-6 text-brand" aria-hidden />
                    <span className="text-sm font-medium">動画を選んでアップロード</span>
                </button>
            )}

            <section aria-label="取り込んだ動画" className="flex flex-col gap-3">
                <h2 className="text-base font-semibold text-ink">取り込んだ動画</h2>
                {project.videos.length === 0 ? (
                    <p className="flex items-center gap-2 text-sm text-muted">
                        <Film className="h-4 w-4 shrink-0" aria-hidden />
                        まだありません
                    </p>
                ) : (
                    <ul className="flex flex-col gap-2">
                        {project.videos.map((video) => (
                            <VideoRow key={video.name} video={video} disabled={busy} onSave={(date) => void saveDate(video, date)} />
                        ))}
                    </ul>
                )}
            </section>

            <BottomBar
                summary={
                    project.total_count > 0 ? (
                        <>
                            動画 <span className="font-semibold tabular-nums text-ink">{project.videos.length}</span> 本・パネル{" "}
                            <span className="font-semibold tabular-nums text-ink">{project.total_count}</span> 件
                        </>
                    ) : (
                        "動画を 1 本以上取り込んでください"
                    )
                }
            >
                <Button className={PRIMARY_ACTION} disabled={project.total_count === 0 || busy} onClick={() => navigate("/")}>
                    次へ
                </Button>
            </BottomBar>
        </div>
    );
}

function UploadStatus({
    upload,
    onSaveDate,
    onRetry,
    onDismiss,
}: {
    upload: Upload;
    onSaveDate: (video: Video, date: string) => Promise<void>;
    onRetry: () => void;
    onDismiss: () => void;
}) {
    if (upload.stage === "date") {
        return <DateCard video={upload.video} onSave={onSaveDate} />;
    }
    if (upload.stage === "failed") {
        return (
            <Card role="alert" className="flex flex-col gap-3 p-4">
                <p className="text-sm font-medium text-ink">{upload.fileName}</p>
                <p className="text-sm text-danger">{upload.message}</p>
                <div className="grid grid-cols-2 gap-2">
                    <Button variant="secondary" className="h-11" onClick={onDismiss}>
                        閉じる
                    </Button>
                    <Button className="h-11" onClick={onRetry}>
                        別の動画を選ぶ
                    </Button>
                </div>
            </Card>
        );
    }
    const sending = upload.stage === "sending";
    const percent = Math.round((sending ? upload.sent : 1) * 100);
    const label = sending ? "アップロードしています" : "動画を読み取っています";
    return (
        <Card className="flex flex-col gap-2 p-4">
            <p className="truncate text-sm font-medium text-ink">{upload.fileName}</p>
            <div className="flex items-center justify-between text-sm">
                <span className="text-ink">{label}</span>
                {sending && <span className="tabular-nums text-muted">{percent}%</span>}
            </div>
            <div
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={sending ? percent : undefined}
                className="h-2 overflow-hidden rounded-full bg-surface-2"
            >
                <div
                    className={`h-full rounded-full bg-brand transition-[width] duration-300 ${sending ? "" : "animate-pulse"}`}
                    style={{ width: `${percent}%` }}
                />
            </div>
            <p className="text-xs text-muted">{sending ? "画面を閉じずにお待ちください。" : "クリップの区切りと、中身のある人を調べています。"}</p>
        </Card>
    );
}

// 取り込んだ直後に、撮影日を確かめてもらう。初期値は動画のメタデータの日付
function DateCard({ video, onSave }: { video: Video; onSave: (video: Video, date: string) => Promise<void> }) {
    const [date, setDate] = useState(video.date ?? video.metadata_date ?? "");
    const [saving, setSaving] = useState(false);
    return (
        <Card className="flex flex-col gap-3 p-4">
            <p className="text-sm text-ink">
                <span className="font-medium">{video.name}</span> を取り込みました（パネル {video.panel_count} 件）
            </p>
            <label htmlFor="new-video-date" className="text-sm font-medium text-ink">
                この動画を撮影した日
            </label>
            <input
                id="new-video-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-12 w-full rounded-control border border-control-border bg-surface px-4 text-base text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
            />
            {video.metadata_date && <p className="text-xs text-muted">動画の情報から {formatDay(video.metadata_date)} を入れています。違っていたら直してください。</p>}
            <Button
                className="h-12 w-full text-base"
                disabled={!date || saving}
                onClick={async () => {
                    setSaving(true);
                    await onSave(video, date);
                    setSaving(false);
                }}
            >
                この日付にする
            </Button>
        </Card>
    );
}

function VideoRow({ video, disabled, onSave }: { video: Video; disabled: boolean; onSave: (date: string) => void }) {
    const inputId = `video-date-${video.name}`;
    return (
        <li>
            <Card className="flex items-center gap-3 p-3">
                <CalendarDays className="h-5 w-5 shrink-0 text-muted" aria-hidden />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium text-ink">{video.name}</span>
                    <span className="text-xs text-muted">
                        パネル {video.panel_count} 件{video.date ? "" : "・撮影日が未入力"}
                    </span>
                </div>
                <label htmlFor={inputId} className="sr-only">
                    {video.name}の撮影日
                </label>
                <input
                    id={inputId}
                    type="date"
                    // 入力していなければ、メタデータの日付を初期値として見せる
                    defaultValue={video.date ?? video.metadata_date ?? ""}
                    disabled={disabled}
                    onChange={(e) => {
                        if (e.target.value) onSave(e.target.value);
                    }}
                    className={`h-11 rounded-control border bg-surface px-3 text-base text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 ${
                        video.date ? "border-control-border" : "border-status-warning-ink"
                    }`}
                />
            </Card>
        </li>
    );
}
