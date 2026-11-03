import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download } from "lucide-react";
import { useNavigate } from "react-router";
import { api } from "@/api/client";
import type { Job, Project } from "@/api/types";
import VideoPlayer from "@/components/app/VideoPlayer";
import { Button, ButtonAnchor } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { NotificationBanner } from "@/components/ui/NotificationBanner";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressBar } from "@/components/ui/ProgressBar";
import BottomBar, { PRIMARY_ACTION } from "@/layouts/BottomBar";
import { fileNamePlaceholder, fileNameProblem, MAX_FILE_NAME_LENGTH, stripExtension } from "@/lib/fileName";
import { useJob } from "./preview/useJob";

export default function PreviewPage() {
    const navigate = useNavigate();
    const preview = useJob("preview");
    const output = useJob("export");
    const [frame, setFrame] = useState<Project["frame"]>(null);
    // 名前は空から入力してもらう（例は入力欄に薄く出す）。保存を押したときに検査し、誤りは入力欄の下に出す
    const [fileName, setFileName] = useState("");
    const [fileNameError, setFileNameError] = useState<string | null>(null);
    const fileNameInput = useRef<HTMLInputElement>(null);

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
        <div className="flex flex-1 flex-col gap-6">
            <PageHeader title="プレビューを確認" />

            <section aria-label="プレビュー" className="flex flex-col gap-3">
                {preview.error ? (
                    <Failure message={preview.error} onRetry={() => void preview.start()} />
                ) : previewReady && preview.job?.url ? (
                    // 再生枠を動画と同じ縦横比にし、上下や左右に黒い帯を出さない
                    <VideoPlayer
                        key={preview.job.url}
                        src={preview.job.url}
                        width={frame?.width}
                        height={frame?.height}
                        controls
                        playsInline
                        className="h-auto w-full rounded-8 bg-black"
                        aria-label="プレビュー動画"
                    />
                ) : preview.job?.status === "failed" ? (
                    <Failure message={preview.job.error ?? "生成に失敗しました"} onRetry={() => void preview.start()} />
                ) : (
                    <Progress label="プレビューを作っています" job={preview.job} />
                )}
            </section>

            <Card as="section" padding="sm">
                <CardHeader title="完成版" />
                <CardBody className="flex flex-col gap-4">
                    {exportFailed ? (
                        <NotificationBanner type="error" live="assertive" as="h3" title={output.error ?? output.job?.error ?? "生成に失敗しました"} />
                    ) : output.job?.status === "done" ? (
                        <>
                            <p className="m-0 flex items-start gap-2 font-bold text-text-strong">
                                {/* 1 行目の高さの箱の中央に置く（テンプレートの D-21） */}
                                <span className="flex h-lh shrink-0 items-center">
                                    <Icon icon={CheckCircle2} size="md" className="text-success" />
                                </span>
                                完成版ができました
                            </p>
                            <FormField
                                label="ファイル名"
                                id="file-name"
                                requirement="required"
                                supportText={`拡張子（.mp4）は自動で付きます。${FORBIDDEN_HINT} は使えません。`}
                                errorText={fileNameError ?? undefined}
                            >
                                <Input
                                    ref={fileNameInput}
                                    value={fileName}
                                    placeholder={fileNamePlaceholder()}
                                    onChange={(e) => {
                                        setFileName(e.target.value);
                                        // 誤りを出しているときは、直すそばから検査し直す
                                        if (fileNameError) setFileNameError(fileNameProblem(e.target.value));
                                    }}
                                    maxLength={MAX_FILE_NAME_LENGTH}
                                    enterKeyHint="done"
                                />
                            </FormField>
                            <p className="m-0 text-text-muted">
                                iPhone では「ファイル」アプリの「ダウンロード」に保存されます。写真に入れるときは、ファイルを開いて共有から「ビデオを保存」を選んでください。
                            </p>
                        </>
                    ) : exporting ? (
                        <Progress label="完成版を作っています" job={output.job} />
                    ) : (
                        <p className="m-0 text-text-muted">プレビューで確かめたら、元の画質で完成版を作ります。</p>
                    )}
                </CardBody>
            </Card>

            <BottomBar back={{ label: "速度を変える", onClick: () => navigate("/settings") }}>
                {output.job?.status === "done" && output.job.url ? (
                    // 添付ファイルとして返るので、スマホでは保存に進む。使えない名前なら保存に進まず、入力欄の下に理由を出す
                    <ButtonAnchor
                        {...PRIMARY_ACTION}
                        leadIcon={Download}
                        href={`${output.job.url}?name=${encodeURIComponent(stripExtension(fileName))}`}
                        download={`${stripExtension(fileName)}.mp4`}
                        onClick={(e) => {
                            const problem = fileNameProblem(fileName);
                            setFileNameError(problem);
                            if (problem) {
                                e.preventDefault();
                                fileNameInput.current?.focus();
                            }
                        }}
                    >
                        保存する
                    </ButtonAnchor>
                ) : (
                    <Button {...PRIMARY_ACTION} loading={exporting || output.starting} disabled={!previewReady} onClick={() => void output.start()}>
                        {exporting || output.starting ? "完成版を作っています…" : exportFailed ? "もう一度作る" : "完成版を作る"}
                    </Button>
                )}
            </BottomBar>
        </div>
    );
}

/** 補足に書く、ファイル名に使えない文字。 */
const FORBIDDEN_HINT = '/ \\ : * ? " < > |';

function Progress({ label, job }: { label: string; job: Job | null }) {
    return (
        <ProgressBar
            label={job?.status === "queued" ? "順番を待っています" : label}
            accessibleLabel={label}
            value={job?.progress ?? 0}
            description="作っている間も、ほかの画面に移れます。"
        />
    );
}

function Failure({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <NotificationBanner
            type="error"
            live="assertive"
            title={message}
            actions={
                <Button variant="outline" block onClick={onRetry}>
                    もう一度試す
                </Button>
            }
        />
    );
}
