import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api, ApiError } from "@/api/client";
import type { Project, Speed } from "@/api/types";
import BottomBar, { PRIMARY_ACTION } from "@/components/BottomBar";
import Button from "@/components/Button";
import Card from "@/components/Card";
import { useToast } from "@/components/Toast";
import { formatSeconds } from "@/lib/format";
import { useSession } from "@/session/Session";

const SPEEDS: Speed[] = [0.5, 1, 1.5, 2];

export default function SettingsPage() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { handleError } = useSession();
    const [project, setProject] = useState<Project | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [starting, setStarting] = useState(false);
    const [startError, setStartError] = useState<string | null>(null);

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

    // 画面はすぐ切り替え、保存に失敗したら元に戻して知らせる
    async function chooseSpeed(speed: Speed) {
        if (!project || speed === project.speed) return;
        const before = project;
        setProject({ ...project, speed, estimated_seconds: (project.estimated_seconds * project.speed) / speed });
        setStartError(null);
        try {
            setProject(await api.setSpeed(speed));
        } catch (error) {
            setProject(before);
            if (!handleError(error)) toast(error instanceof ApiError ? error.message : "保存できませんでした", "error");
        }
    }

    async function startPreview() {
        setStarting(true);
        setStartError(null);
        try {
            const job = await api.startJob("preview");
            navigate("/preview", { state: { jobId: job.id } });
        } catch (error) {
            // 採用 0 件・空き容量不足などは、サーバーの文言（次に取る操作）をそのまま見せる
            if (!handleError(error)) setStartError(error instanceof ApiError ? error.message : "プレビューを作れませんでした");
        } finally {
            setStarting(false);
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

    // 等速での長さ。選択肢ごとの長さはここから計算する
    const baseSeconds = project.estimated_seconds * project.speed;
    const nothingSelected = project.selected_count === 0;

    return (
        <div className="flex flex-1 flex-col gap-5 pt-1">
            <h1 className="text-xl font-semibold text-ink">速度を選ぶ</h1>

            <Card className="flex divide-x divide-hairline">
                <div className="flex flex-1 flex-col items-center gap-2 py-3.5">
                    <span className="text-xs leading-none [text-box:trim-both_cap_alphabetic] text-muted">採用したクリップ</span>
                    <span className="text-lg leading-none [text-box:trim-both_cap_alphabetic] font-semibold tabular-nums text-ink">{project.selected_count} 件</span>
                </div>
                <div className="flex flex-1 flex-col items-center gap-2 py-3.5">
                    <span className="text-xs leading-none [text-box:trim-both_cap_alphabetic] text-muted">できあがりの長さ</span>
                    <span className="text-lg leading-none [text-box:trim-both_cap_alphabetic] font-semibold tabular-nums text-ink">約 {formatSeconds(project.estimated_seconds)}</span>
                </div>
            </Card>

            <fieldset className="flex flex-col gap-2">
                <legend className="pb-2 text-sm font-medium text-ink">全体の再生速度</legend>
                <div role="radiogroup" aria-label="全体の再生速度" className="grid grid-cols-4 gap-2">
                    {SPEEDS.map((speed) => {
                        const checked = speed === project.speed;
                        return (
                            <button
                                key={speed}
                                type="button"
                                role="radio"
                                aria-checked={checked}
                                onClick={() => void chooseSpeed(speed)}
                                className={`flex h-16 flex-col items-center justify-center gap-1.5 rounded-control border text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                                    checked ? "border-brand bg-nav-active text-nav-ink" : "border-control-border bg-surface hover:bg-surface-2"
                                }`}
                            >
                                <span className="text-base leading-none [text-box:trim-both_cap_alphabetic] font-semibold tabular-nums">{speed}x</span>
                                <span className={`text-xs leading-none [text-box:trim-both_cap_alphabetic] tabular-nums ${checked ? "text-nav-ink" : "text-muted"}`}>
                                    {formatSeconds(baseSeconds / speed)}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </fieldset>

            {(startError || nothingSelected) && (
                <p role="alert" className="text-sm text-danger">
                    {startError ?? "クリップが 1 件も選ばれていません。クリップ選択に戻って選んでください。"}
                </p>
            )}

            <BottomBar back={{ label: "クリップ選択", onClick: () => navigate("/") }}>
                <Button className={PRIMARY_ACTION} disabled={starting || nothingSelected} onClick={() => void startPreview()}>
                    {starting ? "生成を始めています…" : "プレビューを生成"}
                </Button>
            </BottomBar>
        </div>
    );
}
