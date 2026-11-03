import { memo } from "react";
import { Check, Play } from "lucide-react";
import type { PanelClip } from "@/api/types";
import { formatSeconds } from "@/lib/format";
import { useLongPress } from "./useLongPress";

type Props = {
    clip: PanelClip;
    onToggle: (clip: PanelClip) => void;
    onPlay: (clip: PanelClip) => void;
};

// パネル 1 件。タップで採用・除外を切り替え、再生ボタンか長押しで単体を再生する。
// 数百件並ぶので memo にし、ほかのタイルの切り替えでは描き直さない。
function ClipTile({ clip, onToggle, onPlay }: Props) {
    const { handlers, consumeClick } = useLongPress(() => onPlay(clip));
    const name = `クリップ ${clip.clip}・${clip.label}`;

    return (
        <li className="relative">
            <button
                type="button"
                aria-pressed={clip.selected}
                aria-label={`${name}（${clip.selected ? "採用" : "除外"}）`}
                onClick={() => {
                    if (!consumeClick()) onToggle(clip);
                }}
                {...handlers}
                className={`block w-full touch-manipulation select-none overflow-hidden rounded-surface bg-surface text-left ring-2 transition [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                    clip.selected ? "ring-brand" : "ring-transparent"
                }`}
            >
                <span className="relative block aspect-video bg-surface-2">
                    <img
                        src={clip.thumbnail_url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        className={`h-full w-full object-cover transition-opacity ${clip.selected ? "" : "opacity-35"}`}
                    />
                    {/* 色だけに頼らず、印と文言でも採用・除外を示す。
                        右上の再生ボタンと同じ 44px の箱 (left-1 top-1) の中央に置き、左右の印の高さをそろえる */}
                    <span aria-hidden className="absolute left-1 top-1 flex h-11 w-11 items-center justify-center">
                        <span
                            className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                                clip.selected ? "border-brand bg-brand text-on-brand" : "border-on-dark bg-scrim/30 text-transparent"
                            }`}
                        >
                            <Check className="h-4 w-4" strokeWidth={3} />
                        </span>
                    </span>
                    {!clip.selected && (
                        <span aria-hidden className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-ink">
                            除外
                        </span>
                    )}
                </span>
                <span className="flex h-8 items-center justify-between gap-1 px-2 text-xs text-muted">
                    <span className="truncate">{name}</span>
                    <span className="shrink-0 tabular-nums">{formatSeconds(clip.duration)}</span>
                </span>
            </button>
            {/* 再生ボタンはタイルの外側に置く（ボタンの中にボタンを入れない） */}
            <button
                type="button"
                onClick={() => onPlay(clip)}
                aria-label={`${name}を再生`}
                className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-brand"
            >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-scrim/55 text-on-dark">
                    <Play className="h-4 w-4 translate-x-px" fill="currentColor" aria-hidden />
                </span>
            </button>
        </li>
    );
}

export default memo(ClipTile);
