import { Clock, QrCode, WifiOff, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { SessionStatus } from "./Session";

type Problem = "no-share" | "expired" | "offline";
type Message = { icon: LucideIcon; title: string; message: string; checks?: readonly string[] };

const MESSAGES: Record<Problem, Message> = {
    "no-share": {
        icon: QrCode,
        title: "QR コードを読み取ってください",
        message: "Mac のターミナルに表示された QR コードを、このスマホのカメラで読み取ってください。",
    },
    expired: {
        icon: Clock,
        title: "共有の期限が切れました",
        message: "Mac でもう一度 serve を起動し、新しく表示された QR コードを読み取ってください。",
    },
    offline: {
        icon: WifiOff,
        title: "Mac につながりません",
        message: "次のどれかが起きています。確かめてから、もう一度試してください。",
        // ブラウザからは原因を見分けられないので、考えられる原因と対処を並べる
        checks: [
            "スマホが Mac と同じ Wi-Fi に接続しているか",
            "Mac がスリープしていないか。スリープしていたら、Mac を開いて起こす",
            "Mac のターミナルで serve が動いているか。終了していたら起動し直し、新しい QR コードを読み取る",
        ],
    },
};

export function isShareProblem(status: SessionStatus): status is Problem {
    return status in MESSAGES;
}

// ログインより前に進めないときの案内（omoide の業務部品）。テンプレートの ErrorPage と同じ並び（見出し → 説明 → 次の行動）で、
// 原因の候補を箇条書きで添える。
export default function ShareProblem({ status }: { status: Problem }) {
    const { icon, title, message, checks = [] } = MESSAGES[status];
    return (
        <section role="alert" aria-labelledby="share-problem-title" className="flex flex-col items-center gap-4 py-16 text-center text-16 leading-170 tracking-2 text-text">
            <Icon icon={icon} size="xl" className="text-text-subtle" />
            <h1 id="share-problem-title" className="m-0 text-std-24B-150 text-text-strong">
                {title}
            </h1>
            <p className="m-0 text-text-muted">{message}</p>
            {checks.length > 0 && (
                <ul className="m-0 flex w-full list-disc flex-col gap-2 pl-6 text-left">
                    {checks.map((check) => (
                        <li key={check}>{check}</li>
                    ))}
                </ul>
            )}
            {status === "offline" && (
                <Button variant="outline" block className="mt-4" onClick={() => window.location.reload()}>
                    もう一度試す
                </Button>
            )}
        </section>
    );
}
