import { useNavigate } from "react-router";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { PageHeader } from "@/components/ui/PageHeader";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { useThemePreference, type ThemePreference } from "@/context/ThemePreference";
import BottomBar, { PRIMARY_ACTION } from "@/layouts/BottomBar";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
    { value: "system", label: "スマホの設定に合わせる" },
    { value: "light", label: "ライト（明るい配色）" },
    { value: "dark", label: "ダーク（暗い配色）" },
];

// 設定。手順（動画・選ぶ・速度・確認）とは別の画面で、ヘッダーの「設定」から開く。
// 配色は選んだらすぐに反映し、このスマホのブラウザーに保存する（テンプレートの ThemePreference）。
export default function PreferencesPage() {
    const navigate = useNavigate();
    const { preference, setPreference } = useThemePreference();

    return (
        <div className="flex flex-1 flex-col gap-6">
            <PageHeader title="設定" description="選んだ内容は、すぐに反映します。" />

            <FormField
                label="配色"
                as="fieldset"
                supportText="「スマホの設定に合わせる」にすると、スマホの配色を変えたときに画面の配色も変わります。選んだ内容は、このスマホのブラウザーに保存します。"
            >
                <RadioGroup name="theme" size="md" value={preference} onChange={(value) => setPreference(value as ThemePreference)} options={THEME_OPTIONS} />
            </FormField>

            <BottomBar>
                {/* 手順のどの画面から開いても、元の画面へ戻る。直接開いたときは最初の手順へ */}
                <Button {...PRIMARY_ACTION} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}>
                    前の画面に戻る
                </Button>
            </BottomBar>
        </div>
    );
}
