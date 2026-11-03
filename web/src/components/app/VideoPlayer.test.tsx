import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import VideoPlayer from "./VideoPlayer";

describe("VideoPlayer", () => {
    it("読み込めなければ理由を出し、もう一度読み込むとvideoを作り直す", async () => {
        const { container } = render(<VideoPlayer src="/media/preview" aria-label="動画" />);
        const first = container.querySelector("video")!;
        fireEvent.error(first);
        expect(screen.getByRole("alert")).toHaveTextContent("動画を読み込めませんでした");
        await userEvent.click(screen.getByRole("button", { name: "もう一度読み込む" }));
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(container.querySelector("video")).not.toBe(first);
    });
});
