import { useState } from "react";
import { api, ApiError } from "@/api/client";
import type { StorageStatus } from "@/api/types";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { formatBytes } from "@/lib/format";
import { useSession } from "@/session/Session";

// データを消す（main.py clean と同じ対象）。保存先にある、取り込んだ動画・完成版・作業用ファイルをすべて消し、
// 動画のない状態に戻す。元に戻せないので、何がどれだけ消えるかを示して確かめてから消す。
export default function ClearDataSection({ status, onCleared }: { status: StorageStatus; onCleared: () => void }) {
    const { confirm } = useConfirm();
    const { toast } = useToast();
    const { handleError } = useSession();
    const [clearing, setClearing] = useState(false);
    const { input, output, work } = status.usage;
    const total = input.bytes + output.bytes + work.bytes;
    const empty = input.count + output.count + work.count === 0;

    async function clear() {
        const ok = await confirm({
            title: "すべてのデータを消しますか",
            message: `取り込んだ動画${input.count}件、完成版${output.count}件、作業用ファイル（合計${formatBytes(total)}）をMacから消します。選んだクリップと撮影日も消えます。元に戻せません。`,
            confirmLabel: "消す",
            tone: "error",
        });
        if (!ok) return;
        setClearing(true);
        try {
            await api.clearData();
            toast({ title: "すべてのデータを消しました", type: "success" });
            onCleared();
        } catch (err) {
            if (!handleError(err)) toast({ title: err instanceof ApiError ? err.message : "消せませんでした。もう一度お試しください", type: "error" });
        } finally {
            setClearing(false);
        }
    }

    return (
        <section aria-labelledby="clear-title" className="flex flex-col gap-3">
            <h2 id="clear-title" className="m-0 text-std-20B-150 text-text-strong">
                データを消す
            </h2>
            <p className="m-0 text-text-muted">
                保存先にある、取り込んだ動画・完成版・作業用ファイルをすべて消します。Macの中の動画の容量を空けたいときや、最初からやり直したいときに使います。
            </p>
            {/* 消すものがないときは押せない。理由は文言で示す */}
            {empty && <p className="m-0">消すデータはありません。</p>}
            <Button variant="outline" tone="error" block loading={clearing} disabled={empty} onClick={() => void clear()}>
                すべてのデータを消す
            </Button>
        </section>
    );
}
