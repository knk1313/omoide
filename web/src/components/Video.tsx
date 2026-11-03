import { useState, type VideoHTMLAttributes } from "react";
import Button from "./Button";

type Props = VideoHTMLAttributes<HTMLVideoElement> & { src: string };

// 動画を読み込めなかったら、黒い枠のままにせず、理由と「もう一度読み込む」を出す
export default function Video({ src, className = "", ...props }: Props) {
    const [failed, setFailed] = useState(false);
    // 読み込み直すたびに video を作り直す
    const [attempt, setAttempt] = useState(0);

    return (
        <div className="flex flex-col gap-2">
            <video key={attempt} src={src} className={className} onError={() => setFailed(true)} {...props} />
            {failed && (
                <div role="alert" className="flex items-center justify-between gap-3 rounded-control bg-danger-surface px-3 py-2">
                    <p className="text-sm text-danger">動画を読み込めませんでした。</p>
                    <Button
                        variant="secondary"
                        size="sm"
                        className="h-11 bg-surface"
                        onClick={() => {
                            setFailed(false);
                            setAttempt((n) => n + 1);
                        }}
                    >
                        もう一度読み込む
                    </Button>
                </div>
            )}
        </div>
    );
}
