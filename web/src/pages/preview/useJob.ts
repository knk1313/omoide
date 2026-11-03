import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/api/client";
import type { Job, JobKind } from "@/api/types";
import { useSession } from "@/session/Session";

/** 進み具合を取りに行く間隔と、あきらめるまでに続けて失敗してよい回数。テストでは間隔を短くする。 */
export const polling = { intervalMs: 700, maxFailures: 3 };

/** Wi-Fi が一瞬途切れただけで作業を止めないよう、接続の失敗は続けて maxFailures 回までやり直す。 */
export function isTransient(error: unknown, failures: number): boolean {
    return error instanceof ApiError && error.status === 0 && failures < polling.maxFailures;
}

/**
 * 生成ジョブを始め、終わるまで進み具合を取りに行く。
 * 始められなかったときや途中で取れなくなったときは error に利用者向けの文言を入れる。
 * ログイン切れ・期限切れ・接続切れは画面ごと切り替える（useSession の handleError）。
 */
export function useJob(kind: Exclude<JobKind, "analyze">) {
    const { handleError } = useSession();
    const [job, setJob] = useState<Job | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [starting, setStarting] = useState(false);
    const [failures, setFailures] = useState(0);

    const fail = useCallback(
        (err: unknown, fallback: string) => {
            if (!handleError(err)) setError(err instanceof ApiError ? err.message : fallback);
        },
        [handleError],
    );

    const start = useCallback(async () => {
        setStarting(true);
        setError(null);
        try {
            setJob(await api.startJob(kind));
        } catch (err) {
            fail(err, "生成を始められませんでした");
        } finally {
            setStarting(false);
        }
    }, [kind, fail]);

    const active = job !== null && (job.status === "queued" || job.status === "running");
    const jobId = job?.id;
    useEffect(() => {
        if (!active || !jobId) return;
        const timer = setTimeout(() => {
            api.job(jobId).then(
                (next) => {
                    setFailures(0);
                    setJob(next);
                },
                (err: unknown) => {
                    if (isTransient(err, failures + 1)) setFailures((n) => n + 1);
                    else fail(err, "進み具合を取得できませんでした");
                },
            );
        }, polling.intervalMs);
        return () => clearTimeout(timer);
    }, [active, jobId, job, failures, fail]);

    return { job, error, starting, start };
}
