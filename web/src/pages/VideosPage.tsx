import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Film, Trash2, Upload } from "lucide-react";
import { useNavigate } from "react-router";
import { api, ApiError, uploadVideo } from "@/api/client";
import type { Job, Project, Video } from "@/api/types";
import { LoadFailure, Loading, WaitingProgress } from "@/components/app/PageStatus";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { NotificationBanner } from "@/components/ui/NotificationBanner";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import BottomBar, { PRIMARY_ACTION } from "@/layouts/BottomBar";
import { formatDay } from "@/lib/format";
import { localToday, videoDateProblem } from "@/lib/videoDate";
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
    const { confirm } = useConfirm();
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

    // 撮影日を保存し、一覧を新しくする。保存できなければ、入力欄の下に出す理由を返す（ログイン切れなどは画面ごと切り替えるので null）
    async function saveDate(video: Video, date: string): Promise<SaveResult> {
        try {
            const saved = await api.setVideoDate(video.name, date || null);
            setProject(await api.project());
            toast({ title: `${saved.date ? formatDay(saved.date) : "撮影日"}にしました`, type: "success" });
            return { ok: true };
        } catch (error) {
            if (handleError(error)) return { ok: false, message: null };
            return { ok: false, message: error instanceof ApiError ? error.message : "保存できませんでした。もう一度お試しください" };
        }
    }

    // 取り込んだ動画を消す。元に戻せないので、何が消えるかを示して確かめてから消す
    async function deleteVideo(video: Video) {
        const ok = await confirm({
            title: `「${video.name}」を消しますか`,
            message: "Macから、動画のファイルと、そこから切り出したクリップ・サムネイル、選んだ内容と撮影日を消します。元に戻せません。",
            confirmLabel: "消す",
            tone: "error",
        });
        if (!ok) return;
        try {
            setProject(await api.deleteVideo(video.name));
            toast({ title: `「${video.name}」を消しました`, type: "success" });
        } catch (error) {
            if (!handleError(error)) toast({ title: error instanceof ApiError ? error.message : "消せませんでした。もう一度お試しください", type: "error" });
        }
    }

    const header = <PageHeader title="動画を取り込む" description="Setlogから書き出した動画を選び、撮影した日を入力してください。" />;

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
                    videos={project.videos}
                    onSaveDate={async (video, date) => {
                        const result = await saveDate(video, date);
                        if (result.ok) setUpload(null);
                        return result;
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
                        <EmptyState icon={Film} as="h3" title="まだありません" description="上のボタンから、Setlogの動画を選んでください。" className="py-8" />
                    </Card>
                ) : (
                    <ul className="m-0 flex list-none flex-col gap-2 p-0">
                        {project.videos.map((video) => (
                            <VideoRow
                                key={video.name}
                                video={video}
                                videos={project.videos}
                                disabled={busy}
                                onSave={(date) => saveDate(video, date)}
                                onDelete={() => void deleteVideo(video)}
                            />
                        ))}
                    </ul>
                )}
            </section>

            <BottomBar
                summary={
                    project.total_count > 0 ? (
                        <>
                            動画<span className="nums font-bold text-text-strong">{project.videos.length}</span>本・パネル
                            <span className="nums font-bold text-text-strong">{project.total_count}</span>件
                        </>
                    ) : (
                        "動画を1本以上取り込んでください"
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
    videos,
    onSaveDate,
    onRetry,
    onDismiss,
}: {
    upload: Upload;
    videos: readonly Video[];
    onSaveDate: (video: Video, date: string) => Promise<SaveResult>;
    onRetry: () => void;
    onDismiss: () => void;
}) {
    if (upload.stage === "date") {
        return <DateCard video={upload.video} videos={videos} onSave={onSaveDate} />;
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
    // プレビューの画面と同じく、待っている間はカードに入れずに出す。ファイル名は文言に含め、割合と 1 行にまとめる
    const sending = upload.stage === "sending";
    return (
        <WaitingProgress
            label={`${upload.fileName}を${sending ? "アップロードしています" : "読み取っています"}`}
            value={sending ? upload.sent : null}
            description={sending ? "画面を閉じずにお待ちください。" : "クリップの区切りと、中身のある人を調べています。"}
        />
    );
}

// 取り込んだ直後に、撮影日を確かめてもらう。初期値は動画のメタデータの日付
function DateCard({ video, videos, onSave }: { video: Video; videos: readonly Video[]; onSave: (video: Video, date: string) => Promise<SaveResult> }) {
    const [date, setDate] = useState(video.date ?? video.metadata_date ?? "");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const today = localToday();

    async function save() {
        // 送る前に、その場で分かる誤り（空・明日以降・ほかの動画と同じ日付）を知らせる
        const problem = videoDateProblem(date, video.name, videos, today);
        setError(problem);
        if (problem) return;
        setSaving(true);
        const result = await onSave(video, date);
        setSaving(false);
        if (!result.ok) setError(result.message);
    }

    return (
        <Card padding="sm">
            <CardBody className="flex flex-col gap-4">
                <p className="m-0">
                    <span className="font-bold text-text-strong">{video.name}</span>を取り込みました（パネル<span className="nums">{video.panel_count}</span>件）
                </p>
                <FormField
                    label="この動画を撮影した日"
                    requirement="required"
                    supportText={video.metadata_date ? `動画の情報から${formatDay(video.metadata_date)}を入れています。違っていたら直してください。` : undefined}
                    errorText={error ?? undefined}
                >
                    <Input
                        type="date"
                        value={date}
                        max={today}
                        onChange={(e) => {
                            setDate(e.target.value);
                            setError(null);
                        }}
                    />
                </FormField>
                <Button size="lg" block loading={saving} onClick={() => void save()}>
                    この日付にする
                </Button>
            </CardBody>
        </Card>
    );
}

// 取り込んだ動画 1 本。名前の下の行に撮影日の入力欄を置き、どの動画でも同じ並びにする。
// 選んだらすぐ保存する。保存できない日付は送らず、入力欄の下に理由を出す
function VideoRow({
    video,
    videos,
    disabled,
    onSave,
    onDelete,
}: {
    video: Video;
    videos: readonly Video[];
    disabled: boolean;
    onSave: (date: string) => Promise<SaveResult>;
    onDelete: () => void;
}) {
    const inputId = `video-date-${video.name}`;
    const errorId = `${inputId}-error`;
    // 入力していなければ、メタデータの日付を初期値として見せる
    const [value, setValue] = useState(video.date ?? video.metadata_date ?? "");
    const [error, setError] = useState<string | null>(null);
    const today = localToday();

    async function change(next: string) {
        setValue(next);
        const problem = videoDateProblem(next, video.name, videos, today);
        setError(problem);
        if (problem) return;
        const result = await onSave(next);
        if (!result.ok) setError(result.message);
    }

    return (
        <Card as="li" padding="sm">
            <CardBody className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col">
                        <span className="truncate font-bold text-text-strong">{video.name}</span>
                        <span className="text-text-muted">
                            パネル<span className="nums">{video.panel_count}</span>件
                            {video.date ? "" : <span className="font-bold text-warning">・撮影日が未入力</span>}
                        </span>
                    </div>
                    {/* 送っている・読み取っている間は消さない（取り込みの結果と食い違うため） */}
                    {/* 名前（太字の 1 行目）と同じ高さの枠の中で上下中央に置く（テンプレートの D-21） */}
                    <span className="flex h-lh shrink-0 items-center font-bold">
                        <IconButton icon={Trash2} label={`${video.name}を消す`} tone="error" className="-mr-2" disabled={disabled} onClick={onDelete} />
                    </span>
                </div>
                <label htmlFor={inputId} className="sr-only">
                    {video.name}の撮影日
                </label>
                <Input
                    id={inputId}
                    type="date"
                    size="sm"
                    value={value}
                    max={today}
                    disabled={disabled}
                    invalid={error !== null}
                    aria-describedby={error ? errorId : undefined}
                    onChange={(e) => void change(e.target.value)}
                />
                {/* DADS のエラーテキスト（＊で始め、role="alert" は付けない） */}
                {error && (
                    <p id={errorId} className="m-0 leading-130 tracking-0 text-error">
                        ＊{error}
                    </p>
                )}
            </CardBody>
        </Card>
    );
}

type SaveResult = { ok: true } | { ok: false; message: string | null };
