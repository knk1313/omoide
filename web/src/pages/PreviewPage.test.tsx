import { expectNoA11yViolations } from "@/test/axe";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Job } from "@/api/types";
import { fakeServer, loggedIn } from "@/test/fakeServer";
import { currentStep, renderApp } from "@/test/renderApp";
import { polling } from "./preview/useJob";

const job = (kind: Job["kind"], status: Job["status"], progress: number, extra: Partial<Job> = {}): Job => ({
    id: `${kind}-1`, kind, status, progress, error: null, result: null,
    url: status === "done" ? (kind === "preview" ? "/media/preview?v=preview-1" : "/download/output") : null,
    ...extra,
});

/** 呼ばれるたびに、次の状態を返す（最後の状態は繰り返す）。 */
function sequence(...replies: { status: number; body?: unknown }[]) {
    let i = 0;
    return () => replies[Math.min(i++, replies.length - 1)];
}

const ok = (body: unknown) => ({ status: 200, body });
const accepted = (body: unknown) => ({ status: 202, body });

beforeEach(() => {
    polling.intervalMs = 5;
});
afterEach(() => {
    polling.intervalMs = 700;
});

async function openPreview(routes: Parameters<typeof fakeServer>[0]) {
    const server = fakeServer({ ...loggedIn, ...routes });
    const app = renderApp("/preview");
    await screen.findByRole("heading", { name: "プレビューを確認" });
    return { server, ...app };
}

