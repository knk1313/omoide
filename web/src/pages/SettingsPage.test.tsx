import { expectNoA11yViolations } from "@/test/axe";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Project } from "@/api/types";
import { fakeServer, loggedIn, sampleProject } from "@/test/fakeServer";
import { currentStep, renderApp } from "@/test/renderApp";

async function openSettings(routes: Parameters<typeof fakeServer>[0] = {}) {
    const server = fakeServer({ ...loggedIn, ...routes });
    const app = renderApp("/settings");
    await screen.findByRole("group", { name: "全体の再生速度" });
    return { server, ...app };
}

const radio = (name: RegExp) => screen.getByRole("radio", { name });
const summary = () => screen.getByText("できあがりの長さ").parentElement!;

describe("出力設定画面", () => {
    it("採用数と、選んでいる速度での長さを表示する", async () => {
        await openSettings();
        expect(screen.getByText("採用したクリップ").parentElement).toHaveTextContent("2 件");
        expect(summary()).toHaveTextContent("約 4秒");
        expect(radio(/^1x/)).toBeChecked();
    });

    it("選択肢ごとに、その速度にしたときの長さを示す", async () => {
        await openSettings();
        expect(radio(/^0.5x/)).toHaveAccessibleName(/8秒/);
        expect(radio(/^1x/)).toHaveAccessibleName(/4秒/);
        expect(radio(/^1.5x/)).toHaveAccessibleName(/3秒/);
        expect(radio(/^2x/)).toHaveAccessibleName(/2秒/);
    });

    it("速度を選ぶと保存し、長さを更新する", async () => {
        const saved: Project = { ...sampleProject, speed: 2, estimated_seconds: 2 };
        const { server, user } = await openSettings({ "PATCH /api/settings": { status: 200, body: saved } });
        await user.click(radio(/^2x/));

        expect(radio(/^2x/)).toBeChecked();
        expect(radio(/^1x/)).not.toBeChecked();
        expect(summary()).toHaveTextContent("約 2秒");
        expect(server.calls.at(-1)).toEqual({ method: "PATCH", path: "/api/settings", body: { speed: 2 } });
    });

    it("保存に失敗したら元の速度に戻して知らせる", async () => {
        const { user } = await openSettings({ "PATCH /api/settings": { status: 500, body: { detail: "保存できませんでした" } } });
        await user.click(radio(/^0.5x/));
        expect(await screen.findByRole("alert")).toHaveTextContent("保存できませんでした");
        expect(radio(/^1x/)).toBeChecked();
        expect(summary()).toHaveTextContent("約 4秒");
    });

    it("プレビューを生成すると、生成を始めてプレビュー画面へ進む", async () => {
        const { server, user } = await openSettings();
        await user.click(screen.getByRole("button", { name: "プレビューを生成" }));
        expect(await screen.findByRole("heading", { name: "プレビューを確認" })).toBeInTheDocument();
        expect(server.calls.some((c) => c.method === "POST" && c.path === "/api/preview")).toBe(true);
        expect(window.history.state?.usr).toEqual({ jobId: "job-1" });
    });

    it("生成を始められないときは、サーバーの理由を表示してこの画面に残る", async () => {
        const { user } = await openSettings({
            "POST /api/preview": { status: 507, body: { detail: "Mac の空き容量が足りません。不要なファイルを削除してから、もう一度お試しください" } },
        });
        await user.click(screen.getByRole("button", { name: "プレビューを生成" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("空き容量が足りません");
        expect(screen.getByRole("heading", { name: "速度を選ぶ" })).toBeInTheDocument();
    });

    it("1 件も選んでいなければ生成できず、選び直すよう案内する", async () => {
        await openSettings({ "GET /api/project": { status: 200, body: { ...sampleProject, selected_count: 0, estimated_seconds: 0 } } });
        expect(screen.getByRole("button", { name: "プレビューを生成" })).toBeDisabled();
        expect(screen.getByRole("alert")).toHaveTextContent("クリップ選択に戻って選んでください");
    });

    it("アクセシビリティ違反がない", async () => {
        const { container } = await openSettings();
        await expectNoA11yViolations(container);
    });

    it("クリップ選択に戻れる", async () => {
        const { user } = await openSettings();
        await user.click(screen.getByRole("button", { name: "クリップ選択" }));
        expect(await screen.findByRole("heading", { name: "使うクリップを選ぶ" })).toBeInTheDocument();
    });

    it("手順の表示は 3 番目", async () => {
        await openSettings();
        expect(currentStep()).toHaveTextContent(/ステップ 3 \/ 4、現在のステップ.*速度/);
    });
});
