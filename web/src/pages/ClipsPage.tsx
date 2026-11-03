import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { api, ApiError } from "@/api/client";
import type { PanelClip, Project } from "@/api/types";
import { LoadFailure, Loading } from "@/components/app/PageStatus";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { PageHeader } from "@/components/ui/PageHeader";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { useToast } from "@/components/ui/Toast";
import BottomBar, { PRIMARY_ACTION } from "@/layouts/BottomBar";
import { formatDay, formatSeconds } from "@/lib/format";
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
    // 表示するユーザー（上から 1・2・3）。null なら全員
    const [panelFilter, setPanelFilter] = useState<number | null>(null);

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
                if (!handleError(error)) toast({ title: error instanceof ApiError ? error.message : "保存できませんでした", type: "error" });
            });
        },
        [setSelected, handleError, toast],
    );

    // 絞り込んでいるときは、表示しているユーザーだけを対象にする。only なら、それ以外のユーザーを除外する
    async function selectAll(selected: boolean, only = false) {
        if (!data) return;
        const before = data.clips;
        const panel = panelFilter;
        setBulkBusy(true);
        setData((prev) =>
            prev && {
                ...prev,
                clips: prev.clips.map((c) =>
                    panel === null || c.panel === panel ? { ...c, selected } : only ? { ...c, selected: false } : c,
                ),
            },
        );
        try {
            await api.selectAll(selected, panel === null ? {} : { panel, only });
        } catch (error) {
            setData((prev) => prev && { ...prev, clips: before });
            if (!handleError(error)) toast({ title: error instanceof ApiError ? error.message : "保存できませんでした", type: "error" });
        } finally {
            setBulkBusy(false);
        }
    }

    const users = useMemo(() => listUsers(data), [data]);
    const sections = useMemo(
        () => groupByVideo(data && { ...data, clips: data.clips.filter((c) => panelFilter === null || c.panel === panelFilter) }),
        [data, panelFilter],
    );
    const filterLabel = users.find((u) => u.panel === panelFilter)?.label;

    const header = <PageHeader title="使うクリップを選ぶ" description="タップで採用・除外。▶ か長押しで再生。" />;

    if (loadError) {
        return (
            <div className="flex flex-1 flex-col gap-6">
                {header}
                <LoadFailure message={loadError} onRetry={retry} />
            </div>
        );
    }
    if (!data) {
        return (
            <div className="flex flex-1 flex-col gap-6">
                {header}
                <Loading />
            </div>
        );
    }
    if (data.clips.length === 0) {
        // 動画がまだ無ければ、取り込む画面から始める
        return <Navigate to="/videos" replace />;
    }

    // 採用数と推定時間は、選択と速度から毎回計算する（状態として持たない）
    const selected = data.clips.filter((c) => c.selected);
    const seconds = selected.reduce((sum, c) => sum + c.duration, 0) / data.project.speed;

    return (
        <div className="flex flex-1 flex-col gap-6">
            {header}

            <div className="flex flex-col gap-2">
                {users.length > 1 && (
                    <FormField label="表示するユーザー" as="fieldset">
                        <RadioGroup
                            name="user"
                            direction="horizontal"
                            value={panelFilter === null ? "all" : String(panelFilter)}
                            onChange={(value) => setPanelFilter(value === "all" ? null : Number(value))}
                            options={[{ panel: null, label: "全員", count: data.clips.length }, ...users].map((user) => ({
                                value: user.panel === null ? "all" : String(user.panel),
                                label: (
                                    <>
                                        {user.label}
                                        <span className="nums text-text-muted">（{user.count}）</span>
                                    </>
                                ),
                            }))}
                        />
                    </FormField>
                )}
                {/* 一括の操作。絞り込んでいるときは、表示しているユーザーだけに効く */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
                    <Button variant="text" size="sm" disabled={bulkBusy} onClick={() => void selectAll(true)}>
                        全選択
                    </Button>
                    <Button variant="text" size="sm" disabled={bulkBusy} onClick={() => void selectAll(false)}>
                        全解除
                    </Button>
                    {filterLabel && (
                        <Button variant="outline" size="sm" disabled={bulkBusy} onClick={() => void selectAll(true, true)}>
                            {filterLabel}だけ使う
                        </Button>
                    )}
                </div>
            </div>

            <div className="flex flex-col gap-8 pb-4">
                {sections.map((section) => (
                    <section key={section.video} aria-label={section.title} className="flex flex-col gap-3">
                        <h2 className="m-0 flex min-w-0 items-baseline justify-between gap-2">
                            <span className="text-std-20B-150 text-text-strong">{section.title}</span>
                            <span className="truncate text-16 font-normal text-text-muted">{section.subtitle}</span>
                        </h2>
                        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0">
                            {section.clips.map((clip) => (
                                <ClipTile key={clip.id} clip={clip} onToggle={toggle} onPlay={setPlaying} />
                            ))}
                        </ul>
                    </section>
                ))}
            </div>

            <BottomBar
                back={{ label: "動画", onClick: () => navigate("/videos") }}
                summary={
                    selected.length > 0 ? (
                        <>
                            <span className="nums font-bold text-text-strong">{selected.length}</span> 件を選択・約 {formatSeconds(seconds)}（
                            {data.project.speed}x）
                        </>
                    ) : (
                        "1 件以上選んでください"
                    )
                }
            >
                <Button {...PRIMARY_ACTION} disabled={selected.length === 0} onClick={() => navigate("/settings")}>
                    次へ
                </Button>
            </BottomBar>

            {playing && <ClipPlayer clip={playing} onClose={() => setPlaying(null)} />}
        </div>
    );
}

type User = { panel: number; label: string; count: number };

// 中身のあるパネルを持つユーザー（上から 1・2・3）と、その数
function listUsers(data: Loaded | null): User[] {
    if (!data) return [];
    const users = new Map<number, User>();
    for (const clip of data.clips) {
        const user = users.get(clip.panel) ?? { panel: clip.panel, label: clip.label, count: 0 };
        user.count += 1;
        users.set(clip.panel, user);
    }
    return [...users.values()].sort((a, b) => a.panel - b.panel);
}

type Section = { video: string; title: string; subtitle: string; clips: PanelClip[] };

// 動画ごとにまとめ、利用者が入力した撮影日を見出しにする（並び順はサーバーが撮影日の順にしている）
function groupByVideo(data: Loaded | null): Section[] {
    if (!data) return [];
    const dates = new Map(data.project.videos.map((v) => [v.name, v.date]));
    const sections = new Map<string, Section>();
    for (const clip of data.clips) {
        let section = sections.get(clip.video);
        if (!section) {
            const date = dates.get(clip.video);
            section = {
                video: clip.video,
                title: date ? formatDay(date) : "撮影日が未入力",
                subtitle: clip.video,
                clips: [],
            };
            sections.set(clip.video, section);
        }
        section.clips.push(clip);
    }
    return [...sections.values()];
}
