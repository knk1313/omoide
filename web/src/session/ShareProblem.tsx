import { Clock, QrCode, WifiOff } from "lucide-react";
import Button from "@/components/Button";
import type { SessionStatus } from "./Session";

const MESSAGES = {
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
        message: "Mac と同じ Wi-Fi に接続しているか、Mac でサーバーが動いているかを確かめてください。",
    },
} as const;

type Problem = keyof typeof MESSAGES;

export function isShareProblem(status: SessionStatus): status is Problem {
    return status in MESSAGES;
}

// ログインより前に進めないときの案内。次に取る操作を短く示す。
export default function ShareProblem({ status }: { status: Problem }) {
    const { icon: Icon, title, message } = MESSAGES[status];
    return (
        <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 pb-[14vh] text-center">
            <Icon className="h-10 w-10 text-faint" aria-hidden />
            <h1 className="text-lg font-semibold text-ink">{title}</h1>
            <p className="text-sm leading-relaxed text-muted">{message}</p>
            {status === "offline" && (
                <Button variant="secondary" className="mt-2 h-12 px-8" onClick={() => window.location.reload()}>
                    もう一度試す
                </Button>
            )}
        </div>
    );
}
