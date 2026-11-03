import { expectNoA11yViolations } from "@/test/axe";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job, Project, Video } from "@/api/types";
import { fakeServer, loggedIn, sampleProject } from "@/test/fakeServer";
import { renderApp } from "@/test/renderApp";
import { polling } from "./preview/useJob";

/**
 * XMLHttpRequest の代わり。送った量を半分と知らせてから、決めた応答を返す。
 * manual なら、テストが finish() を呼ぶまで応答しない（途中の表示を確かめるため）。
 */
function fakeUpload(status: number, body: unknown, { manual = false } = {}) {
    const sent: { headers: Record<string, string>; file: File | null; finish: () => void } = {
        headers: {},
        file: null,
        finish: () => {},
    };
    class FakeXHR {
        upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        status = 0;
        responseText = "";
        open() {}
        setRequestHeader(name: string, value: string) {
            sent.headers[name] = value;
        }
        send(file: File) {
            sent.file = file;
            setTimeout(() => this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 }), 5);
            sent.finish = () => {
                this.status = status;
                this.responseText = JSON.stringify(body);
                this.onload?.();
            };
            if (!manual) setTimeout(sent.finish, 30);
        }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
    return sent;
}

const newVideo: Video = { name: "nov", created_at: "2026-11-01T03:00:00+00:00", metadata_date: "2026-11-01", date: null, panel_count: 5 };
const analyzeJob = (status: Job["status"], extra: Partial<Job> = {}): Job => ({
    id: "analyze-1", kind: "analyze", status, progress: status === "done" ? 1 : 0, error: null, url: null, result: null, ...extra,
});

beforeEach(() => {
    polling.intervalMs = 5;
});
afterEach(() => {
    polling.intervalMs = 700;
});

async function openVideos(routes: Parameters<typeof fakeServer>[0] = {}) {
    const server = fakeServer({ ...loggedIn, ...routes });
    const app = renderApp("/videos");
    await screen.findByRole("heading", { name: "動画を取り込む" });
    // 見出しは読み込み中から出るので、一覧が出るまで待つ
    await screen.findByRole("button", { name: "次へ" });
    return { server, ...app };
}

function chooseFile(name = "11月.mov") {
    const file = new File(["video"], name, { type: "video/quicktime" });
    fireEvent.change(screen.getByLabelText("動画ファイル"), { target: { files: [file] } });
    return file;
}

