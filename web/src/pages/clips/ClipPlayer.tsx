import Modal from "@/components/Modal";
import type { PanelClip } from "@/api/types";

// パネル単体を再生する。iPhone で全画面にならないよう playsInline、自動で始めるため muted にする（音声は持たない）。
export default function ClipPlayer({ clip, onClose }: { clip: PanelClip; onClose: () => void }) {
    const name = `クリップ ${clip.clip}・${clip.label}`;
    return (
        <Modal onClose={onClose} label={`${name}の再生`}>
            <figure className="flex w-full max-w-md flex-col gap-2">
                <video
                    src={clip.video_url}
                    poster={clip.thumbnail_url}
                    controls
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="aspect-video w-full rounded-surface bg-scrim"
                />
                <figcaption className="text-center text-sm text-on-dark">{name}</figcaption>
            </figure>
        </Modal>
    );
}
