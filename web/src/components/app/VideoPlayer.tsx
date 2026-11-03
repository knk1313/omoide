import { useState, type VideoHTMLAttributes } from "react";
import { Button } from "@/components/ui/Button";
import { NotificationBanner } from "@/components/ui/NotificationBanner";

type Props = VideoHTMLAttributes<HTMLVideoElement> & { src: string };

// 動画（omoide の業務部品）。読み込めなかったら、黒い枠のままにせず、理由と「もう一度読み込む」を出す
export default function VideoPlayer({ src, className, ...props }: Props) {
    const [failed, setFailed] = useState(false);
    // 読み込み直すたびに video を作り直す
    const [attempt, setAttempt] = useState(0);
    return (
        <div className="flex flex-col gap-2">
            <video key={attempt} src={src} className={className} onError={() => setFailed(true)} {...props} />
            {failed && (
                <NotificationBanner
                    type="error"
                    live="assertive"
                    as="h3"
                    title="動画を読み込めませんでした。"
                    actions={
                        <Button
                            variant="outline"
                            block
                            onClick={() => {
                                setFailed(false);
                                setAttempt((n) => n + 1);
                            }}
                        >
                            もう一度読み込む
                        </Button>
                    }
                />
            )}
        </div>
    );
}
