import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeServer, loggedIn, sampleClips } from "@/test/fakeServer";
import { renderApp } from "@/test/renderApp";

async function openClips(routes: Parameters<typeof fakeServer>[0] = {}) {
    const server = fakeServer({ ...loggedIn, ...routes });
    const app = renderApp("/");
    await screen.findByRole("heading", { name: "使うクリップを選ぶ" });
    return { server, ...app };
}

// タイルの名前は「ユーザー2・クリップ 1（採用）」。再生ボタン（「…を再生」）とは区別する
// 下の帯の要約（「2 件を選択・約 4秒（1x）」）
const summary = () => screen.getByText((_, el) => el?.tagName === "P" && /件を選択/.test(el.textContent ?? ""));

// 採用・除外を切り替えるタイル（aria-pressed を持つボタン）だけ
const tiles = () => screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed"));

const tile = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}（`) });

describe("クリップ選択画面", () => {
    it("動画ごとに、入力した撮影日を見出しにしてパネルを並べる", async () => {
        await openClips();
        // メタデータの日付（9月19日）ではなく、利用者が入力した日付（9月20日）
        const september = screen.getByRole("region", { name: /2026年9月20日/ });
        expect(within(september).getAllByRole("button", { pressed: true })).toHaveLength(1);
        expect(within(september).getByRole("button", { name: "ユーザー3・クリップ 2（除外）" })).toHaveAttribute("aria-pressed", "false");
        // 撮影日を入力していない動画は、そのことを見出しにする
        expect(screen.getByRole("region", { name: "撮影日が未入力" })).toHaveTextContent("oct");
    });

    it("サムネイルは画面に入るまで読み込まない", async () => {
        const { container } = await openClips();
        const images = container.querySelectorAll("img");
        expect(images).toHaveLength(3);
        for (const img of images) {
            expect(img).toHaveAttribute("loading", "lazy");
        }
        expect(images[0]).toHaveAttribute("src", "/media/thumbnails/sep/001-2");
    });

    it("採用数と推定時間を表示する", async () => {
        await openClips();
        expect(summary()).toHaveTextContent("2 件を選択・約 4秒（1x）");
    });

    it("タップで除外し、サーバーに保存して数を更新する", async () => {
        const { server, user } = await openClips({ "PATCH /api/clips/sep/001-2": { status: 200 } });
        await user.click(tile("ユーザー2・クリップ 1"));

        expect(tile("ユーザー2・クリップ 1")).toHaveAttribute("aria-pressed", "false");
        expect(summary()).toHaveTextContent("1 件を選択・約 2秒");
        expect(server.calls.at(-1)).toEqual({ method: "PATCH", path: "/api/clips/sep/001-2", body: { selected: false } });
    });

    it("保存に失敗したら元に戻して知らせる", async () => {
        const { user } = await openClips({ "PATCH /api/clips/sep/002-3": { status: 500, body: { detail: "保存できませんでした" } } });
        await user.click(tile("ユーザー3・クリップ 2"));

        expect(await screen.findByRole("alert")).toHaveTextContent("保存できませんでした");
        expect(tile("ユーザー3・クリップ 2")).toHaveAttribute("aria-pressed", "false");
    });

    it("全解除すると次へ進めず、全選択で戻る", async () => {
        const { server, user } = await openClips({
            "POST /api/clips/select-all": { status: 200 },
        });
        await user.click(screen.getByRole("button", { name: "全解除" }));
        expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(3);
        expect(screen.getByRole("button", { name: "次へ" })).toBeDisabled();
        expect(screen.getByText("1 件以上選んでください")).toBeInTheDocument();
        expect(server.calls.at(-1)).toEqual({ method: "POST", path: "/api/clips/select-all", body: { selected: false } });

        // 保存が終わるまでは全選択・全解除を押せない
        const selectAll = screen.getByRole("button", { name: "全選択" });
        await waitFor(() => expect(selectAll).toBeEnabled());
        await user.click(selectAll);
        expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(3);
        expect(screen.getByRole("button", { name: "次へ" })).toBeEnabled();
    });

    it("ユーザーで絞り込める", async () => {
        const { user } = await openClips();
        const filter = screen.getByRole("radiogroup", { name: "表示するユーザー" });
        expect(within(filter).getAllByRole("radio").map((r) => r.textContent)).toEqual(["全員3", "ユーザー11", "ユーザー21", "ユーザー31"]);

        await user.click(within(filter).getByRole("radio", { name: /^ユーザー2/ }));
        expect(within(filter).getByRole("radio", { name: /^ユーザー2/ })).toHaveAttribute("aria-checked", "true");
        expect(tiles().map((b) => b.getAttribute("aria-label"))).toEqual([
            "ユーザー2・クリップ 1（採用）",
        ]);
        // 表示していない動画の見出しは出さない
        expect(screen.queryByRole("region", { name: "撮影日が未入力" })).not.toBeInTheDocument();

        await user.click(within(filter).getByRole("radio", { name: /^全員/ }));
        expect(tiles()).toHaveLength(3);
    });

    it("絞り込んでいるときの全解除は、そのユーザーだけに効く", async () => {
        const { server, user } = await openClips({ "POST /api/clips/select-all": { status: 200 } });
        await user.click(screen.getByRole("radio", { name: /^ユーザー2/ }));
        await user.click(screen.getByRole("button", { name: "全解除" }));
        expect(server.calls.at(-1)).toEqual({ method: "POST", path: "/api/clips/select-all", body: { selected: false, panel: 2, only: false } });

        await user.click(screen.getByRole("radio", { name: /^全員/ }));
        expect(tile("ユーザー2・クリップ 1")).toHaveAttribute("aria-pressed", "false");
        // ほかのユーザーはそのまま
        expect(tile("ユーザー1・クリップ 1")).toHaveAttribute("aria-pressed", "true");
    });

    it("「ユーザー3だけ使う」で、そのユーザーを採用し、ほかを除外する", async () => {
        const { server, user } = await openClips({ "POST /api/clips/select-all": { status: 200 } });
        await user.click(screen.getByRole("radio", { name: /^ユーザー3/ }));
        await user.click(screen.getByRole("button", { name: "ユーザー3だけ使う" }));
        expect(server.calls.at(-1)).toEqual({ method: "POST", path: "/api/clips/select-all", body: { selected: true, panel: 3, only: true } });

        await user.click(screen.getByRole("radio", { name: /^全員/ }));
        expect(tile("ユーザー3・クリップ 2")).toHaveAttribute("aria-pressed", "true");
        expect(tile("ユーザー2・クリップ 1")).toHaveAttribute("aria-pressed", "false");
        expect(tile("ユーザー1・クリップ 1")).toHaveAttribute("aria-pressed", "false");
        expect(summary()).toHaveTextContent("1 件を選択");
    });

    it("絞り込んでいないときは「だけ使う」を出さない", async () => {
        await openClips();
        expect(screen.queryByRole("button", { name: /だけ使う/ })).not.toBeInTheDocument();
    });

    it("再生ボタンで、そのパネルだけをその場で再生する", async () => {
        const { user, container } = await openClips();
        await user.click(screen.getByRole("button", { name: "ユーザー2・クリップ 1を再生" }));

        const dialog = screen.getByRole("dialog", { name: "ユーザー2・クリップ 1の再生" });
        const video = container.ownerDocument.querySelector("video");
        expect(dialog).toContainElement(video);
        expect(video).toHaveAttribute("src", "/media/clips/sep/001-2");
        // iPhone で全画面にしない
        expect(video).toHaveAttribute("playsinline");
        await user.click(within(dialog).getByRole("button", { name: "閉じる" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        // 再生しても選択は変わらない
        expect(tile("ユーザー2・クリップ 1")).toBeInTheDocument();
    });

    it("長押しで再生し、そのタップでは選択を切り替えない", async () => {
        const { server } = await openClips();
        vi.useFakeTimers();
        try {
            const target = tile("ユーザー2・クリップ 1");
            fireEvent.pointerDown(target, { clientX: 10, clientY: 10 });
            act(() => vi.advanceTimersByTime(600));
            fireEvent.pointerUp(target);
            fireEvent.click(target);
        } finally {
            vi.useRealTimers();
        }
        expect(screen.getByRole("dialog", { name: "ユーザー2・クリップ 1の再生" })).toBeInTheDocument();
        expect(tile("ユーザー2・クリップ 1")).toHaveAttribute("aria-pressed", "true");
        expect(server.calls.some((c) => c.method === "PATCH")).toBe(false);
    });

    it("指を動かしたらスクロールとみなし、長押しにしない", async () => {
        await openClips();
        vi.useFakeTimers();
        try {
            const target = tile("ユーザー2・クリップ 1");
            fireEvent.pointerDown(target, { clientX: 10, clientY: 10 });
            fireEvent.pointerMove(target, { clientX: 10, clientY: 60 });
            act(() => vi.advanceTimersByTime(600));
        } finally {
            vi.useRealTimers();
        }
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("次へで速度の画面へ進む", async () => {
        const { user } = await openClips();
        await user.click(screen.getByRole("button", { name: "次へ" }));
        expect(await screen.findByRole("heading", { name: "速度を選ぶ" })).toBeInTheDocument();
    });

    it("読み込めなければ、もう一度読み込める", async () => {
        let fail = true;
        fakeServer({
            ...loggedIn,
            "GET /api/clips": () => (fail ? { status: 500, body: { detail: "読み込めませんでした" } } : { status: 200, body: sampleClips }),
        });
        const { user } = renderApp("/");
        expect(await screen.findByRole("alert")).toHaveTextContent("読み込めませんでした");
        fail = false;
        await user.click(screen.getByRole("button", { name: "もう一度読み込む" }));
        await waitFor(() => expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(2));
    });

    it("途中でログインが切れたら、パスワード画面へ移る", async () => {
        const { user } = await openClips({ "PATCH /api/clips/sep/001-2": { status: 401, body: { detail: "ログインしてください" } } });
        await user.click(tile("ユーザー2・クリップ 1"));
        expect(await screen.findByRole("heading", { name: "パスワードを入力" })).toBeInTheDocument();
    });

    it("存在しないパネルの 404 では、QR コードの案内に切り替えない", async () => {
        const { user } = await openClips({ "PATCH /api/clips/sep/001-2": { status: 404, body: { detail: "パネルがありません" } } });
        await user.click(tile("ユーザー2・クリップ 1"));
        expect(await screen.findByRole("alert")).toHaveTextContent("パネルがありません");
        expect(screen.getByRole("heading", { name: "使うクリップを選ぶ" })).toBeInTheDocument();
    });

    it("パネルが 1 件も無ければ、動画を取り込む画面へ移る", async () => {
        fakeServer({ ...loggedIn, "GET /api/clips": { status: 200, body: [] } });
        renderApp("/");
        expect(await screen.findByRole("heading", { name: "動画を取り込む" })).toBeInTheDocument();
    });
});
