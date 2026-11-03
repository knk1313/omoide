import { useNavigate } from "react-router";
import Button from "@/components/Button";
import StepPlaceholder from "@/components/StepPlaceholder";

export default function ClipsPage() {
    const navigate = useNavigate();
    return (
        <StepPlaceholder title="使うクリップを選ぶ" issue={13}>
            <Button className="h-12 w-full" onClick={() => navigate("/settings")}>
                次へ
            </Button>
        </StepPlaceholder>
    );
}
