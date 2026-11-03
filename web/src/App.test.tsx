import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeServer, loggedIn } from "@/test/fakeServer";
import { renderApp } from "@/test/renderApp";

describe("画面の骨組み", () => {
    beforeEach(() => {
        fakeServer(loggedIn);
    });

    it("クリップ選択から速度、プレビューへ順に進める", async () => {
        const { user } = renderApp("/");
        expect(await screen.findByRole("heading", { name: "使うクリップを選ぶ" })).toBeInTheDocument();
        expect(screen.getByText("2. 選ぶ")).toHaveAttribute("aria-current", "step");

        await user.click(screen.getByRole("button", { name: "次へ" }));
        // 速度の画面は、要約を読み込んでから見出しを出すので、待つ
        expect(await screen.findByRole("heading", { name: "速度を選ぶ" })).toBeInTheDocument();
        expect(screen.getByText("3. 速度")).toHaveAttribute("aria-current", "step");

        await user.click(await screen.findByRole("button", { name: "プレビューを生成" }));
        // 生成を頼んだ応答の後で移るので、待つ
        expect(await screen.findByRole("heading", { name: "プレビューを確認" })).toBeInTheDocument();
        expect(screen.getByText("4. 確認")).toHaveAttribute("aria-current", "step");

        await user.click(screen.getByRole("button", { name: "速度を変える" }));
        expect(await screen.findByRole("heading", { name: "速度を選ぶ" })).toBeInTheDocument();
    });

    it("ログイン画面には手順を表示しない", async () => {
        fakeServer({ "GET /api/health": { status: 401 } });
        renderApp("/login");
        expect(await screen.findByRole("heading", { name: "パスワードを入力" })).toBeInTheDocument();
        expect(screen.queryByRole("list", { name: "手順" })).not.toBeInTheDocument();
    });

    it("存在しない URL は 404 を表示し、クリップ選択へ戻れる", async () => {
        const { user } = renderApp("/nope");
        expect(screen.getByText("ページが見つかりません")).toBeInTheDocument();
        await user.click(screen.getByRole("link", { name: "クリップ選択へ戻る" }));
        expect(await screen.findByRole("heading", { name: "使うクリップを選ぶ" })).toBeInTheDocument();
    });

    it("管理画面のテンプレートの要素は残っていない", async () => {
        renderApp("/");
        await screen.findByRole("heading", { name: "使うクリップを選ぶ" });
        for (const name of ["ダッシュボード", "ドキュメント", "Sample Workspace"]) {
            expect(screen.queryByText(name)).not.toBeInTheDocument();
        }
    });
});
