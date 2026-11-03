import { useCallback, useEffect, useMemo, useState } from "react";
import { Film } from "lucide-react";
import { useNavigate } from "react-router";
import { api, ApiError } from "@/api/client";
import type { PanelClip, Project } from "@/api/types";
import BottomBar, { PRIMARY_ACTION } from "@/components/BottomBar";
import Button from "@/components/Button";
import EmptyState from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { formatDate, formatSeconds } from "@/lib/format";
import { useSession } from "@/session/Session";
import ClipPlayer from "./clips/ClipPlayer";
import ClipTile from "./clips/ClipTile";

type Loaded = { project: Project; clips: PanelClip[] };

export default function ClipsPage() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { handleError } = useSession();
    const [data, setData] = useState<Loaded | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [playing, setPlaying] = useState<PanelClip | null>(null);
    const [bulkBusy, setBulkBusy] = useState(false);

    // 「もう一度読み込む」で増やし、読み込みをやり直す
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let active = true;
        Promise.all([api.project(), api.clips()])
            .then(([project, clips]) => active && setData({ project, clips }))
            .catch((error: unknown) => {
                if (active && !handleError(error)) setLoadError(error instanceof ApiError ? error.message : "読み込めませんでした");
            });
        return () => {
            active = false;
        };
    }, [attempt, handleError]);

    function retry() {
        setLoadError(null);
        setAttempt((n) => n + 1);
    }

    const setSelected = useCallback((ids: Set<string> | "all", selected: boolean) => {
        setData((prev) =>
            prev && {
                ...prev,
                clips: prev.clips.map((c) => (ids === "all" || ids.has(c.id) ? { ...c, selected } : c)),
            },
        );
    }, []);

    // 画面はすぐ切り替え、保存に失敗したら元に戻して知らせる
    const toggle = useCallback(
        (clip: PanelClip) => {
            const next = !clip.selected;
            setSelected(new Set([clip.id]), next);
            api.setSelected(clip.id, next).catch((error: unknown) => {
                setSelected(new Set([clip.id]), clip.selected);
                if (!handleError(error)) toast(error instanceof ApiError ? error.message : "保存できませんでした", "error");
            });
        },
        [setSelected, handleError, toast],
    );

    async function selectAll(selected: boolean) {
        if (!data) return;
        const before = data.clips;
        setBulkBusy(true);
        setSelected("all", selected);
        try {
            await api.selectAll(selected);
        } catch (error) {
            setData((prev) => prev && { ...prev, clips: before });
            if (!handleError(error)) toast(error instanceof ApiError ? error.message : "保存できませんでした", "error");
        } finally {
            setBulkBusy(false);
        }
    }

    const sections = useMemo(() => groupByVideo(data), [data]);

    if (loadError) {
        return (
            <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 pb-[14vh] text-center">
                <p className="text-sm text-muted">{loadError}</p>
                <Button variant="secondary" className="h-12 px-8" onClick={retry}>
                    もう一度読み込む
                </Button>
            </div>
        );
    }
    if (!data) {
        return <p className="pt-8 text-center text-sm text-muted">読み込んでいます…</p>;
    }
    if (data.clips.length === 0) {
        return (
            <EmptyState
                icon={<Film className="h-10 w-10" />}
                title="選べるクリップがありません"
                message="Mac の input/ に Setlog の動画を置いてから、serve を起動し直してください。"
            />
        );
    }

    // 採用数と推定時間は、選択と速度から毎回計算する（状態として持たない）
    const selected = data.clips.filter((c) => c.selected);
    const seconds = selected.reduce((sum, c) => sum + c.duration, 0) / data.project.speed;

    return (
        <div className="flex flex-1 flex-col">
            <div className="flex items-center justify-between gap-2 pb-3 pt-1">
                <h1 className="text-xl font-semibold text-ink">使うクリップを選ぶ</h1>
                <div className="flex shrink-0 gap-1">
                    <Button variant="text" size="sm" className="h-11 px-3" disabled={bulkBusy} onClick={() => void selectAll(true)}>
                        全選択
                    </Button>
                    <Button variant="text" size="sm" className="h-11 px-3" disabled={bulkBusy} onClick={() => void selectAll(false)}>
                        全解除
                    </Button>
                </div>
            </div>
            <p className="pb-3 text-sm text-muted">タップで採用・除外を切り替えます。長押しか ▶ で再生します。</p>

            <div className="flex flex-col gap-6 pb-4">
                {sections.map((section) => (
                    <section key={section.video} aria-label={section.title}>
                        <h2 className="flex items-baseline justify-between gap-2 pb-2">
                            <span className="text-base font-semibold text-ink">{section.title}</span>
                            <span className="truncate text-xs text-muted">{section.subtitle}</span>
                        </h2>
                        <ul className="grid grid-cols-2 gap-3">
                            {section.clips.map((clip) => (
                                <ClipTile key={clip.id} clip={clip} onToggle={toggle} onPlay={setPlaying} />
                            ))}
                        </ul>
                    </section>
                ))}
            </div>

            <BottomBar
                summary={
                    selected.length > 0 ? (
                        <>
                            <span className="font-semibold tabular-nums text-ink">{selected.length}</span> 件を選択・約{" "}
                            {formatSeconds(seconds)}（{data.project.speed}x）
                        </>
                    ) : (
                        "1 件以上選んでください"
                    )
                }
            >
                <Button className={PRIMARY_ACTION} disabled={selected.length === 0} onClick={() => navigate("/settings")}>
                    次へ
                </Button>
            </BottomBar>

            {playing && <ClipPlayer clip={playing} onClose={() => setPlaying(null)} />}
        </div>
    );
}

type Section = { video: string; title: string; subtitle: string; clips: PanelClip[] };

// 動画ごとにまとめ、撮影日が分かれば見出しにする
function groupByVideo(data: Loaded | null): Section[] {
    if (!data) return [];
    const createdAt = new Map(data.project.videos.map((v) => [v.name, v.created_at]));
    const sections = new Map<string, Section>();
    for (const clip of data.clips) {
        let section = sections.get(clip.video);
        if (!section) {
            const created = createdAt.get(clip.video);
            section = {
                video: clip.video,
                title: created ? formatDate(created) : clip.video,
                subtitle: created ? clip.video : "",
                clips: [],
            };
            sections.set(clip.video, section);
        }
        section.clips.push(clip);
    }
    return [...sections.values()];
}
