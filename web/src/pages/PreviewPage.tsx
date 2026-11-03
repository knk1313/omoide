import { useNavigate } from "react-router";
import Button from "@/components/Button";
import StepPlaceholder from "@/components/StepPlaceholder";

export default function PreviewPage() {
    const navigate = useNavigate();
    return (
        <StepPlaceholder title="プレビューを確認" issue={15}>
            <Button variant="secondary" className="h-12 w-full" onClick={() => navigate("/settings")}>
                速度を変える
            </Button>
        </StepPlaceholder>
    );
}
