import { Clock, QrCode, WifiOff, type LucideIcon } from "lucide-react";
import Button from "@/components/Button";
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

// ログインより前に進めないときの案内。次に取る操作を短く示す。
export default function ShareProblem({ status }: { status: Problem }) {
    const { icon: Icon, title, message, checks = [] } = MESSAGES[status];
    return (
        <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 pb-[14vh] text-center">
            <Icon className="h-10 w-10 text-faint" aria-hidden />
            <h1 className="text-lg font-semibold text-ink">{title}</h1>
            <p className="text-sm leading-relaxed text-muted">{message}</p>
            {checks.length > 0 && (
                <ul className="flex w-full flex-col gap-2 text-left text-sm leading-relaxed text-ink">
                    {checks.map((check) => (
                        <li key={check} className="flex items-start gap-2 rounded-control bg-surface px-3 py-2">
                            {/* 1 行目の高さの箱の中央に置き、折り返しても 1 行目とそろえる */}
                            <span aria-hidden className="flex h-[1lh] shrink-0 items-center">
                                <span className="h-1.5 w-1.5 rounded-full bg-muted" />
                            </span>
                            {check}
                        </li>
                    ))}
                </ul>
            )}
            {status === "offline" && (
                <Button variant="secondary" className="mt-2 h-12 px-8" onClick={() => window.location.reload()}>
                    もう一度試す
                </Button>
            )}
        </div>
    );
}
