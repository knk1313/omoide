import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download } from "lucide-react";
import { useNavigate } from "react-router";
import { api } from "@/api/client";
import type { Job, Project } from "@/api/types";
import BottomBar, { PRIMARY_ACTION } from "@/components/BottomBar";
import Button, { buttonClass } from "@/components/Button";
import Card from "@/components/Card";
import Video from "@/components/Video";
import { useJob } from "./preview/useJob";

export default function PreviewPage() {
    const navigate = useNavigate();
    const preview = useJob("preview");
    const output = useJob("export");
    const [frame, setFrame] = useState<Project["frame"]>(null);
    const [fileName, setFileName] = useState(defaultFileName);

    // 開いたらプレビューの生成を頼む。採用と速度が前回と同じなら、サーバーは作り終えたジョブをそのまま返す
    const requested = useRef(false);
    const startPreview = preview.start;
    useEffect(() => {
        if (requested.current) return;
        requested.current = true;
        void startPreview();
        // 再生枠を動画と同じ縦横比にするため、出力の大きさを取っておく（取れなくても再生はできる）
        api.project().then((p) => setFrame(p.frame), () => undefined);
    }, [startPreview]);

    const previewReady = preview.job?.status === "done";
    const exporting = output.job !== null && (output.job.status === "queued" || output.job.status === "running");
    const exportFailed = output.error !== null || output.job?.status === "failed";

    return (
        <div className="flex flex-1 flex-col gap-5 pt-1">
            <h1 className="text-xl font-semibold text-ink">プレビューを確認</h1>

            <section aria-label="プレビュー" className="flex flex-col gap-3">
                {preview.error ? (
                    <Failure message={preview.error} onRetry={() => void preview.start()} />
                ) : previewReady && preview.job?.url ? (
                    // 再生枠を動画と同じ縦横比にし、上下や左右に黒い帯を出さない
                    <Video
                        key={preview.job.url}
                        src={preview.job.url}
                        width={frame?.width}
                        height={frame?.height}
                        controls
                        playsInline
                        className="h-auto w-full rounded-surface bg-scrim"
                        aria-label="プレビュー動画"
                    />
                ) : preview.job?.status === "failed" ? (
                    <Failure message={preview.job.error ?? "生成に失敗しました"} onRetry={() => void preview.start()} />
                ) : (
                    <Progress label="プレビューを作っています" job={preview.job} />
                )}
            </section>

            <Card className="flex flex-col gap-3 p-4">
                <h2 className="text-base font-semibold text-ink">完成版</h2>
                {exportFailed ? (
                    <p role="alert" className="text-sm text-danger">
                        {output.error ?? output.job?.error ?? "生成に失敗しました"}
                    </p>
                ) : output.job?.status === "done" ? (
                    <>
                        <p className="flex items-center gap-2 text-sm text-ink">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-status-success-ink" aria-hidden />
                            完成版ができました
                        </p>
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="file-name" className="text-sm font-medium text-ink">
                                ファイル名
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    id="file-name"
                                    value={fileName}
                                    onChange={(e) => setFileName(e.target.value)}
                                    maxLength={80}
                                    enterKeyHint="done"
                                    // iOS Safari が入力時に画面を拡大しないよう 16px にする
                                    className="h-12 min-w-0 flex-1 rounded-control border border-control-border bg-surface px-4 text-base text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                                />
                                <span className="shrink-0 text-sm text-muted">.mp4</span>
                            </div>
                        </div>
                        <p className="text-xs leading-relaxed text-muted">
                            iPhone では「ファイル」アプリの「ダウンロード」に保存されます。写真に入れるときは、ファイルを開いて共有から「ビデオを保存」を選んでください。
                        </p>
                    </>
                ) : exporting ? (
                    <Progress label="完成版を作っています" job={output.job} />
                ) : (
                    <p className="text-sm leading-relaxed text-muted">プレビューで確かめたら、元の画質で完成版を作ります。</p>
                )}
            </Card>

            <BottomBar back={{ label: "速度を変える", onClick: () => navigate("/settings") }}>
                {output.job?.status === "done" && output.job.url ? (
                    // 添付ファイルとして返るので、スマホでは保存に進む。名前はサーバーで整える（空なら既定の名前）
                    <a
                        href={`${output.job.url}?name=${encodeURIComponent(fileName.trim())}`}
                        download={`${fileName.trim() || defaultFileName()}.mp4`}
                        className={`${buttonClass()} ${PRIMARY_ACTION}`}
                    >
                        <Download className="h-5 w-5" aria-hidden />
                        保存する
                    </a>
                ) : (
                    <Button
                        className={PRIMARY_ACTION}
                        disabled={!previewReady || exporting || output.starting}
                        onClick={() => void output.start()}
                    >
                        {exporting || output.starting ? "完成版を作っています…" : exportFailed ? "もう一度作る" : "完成版を作る"}
                    </Button>
                )}
            </BottomBar>
        </div>
    );
}

/** 保存するファイル名の初期値（例: omoide-20261103）。 */
function defaultFileName(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `omoide-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}

function Progress({ label, job }: { label: string; job: Job | null }) {
    const percent = Math.round((job?.progress ?? 0) * 100);
    const waiting = job?.status === "queued";
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
                <span className="text-ink">{waiting ? "順番を待っています" : label}</span>
                <span className="tabular-nums text-muted">{percent}%</span>
            </div>
            <div
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                className="h-2 overflow-hidden rounded-full bg-surface-2"
            >
                <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-xs text-muted">作っている間も、ほかの画面に移れます。</p>
        </div>
    );
}

function Failure({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <div role="alert" className="flex flex-col gap-3">
            <p className="text-sm text-danger">{message}</p>
            <Button variant="secondary" className="h-12 w-full" onClick={onRetry}>
                もう一度試す
            </Button>
        </div>
    );
}
