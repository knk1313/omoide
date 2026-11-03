import Modal from "@/components/Modal";
import type { PanelClip } from "@/api/types";

// パネル単体を再生する。iPhone で全画面にならないよう playsInline、自動で始めるため muted にする（音声は持たない）。
export default function ClipPlayer({ clip, onClose }: { clip: PanelClip; onClose: () => void }) {
    const name = `クリップ ${clip.clip}・${clip.label}`;
    return (
        <Modal onClose={onClose} label={`${name}の再生`}>
            <figure className="flex w-full max-w-md flex-col gap-2">
                {/* 再生枠をパネルと同じ縦横比にし、上下や左右に黒い帯を出さない */}
                <video
                    src={clip.video_url}
                    poster={clip.thumbnail_url}
                    width={clip.width}
                    height={clip.height}
                    controls
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="h-auto w-full rounded-surface bg-scrim"
                />
                <figcaption className="text-center text-sm text-on-dark">{name}</figcaption>
            </figure>
        </Modal>
    );
}
