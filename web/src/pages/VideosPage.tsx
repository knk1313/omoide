import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Film, Upload } from "lucide-react";
import { useNavigate } from "react-router";
import { api, ApiError, uploadVideo } from "@/api/client";
import type { Job, Project, Video } from "@/api/types";
import { LoadFailure, Loading } from "@/components/app/PageStatus";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { NotificationBanner } from "@/components/ui/NotificationBanner";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useToast } from "@/components/ui/Toast";
import BottomBar, { PRIMARY_ACTION } from "@/layouts/BottomBar";
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
            toast({ title: `${saved.date ? formatDay(saved.date) : "撮影日"}にしました`, type: "success" });
            return true;
        } catch (error) {
            if (!handleError(error)) toast({ title: error instanceof ApiError ? error.message : "保存できませんでした", type: "error" });
            return false;
        }
    }

    const header = <PageHeader title="動画を取り込む" description="Setlog から書き出した動画を選び、撮影した日を入力してください。" />;

    if (loadError || !project) {
        return (
            <div className="flex flex-1 flex-col gap-6">
                {header}
                {loadError ? (
                    <LoadFailure
                        message={loadError}
                        onRetry={() => {
                            setLoadError(null);
                            setAttempt((n) => n + 1);
                        }}
                    />
                ) : (
                    <Loading />
                )}
            </div>
        );
    }

    const busy = upload?.stage === "sending" || upload?.stage === "analyzing";

    return (
        <div className="flex flex-1 flex-col gap-6">
            {header}

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
                <Button variant="outline" size="lg" block leadIcon={Upload} onClick={() => fileInput.current?.click()}>
                    動画を選んでアップロード
                </Button>
            )}

            <section aria-labelledby="videos-title" className="flex flex-col gap-3">
                <h2 id="videos-title" className="m-0 text-std-20B-150 text-text-strong">
                    取り込んだ動画
                </h2>
                {project.videos.length === 0 ? (
                    <Card>
                        <EmptyState icon={Film} as="h3" title="まだありません" description="上のボタンから、Setlog の動画を選んでください。" className="py-8" />
                    </Card>
                ) : (
                    <ul className="m-0 flex list-none flex-col gap-2 p-0">
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
                            動画 <span className="nums font-bold text-text-strong">{project.videos.length}</span> 本・パネル{" "}
                            <span className="nums font-bold text-text-strong">{project.total_count}</span> 件
                        </>
                    ) : (
                        "動画を 1 本以上取り込んでください"
                    )
                }
            >
                <Button {...PRIMARY_ACTION} disabled={project.total_count === 0 || busy} onClick={() => navigate("/")}>
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
            <NotificationBanner
                type="error"
                live="assertive"
                title={upload.message}
                description={upload.fileName}
                onClose={onDismiss}
                actions={
                    <Button block onClick={onRetry}>
                        別の動画を選ぶ
                    </Button>
                }
            />
        );
    }
    const sending = upload.stage === "sending";
    return (
        <Card padding="sm">
            <CardBody className="flex flex-col gap-2">
                <p className="m-0 truncate font-bold text-text-strong">{upload.fileName}</p>
                <ProgressBar
                    label={sending ? "アップロードしています" : "動画を読み取っています"}
                    value={sending ? upload.sent : null}
                    description={sending ? "画面を閉じずにお待ちください。" : "クリップの区切りと、中身のある人を調べています。"}
                />
            </CardBody>
        </Card>
    );
}

// 取り込んだ直後に、撮影日を確かめてもらう。初期値は動画のメタデータの日付
function DateCard({ video, onSave }: { video: Video; onSave: (video: Video, date: string) => Promise<void> }) {
    const [date, setDate] = useState(video.date ?? video.metadata_date ?? "");
    const [saving, setSaving] = useState(false);
    return (
        <Card padding="sm">
            <CardBody className="flex flex-col gap-4">
                <p className="m-0">
                    <span className="font-bold text-text-strong">{video.name}</span> を取り込みました（パネル <span className="nums">{video.panel_count}</span> 件）
                </p>
                <FormField
                    label="この動画を撮影した日"
                    supportText={video.metadata_date ? `動画の情報から ${formatDay(video.metadata_date)} を入れています。違っていたら直してください。` : undefined}
                >
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </FormField>
                <Button
                    size="lg"
                    block
                    loading={saving}
                    disabled={!date}
                    onClick={async () => {
                        setSaving(true);
                        await onSave(video, date);
                        setSaving(false);
                    }}
                >
                    この日付にする
                </Button>
            </CardBody>
        </Card>
    );
}

function VideoRow({ video, disabled, onSave }: { video: Video; disabled: boolean; onSave: (date: string) => void }) {
    const inputId = `video-date-${video.name}`;
    return (
        <Card as="li" padding="sm">
            <CardBody className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <div className="flex min-w-0 flex-col">
                    <span className="truncate font-bold text-text-strong">{video.name}</span>
                    <span className="text-text-muted">
                        パネル <span className="nums">{video.panel_count}</span> 件
                        {video.date ? "" : <span className="font-bold text-warning">・撮影日が未入力</span>}
                    </span>
                </div>
                <label htmlFor={inputId} className="sr-only">
                    {video.name}の撮影日
                </label>
                <Input
                    id={inputId}
                    type="date"
                    size="sm"
                    block={false}
                    // 入力していなければ、メタデータの日付を初期値として見せる
                    defaultValue={video.date ?? video.metadata_date ?? ""}
                    disabled={disabled}
                    onChange={(e) => {
                        if (e.target.value) onSave(e.target.value);
                    }}
                />
            </CardBody>
        </Card>
    );
}
