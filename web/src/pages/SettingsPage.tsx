import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api, ApiError } from "@/api/client";
import type { Project, Speed } from "@/api/types";
import { LoadFailure, Loading } from "@/components/app/PageStatus";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { NotificationBanner } from "@/components/ui/NotificationBanner";
import { PageHeader } from "@/components/ui/PageHeader";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { useToast } from "@/components/ui/Toast";
import BottomBar, { PRIMARY_ACTION } from "@/layouts/BottomBar";
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
            if (!handleError(error)) toast({ title: error instanceof ApiError ? error.message : "保存できませんでした", type: "error" });
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

    return (
        <div className="flex flex-1 flex-col gap-6">
            <PageHeader title="速度を選ぶ" meta={project && <Summary project={project} />} />
            {loadError ? (
                <LoadFailure
                    message={loadError}
                    onRetry={() => {
                        setLoadError(null);
                        setAttempt((n) => n + 1);
                    }}
                />
            ) : !project ? (
                <Loading />
            ) : (
                <Settings
                    project={project}
                    starting={starting}
                    startError={startError}
                    onChooseSpeed={(speed) => void chooseSpeed(speed)}
                    onStart={() => void startPreview()}
                    onBack={() => navigate("/")}
                />
            )}
        </div>
    );
}

// 採用数とできあがりの長さ。ページ見出しの下に、名前と値の組で横に並べる
function Summary({ project }: { project: Project }) {
    const items = [
        { term: "採用したクリップ", value: `${project.selected_count}件` },
        { term: "できあがりの長さ", value: `約${formatSeconds(project.estimated_seconds)}` },
    ];
    return (
        <dl className="m-0 flex flex-wrap gap-x-6 gap-y-1">
            {items.map((item) => (
                <div key={item.term} className="flex gap-2">
                    <dt>{item.term}</dt>
                    <dd className="nums m-0 font-bold text-text-strong">{item.value}</dd>
                </div>
            ))}
        </dl>
    );
}

type SettingsProps = {
    project: Project;
    starting: boolean;
    startError: string | null;
    onChooseSpeed: (speed: Speed) => void;
    onStart: () => void;
    onBack: () => void;
};

function Settings({ project, starting, startError, onChooseSpeed, onStart, onBack }: SettingsProps) {
    // 等速での長さ。選択肢ごとの長さはここから計算する
    const baseSeconds = project.estimated_seconds * project.speed;
    const nothingSelected = project.selected_count === 0;

    return (
        <>
            <FormField label="全体の再生速度" as="fieldset" supportText="かっこ内は、その速度にしたときの長さです。">
                <RadioGroup
                    name="speed"
                    size="md"
                    value={String(project.speed)}
                    onChange={(value) => onChooseSpeed(Number(value) as Speed)}
                    options={SPEEDS.map((speed) => ({
                        value: String(speed),
                        label: (
                            <span className="nums">
                                {speed}x<span className="text-text-muted">（{formatSeconds(baseSeconds / speed)}）</span>
                            </span>
                        ),
                    }))}
                />
            </FormField>

            {(startError || nothingSelected) && (
                <NotificationBanner
                    type="error"
                    live="assertive"
                    title={startError ?? "クリップが1件も選ばれていません。クリップ選択に戻って選んでください。"}
                />
            )}

            <BottomBar back={{ label: "クリップ選択", onClick: onBack }}>
                <Button {...PRIMARY_ACTION} loading={starting} disabled={nothingSelected} onClick={onStart}>
                    {starting ? "生成を始めています…" : "プレビューを生成"}
                </Button>
            </BottomBar>
        </>
    );
}