describe("動画を取り込む画面", () => {
    it("取り込んだ動画と撮影日を並べ、未入力の動画は知らせる", async () => {
        await openVideos();
        const list = screen.getByRole("region", { name: "取り込んだ動画" });
        expect(within(list).getByLabelText("sepの撮影日")).toHaveValue("2026-09-20");
        const oct = within(list).getByLabelText("octの撮影日").closest("li")!;
        expect(oct).toHaveTextContent("撮影日が未入力");
        // 入力していない動画は、メタデータの日付があれば初期値にする（oct には無い）
        expect(within(oct).getByLabelText("octの撮影日")).toHaveValue("");
        expect(within(list).getByLabelText("sepの撮影日").closest("li")).not.toHaveTextContent("撮影日が未入力");
    });

    it("アップロードして解析し、メタデータの日付を初期値に撮影日を入力する", async () => {
        const updated: Project = { ...sampleProject, videos: [...sampleProject.videos, { ...newVideo, date: "2026-10-31" }] };
        let finished = false;
        const { server, user } = await openVideos({
            "GET /api/jobs/analyze-1": () => ({ status: 200, body: finished ? analyzeJob("done", { result: newVideo }) : analyzeJob("running") }),
            "PATCH /api/videos/nov": { status: 200, body: { ...newVideo, date: "2026-10-31" } },
        });
        const sent = fakeUpload(202, analyzeJob("queued"), { manual: true });
        const file = chooseFile();

        expect(await screen.findByRole("progressbar", { name: "アップロードしています" })).toBeInTheDocument();
        expect(await screen.findByText("50%")).toBeInTheDocument();
        // 送り終えたことにして、解析の表示へ進める
        act(() => sent.finish());
        expect(await screen.findByRole("progressbar", { name: "動画を読み取っています" })).toBeInTheDocument();
        expect(sent.file).toBe(file);
        expect(sent.headers["X-File-Name"]).toBe(encodeURIComponent("11月.mov"));
        finished = true;

        const date = await screen.findByLabelText("この動画を撮影した日");
        expect(date).toHaveValue("2026-11-01");
        expect(screen.getByText(/動画の情報から 2026年11月1日/)).toBeInTheDocument();

        server.calls.length = 0;
        fakeServer({ ...loggedIn, "GET /api/project": { status: 200, body: updated }, "PATCH /api/videos/nov": { status: 200, body: { ...newVideo, date: "2026-10-31" } } });
        fireEvent.change(date, { target: { value: "2026-10-31" } });
        await user.click(screen.getByRole("button", { name: "この日付にする" }));

        await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2026年10月31日(土)にしました"));
        await waitFor(() => expect(screen.getByLabelText("novの撮影日")).toHaveValue("2026-10-31"));
        expect(screen.queryByLabelText("この動画を撮影した日")).not.toBeInTheDocument();
    });

    it("受け取れない動画は、サーバーの理由を表示して選び直せる", async () => {
        await openVideos();
        fakeUpload(415, { detail: "MP4 か MOV の動画を選んでください" });
        chooseFile("photo.jpg");
        expect(await screen.findByRole("alert")).toHaveTextContent("MP4 か MOV の動画を選んでください");
        expect(screen.getByRole("button", { name: "別の動画を選ぶ" })).toBeInTheDocument();
    });

    it("Setlog の動画として読めなければ、その理由を表示する", async () => {
        await openVideos({
            "GET /api/jobs/analyze-1": { status: 200, body: analyzeJob("failed", { error: "Setlog の書き出し動画として読み取れませんでした" }) },
        });
        fakeUpload(202, analyzeJob("queued"));
        chooseFile();
        expect(await screen.findByRole("alert")).toHaveTextContent("Setlog の書き出し動画として読み取れませんでした");
    });

    it("送っている途中で Mac につながらなくなったら、その案内に切り替える", async () => {
        await openVideos();
        class OfflineXHR {
            upload = { onprogress: null };
            onerror: (() => void) | null = null;
            open() {}
            setRequestHeader() {}
            send() {
                setTimeout(() => this.onerror?.(), 5);
            }
        }
        vi.stubGlobal("XMLHttpRequest", OfflineXHR);
        chooseFile();
        expect(await screen.findByRole("heading", { name: "Mac につながりません" })).toBeInTheDocument();
    });

    it("アクセシビリティ違反がない（撮影日の入力を含む）", async () => {
        const { container } = await openVideos({ "GET /api/jobs/analyze-1": { status: 200, body: analyzeJob("done", { result: newVideo }) } });
        await expectNoA11yViolations(container);
        fakeUpload(202, analyzeJob("queued"));
        chooseFile();
        await screen.findByLabelText("この動画を撮影した日");
        await expectNoA11yViolations(container);
    });

    it("一覧から撮影日を直せる", async () => {
        const { server } = await openVideos({ "PATCH /api/videos/oct": { status: 200, body: { ...newVideo, name: "oct", date: "2026-10-10" } } });
        fireEvent.change(screen.getByLabelText("octの撮影日"), { target: { value: "2026-10-10" } });
        await waitFor(() =>
            expect(server.calls).toContainEqual({ method: "PATCH", path: "/api/videos/oct", body: { date: "2026-10-10" } }),
        );
    });

    it("パネルが無ければ次へ進めず、あれば選ぶ画面へ進む", async () => {
        const { user } = await openVideos();
        await user.click(screen.getByRole("button", { name: "次へ" }));
        expect(await screen.findByRole("heading", { name: "使うクリップを選ぶ" })).toBeInTheDocument();
    });

    it("動画が無いときは次へを押せない", async () => {
        await openVideos({ "GET /api/project": { status: 200, body: { ...sampleProject, videos: [], total_count: 0, selected_count: 0 } } });
        expect(screen.getByRole("button", { name: "次へ" })).toBeDisabled();
        expect(screen.getByText("まだありません")).toBeInTheDocument();
        expect(screen.getByText("動画を 1 本以上取り込んでください")).toBeInTheDocument();
    });
});