describe("プレビュー・ダウンロード画面", () => {
    it("開くとプレビューを作り始め、進み具合を表示して、できたら再生できる", async () => {
        // 進み具合を確かめるまでは 40% のままにし、確かめた後で作り終えたことにする
        let finished = false;
        const { server } = await openPreview({
            "POST /api/preview": accepted(job("preview", "queued", 0)),
            "GET /api/jobs/preview-1": () => ok(finished ? job("preview", "done", 1) : job("preview", "running", 0.4)),
        });
        const bar = await screen.findByRole("progressbar", { name: "プレビューを作っています" });
        await waitFor(() => expect(bar).toHaveAttribute("aria-valuenow", "40"));
        expect(screen.getByText("40%")).toBeInTheDocument();
        finished = true;

        const video = await screen.findByLabelText("プレビュー動画");
        expect(video).toHaveAttribute("src", "/media/preview?v=preview-1");
        expect(video).toHaveAttribute("playsinline");
        expect(server.calls.filter((c) => c.method === "POST" && c.path === "/api/preview")).toHaveLength(1);
    });

    it("作り終えたプレビューがあれば、すぐに再生できる", async () => {
        await openPreview({ "POST /api/preview": accepted(job("preview", "done", 1)) });
        expect(await screen.findByLabelText("プレビュー動画")).toBeInTheDocument();
        expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });

    it("プレビューに失敗したら、理由を表示してもう一度試せる", async () => {
        const { user } = await openPreview({
            "POST /api/preview": sequence(
                accepted(job("preview", "failed", 0.3, { error: "動画の生成に失敗しました。もう一度お試しください" })),
                accepted(job("preview", "done", 1)),
            ),
        });
        expect(await screen.findByRole("alert")).toHaveTextContent("動画の生成に失敗しました");
        await user.click(screen.getByRole("button", { name: "もう一度試す" }));
        expect(await screen.findByLabelText("プレビュー動画")).toBeInTheDocument();
    });

    it("始められないときは、サーバーの理由を表示する", async () => {
        await openPreview({
            "POST /api/preview": { status: 422, body: { detail: "採用しているパネルがありません。クリップを選んでください" } },
        });
        expect(await screen.findByRole("alert")).toHaveTextContent("クリップを選んでください");
    });

    it("完成版はプレビューができるまで作れない", async () => {
        await openPreview({
            "POST /api/preview": accepted(job("preview", "running", 0.1)),
            "GET /api/jobs/preview-1": ok(job("preview", "running", 0.2)),
        });
        expect(screen.getByRole("button", { name: "完成版を作る" })).toBeDisabled();
    });

    it("完成版を作り、できたら保存できる", async () => {
        const { user } = await openPreview({
            "POST /api/preview": accepted(job("preview", "done", 1)),
            "POST /api/export": accepted(job("export", "running", 0)),
            "GET /api/jobs/export-1": sequence(ok(job("export", "running", 0.5)), ok(job("export", "done", 1))),
        });
        // プレビューができてから、完成版を作れる
        await screen.findByLabelText("プレビュー動画");
        await user.click(screen.getByRole("button", { name: "完成版を作る" }));
        expect(await screen.findByRole("progressbar", { name: "完成版を作っています" })).toBeInTheDocument();

        const save = await screen.findByRole("link", { name: "保存する" });
        expect(save).toHaveAttribute("download");
        // 名前は空から入力する。入力欄には当日の日付を使った例を出す
        const name = screen.getByLabelText(/^ファイル名/);
        expect(name).toHaveValue("");
        expect(name).toHaveAttribute("placeholder", expect.stringMatching(/^例：\d{8}の動画$/));
        await user.type(name, "9月の旅行");
        expect(save).toHaveAttribute("href", `/download/output?name=${encodeURIComponent("9月の旅行")}`);
        expect(save).toHaveAttribute("download", "9月の旅行.mp4");
        expect(screen.getByText("完成版ができました")).toBeInTheDocument();
    });

    it("ファイル名が空や使えない文字なら、保存に進まずに入力欄の下に理由を出す", async () => {
        const { user } = await openPreview({
            "POST /api/preview": accepted(job("preview", "done", 1)),
            "POST /api/export": accepted(job("export", "done", 1)),
        });
        await screen.findByLabelText("プレビュー動画");
        await user.click(screen.getByRole("button", { name: "完成版を作る" }));
        const save = await screen.findByRole("link", { name: "保存する" });
        const name = screen.getByLabelText(/^ファイル名/);

        // 空のまま押すと、保存（リンクの移動）を止めて入力欄へ戻す
        expect(fireEvent.click(save)).toBe(false);
        expect(name).toHaveAttribute("aria-invalid", "true");
        expect(name).toHaveAccessibleDescription(/ファイル名を入力してください/);
        expect(name).toHaveFocus();

        await user.type(name, "旅行/京都");
        expect(fireEvent.click(save)).toBe(false);
        expect(name).toHaveAccessibleDescription(/「\/」はファイル名に使えません/);

        // 直すそばから検査し直し、使える名前なら保存に進む
        await user.clear(name);
        await user.type(name, "旅行（京都）.mp4");
        expect(name).not.toHaveAttribute("aria-invalid");
        expect(save).toHaveAttribute("download", "旅行（京都）.mp4");
        expect(fireEvent.click(save)).toBe(true);
    });

    it("生成の途中でMacにつながらなくなったら、原因と対処を並べて案内する", async () => {
        await openPreview({
            "POST /api/preview": accepted(job("preview", "running", 0.1)),
            "GET /api/jobs/preview-1": new TypeError("Failed to fetch"),
        });
        expect(await screen.findByRole("heading", { name: "Macにつながりません" })).toBeInTheDocument();
        const checks = screen.getAllByRole("listitem").map((li) => li.textContent);
        expect(checks.join("\n")).toMatch(/同じWi-Fi/);
        expect(checks.join("\n")).toMatch(/スリープ/);
        expect(checks.join("\n")).toMatch(/serveが動いているか/);
    });

    it("Wi-Fiが一瞬途切れただけなら、作業を止めずに取り直す", async () => {
        let calls = 0;
        await openPreview({
            "POST /api/preview": accepted(job("preview", "running", 0.1)),
            // 1 回だけ接続に失敗し、その後は作り終える
            "GET /api/jobs/preview-1": () => (++calls === 1 ? new TypeError("Failed to fetch") : ok(job("preview", "done", 1))),
        });
        expect(await screen.findByLabelText("プレビュー動画")).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Macにつながりません" })).not.toBeInTheDocument();
    });

    it("動画を読み込めなければ、理由と読み込み直すボタンを出す", async () => {
        const { user } = await openPreview({ "POST /api/preview": accepted(job("preview", "done", 1)) });
        const video = await screen.findByLabelText("プレビュー動画");
        fireEvent.error(video);
        expect(await screen.findByRole("alert")).toHaveTextContent("動画を読み込めませんでした");
        await user.click(screen.getByRole("button", { name: "もう一度読み込む" }));
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(screen.getByLabelText("プレビュー動画")).toBeInTheDocument();
    });

    it("生成の途中で共有の期限が切れたら、その案内に切り替える", async () => {
        await openPreview({
            "POST /api/preview": accepted(job("preview", "running", 0.1)),
            "GET /api/jobs/preview-1": { status: 410, body: { detail: "共有の期限が切れました" } },
        });
        expect(await screen.findByRole("heading", { name: "共有の期限が切れました" })).toBeInTheDocument();
    });

    it("速度を変えるで前の画面へ移れる", async () => {
        const { user } = await openPreview({ "POST /api/preview": accepted(job("preview", "done", 1)) });
        await user.click(screen.getByRole("button", { name: "速度を変える" }));
        expect(await screen.findByRole("heading", { name: "速度を選ぶ" })).toBeInTheDocument();
    });

    it("完成版の生成に失敗したら、理由を表示して作り直せる", async () => {
        const { user } = await openPreview({
            "POST /api/preview": accepted(job("preview", "done", 1)),
            "POST /api/export": sequence(
                accepted(job("export", "failed", 0.2, { error: "動画の生成に失敗しました。もう一度お試しください" })),
                accepted(job("export", "done", 1)),
            ),
        });
        await screen.findByLabelText("プレビュー動画");
        await user.click(screen.getByRole("button", { name: "完成版を作る" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("動画の生成に失敗しました");
        await user.click(screen.getByRole("button", { name: "もう一度作る" }));
        expect(await screen.findByRole("link", { name: "保存する" })).toBeInTheDocument();
    });

    it("再生枠を動画と同じ縦横比にする", async () => {
        await openPreview({ "POST /api/preview": accepted(job("preview", "done", 1)) });
        const video = await screen.findByLabelText("プレビュー動画");
        await waitFor(() => expect(video).toHaveAttribute("width", "1160"));
        expect(video).toHaveAttribute("height", "634");
    });

    it("アクセシビリティ違反がない（完成版を保存できる状態）", async () => {
        const { container, user } = await openPreview({
            "POST /api/preview": accepted(job("preview", "done", 1)),
            "POST /api/export": accepted(job("export", "done", 1)),
        });
        await screen.findByLabelText("プレビュー動画");
        await user.click(screen.getByRole("button", { name: "完成版を作る" }));
        await screen.findByRole("link", { name: "保存する" });
        await expectNoA11yViolations(container);
    });

    it("手順の表示は4番目", async () => {
        await openPreview({ "POST /api/preview": accepted(job("preview", "done", 1)) });
        expect(currentStep()).toHaveTextContent(/ステップ4 \/ 4、現在のステップ.*確認/);
    });
});
