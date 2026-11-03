import { memo } from "react";
import { Check, Play } from "lucide-react";
import type { PanelClip } from "@/api/types";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/cn";
import { formatSeconds } from "@/lib/format";
import { useLongPress } from "./useLongPress";

type Props = {
    clip: PanelClip;
    onToggle: (clip: PanelClip) => void;
    onPlay: (clip: PanelClip) => void;
};

// パネル 1 件（omoide の業務部品。テンプレートのトークンと Icon・IconButton で組む）。
// サムネイルをタップで採用・除外を切り替え、長押しか下の行の再生ボタンで単体を再生する。
// 再生ボタンはサムネイルに重ねず下の行に置き、2 つの操作の当たり判定が重ならないようにする（docs/migration-decisions.md M-13）。
// 数百件並ぶので memo にし、ほかのタイルの切り替えでは描き直さない。
function ClipTile({ clip, onToggle, onPlay }: Props) {
    const { handlers, consumeClick } = useLongPress(() => onPlay(clip));
    // 画面には「ユーザー1」だけを出す。読み上げでは同じ名前のタイルを区別できるよう、クリップの番号も付ける
    const name = `${clip.label}・クリップ ${clip.clip}`;

    return (
        <li className={cn("relative flex min-w-0 flex-col rounded-8 bg-surface", clip.selected ? "ring-3 ring-primary" : "ring-1 ring-border-on-canvas")}>
            <button
                type="button"
                aria-pressed={clip.selected}
                aria-label={`${name}（${clip.selected ? "採用" : "除外"}）`}
                onClick={() => {
                    if (!consumeClick()) onToggle(clip);
                }}
                {...handlers}
                // パネルと同じ縦横比にし、画像の上下や左右を切らない
                style={{ aspectRatio: `${clip.width} / ${clip.height}` }}
                className="relative block w-full touch-manipulation touch-callout-none select-none overflow-hidden rounded-t-8 bg-surface-strong focus-visible:focus-ring"
            >
                <img
                    src={clip.thumbnail_url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className={cn("size-full object-cover transition-opacity", !clip.selected && "opacity-30")}
                />
                {/* 色だけに頼らず、印と文言でも採用・除外を示す */}
                <span aria-hidden="true" className="absolute top-2 left-2 flex size-7 items-center justify-center">
                    <span
                        className={cn(
                            "flex size-6 items-center justify-center rounded-full border-2",
                            clip.selected ? "border-primary bg-primary text-text-on-primary" : "border-white bg-scrim text-transparent",
                        )}
                    >
                        <Icon icon={Check} size="sm" />
                    </span>
                </span>
            </button>
            {/* 「除外」の札は、ボタンの外にサムネイルと同じ位置で重ねる（ボタンの中に置くと、見えている文字がボタンの名前と
                食い違うと判定される）。タップはそのまま下のボタンに届く */}
            {!clip.selected && (
                <span
                    aria-hidden="true"
                    style={{ aspectRatio: `${clip.width} / ${clip.height}` }}
                    className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center"
                >
                    <span className="rounded-4 bg-surface px-2 text-16 leading-150 font-bold text-text-strong">除外</span>
                </span>
            )}
            <div className="flex min-w-0 items-center justify-between gap-1 pl-2">
                <span className="truncate text-14 leading-130 text-text">{clip.label}</span>
                <span className="flex shrink-0 items-center">
                    <span className="nums text-14 leading-130 text-text-muted">{formatSeconds(clip.duration)}</span>
                    <IconButton icon={Play} label={`${name}を再生`} onClick={() => onPlay(clip)} />
                </span>
            </div>
        </li>
    );
}

export default memo(ClipTile);
