import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api, ApiError } from "@/api/client";
import type { StorageStatus } from "@/api/types";
import { LoadFailure, Loading } from "@/components/app/PageStatus";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { PageHeader } from "@/components/ui/PageHeader";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { useThemePreference, type ThemePreference } from "@/context/ThemePreference";
import BottomBar, { PRIMARY_ACTION } from "@/layouts/BottomBar";
import { useSession } from "@/session/Session";
import ClearDataSection from "./preferences/ClearDataSection";
import StorageSection from "./preferences/StorageSection";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
    { value: "system", label: "スマホの設定に合わせる" },
    { value: "light", label: "ライト（明るい配色）" },
    { value: "dark", label: "ダーク（暗い配色）" },
];

// 設定。手順（動画・選ぶ・速度・確認）とは別の画面で、ヘッダーの「設定」から開く。
// - 配色: 選んだらすぐに反映し、このスマホのブラウザーに保存する（テンプレートの ThemePreference）
// - 保存先: Mac の中で、動画・完成版・作業用ファイルを置くフォルダ（単体アプリだけ変えられる）
// - データを消す: 保存先のファイルをすべて消す（main.py clean と同じ対象）
export default function PreferencesPage() {
    const navigate = useNavigate();
    const { preference, setPreference } = useThemePreference();
    const { handleError } = useSession();
    const [storage, setStorage] = useState<StorageStatus | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    // 「もう一度読み込む」とデータを消した後に増やし、保存先の状態を読み直す
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let active = true;
        api.storage()
            .then((s) => active && setStorage(s))
            .catch((error: unknown) => {
                if (active && !handleError(error)) setLoadError(error instanceof ApiError ? error.message : "読み込めませんでした");
            });
        return () => {
            active = false;
        };
    }, [attempt, handleError]);

    const reload = () => {
        setLoadError(null);
        setAttempt((n) => n + 1);
    };

    return (
        <div className="flex flex-1 flex-col gap-8">
            <PageHeader title="設定" />

            <FormField
                label="配色"
                as="fieldset"
                supportText="選ぶとすぐに切り替わります。「スマホの設定に合わせる」にすると、スマホの配色を変えたときに画面の配色も変わります。このスマホのブラウザーに保存します。"
            >
                <RadioGroup name="theme" size="md" value={preference} onChange={(value) => setPreference(value as ThemePreference)} options={THEME_OPTIONS} />
            </FormField>

            {loadError ? (
                <LoadFailure message={loadError} onRetry={reload} />
            ) : !storage ? (
                <Loading />
            ) : (
                <>
                    <StorageSection key={JSON.stringify(storage.pending ?? storage.current)} status={storage} onChange={setStorage} />
                    <ClearDataSection status={storage} onCleared={reload} />
                </>
            )}

            <BottomBar>
                {/* 手順のどの画面から開いても、元の画面へ戻る。直接開いたときは最初の手順へ */}
                <Button {...PRIMARY_ACTION} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}>
                    前の画面に戻る
                </Button>
            </BottomBar>
        </div>
    );
}
