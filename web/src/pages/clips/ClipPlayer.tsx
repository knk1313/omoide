import type { PanelClip } from "@/api/types";
import VideoPlayer from "@/components/app/VideoPlayer";
import { ModalDialog } from "@/components/ui/ModalDialog";

// パネル単体を再生する（テンプレートの ModalDialog）。iPhone で全画面にならないよう playsInline、
// 自動で始めるため muted にする（音声は持たない）。
export default function ClipPlayer({ clip, onClose }: { clip: PanelClip; onClose: () => void }) {
    return (
        <ModalDialog
            open
            onClose={onClose}
            dismissOnBackdrop
            // 画面には「ユーザー1の再生」だけを出し、読み上げではクリップの番号も伝える
            // （読み上げ用の文を 1 つの要素にまとめる。途中だけ sr-only にすると、ブラウザが前後に空白を入れて名前が変わる）
            title={
                <>
                    <span aria-hidden="true">{clip.label}の再生</span>
                    <span className="sr-only">
                        {clip.label}・クリップ{clip.clip}の再生
                    </span>
                </>
            }
        >
            {/* 再生枠をパネルと同じ縦横比にし、上下や左右に黒い帯を出さない */}
            <VideoPlayer
                src={clip.video_url}
                poster={clip.thumbnail_url}
                width={clip.width}
                height={clip.height}
                controls
                autoPlay
                muted
                loop
                playsInline
                className="h-auto w-full rounded-8 bg-black"
            />
        </ModalDialog>
    );
}
