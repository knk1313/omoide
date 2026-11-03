import { useNavigate } from "react-router";
import Button from "@/components/Button";
import StepPlaceholder from "@/components/StepPlaceholder";

export default function SettingsPage() {
    const navigate = useNavigate();
    return (
        <StepPlaceholder title="速度を選ぶ" issue={14}>
            <Button className="h-12 w-full" onClick={() => navigate("/preview")}>
                プレビューへ
            </Button>
            <Button variant="secondary" className="h-12 w-full" onClick={() => navigate("/")}>
                クリップ選択に戻る
            </Button>
        </StepPlaceholder>
    );
}
