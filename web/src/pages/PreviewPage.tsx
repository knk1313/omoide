import { useEffect, useRef } from "react";
import { CheckCircle2, Download } from "lucide-react";
import { useNavigate } from "react-router";
import type { Job } from "@/api/types";
import Button from "@/components/Button";
import Card from "@/components/Card";
import { useJob } from "./preview/useJob";

export default function PreviewPage() {
    const navigate = useNavigate();
    const preview = useJob("preview");
    const output = useJob("export");

    // 開いたらプレビューの生成を頼む。採用と速度が前回と同じなら、サーバーは作り終えたジョブをそのまま返す
    const requested = useRef(false);
    const startPreview = preview.start;
    useEffect(() => {
        if (requested.current) return;
        requested.current = true;
        void startPreview();
    }, [startPreview]);

    return (
        <div className="flex flex-1 flex-col gap-5 pt-1">
            <h1 className="text-xl font-semibold text-ink">プレビューを確認</h1>

            <section aria-label="プレビュー" className="flex flex-col gap-3">
                {preview.error ? (
                    <Failure message={preview.error} onRetry={() => void preview.start()} />
                ) : preview.job?.status === "done" && preview.job.url ? (
                    <video
                        key={preview.job.url}
                        src={preview.job.url}
                        controls
                        playsInline
                        className="aspect-video w-full rounded-surface bg-scrim"
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
                {output.error ? (
                    <Failure message={output.error} onRetry={() => void output.start()} />
                ) : output.job?.status === "done" && output.job.url ? (
                    <>
                        <p className="flex items-center gap-2 text-sm text-ink">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-status-success-ink" aria-hidden />
                            完成版ができました
                        </p>
                        {/* 添付ファイルとして返るので、スマホでは保存に進む */}
                        <a
                            href={output.job.url}
                            download
                            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-control bg-brand text-base font-medium text-on-brand shadow-control hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                        >
                            <Download className="h-5 w-5" aria-hidden />
                            保存する
                        </a>
                        <p className="text-xs leading-relaxed text-muted">
                            iPhone では「ファイル」アプリの「ダウンロード」に保存されます。写真に入れるときは、ファイルを開いて共有から「ビデオを保存」を選んでください。
                        </p>
                    </>
                ) : output.job?.status === "failed" ? (
                    <Failure message={output.job.error ?? "生成に失敗しました"} onRetry={() => void output.start()} />
                ) : output.job ? (
                    <Progress label="完成版を作っています" job={output.job} />
                ) : (
                    <>
                        <p className="text-sm leading-relaxed text-muted">プレビューで確かめたら、元の画質で完成版を作ります。</p>
                        <Button
                            className="h-12 w-full text-base"
                            disabled={output.starting || preview.job?.status !== "done"}
                            onClick={() => void output.start()}
                        >
                            {output.starting ? "生成を始めています…" : "完成版を作る"}
                        </Button>
                    </>
                )}
            </Card>

            <div className="mt-auto grid grid-cols-2 gap-2 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
                <Button variant="secondary" className="h-12" onClick={() => navigate("/")}>
                    選択に戻る
                </Button>
                <Button variant="secondary" className="h-12" onClick={() => navigate("/settings")}>
                    速度を変える
                </Button>
            </div>
        </div>
    );
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
