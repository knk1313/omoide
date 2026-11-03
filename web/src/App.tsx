import { BrowserRouter, Route, Routes } from "react-router";
import AppLayout from "@/components/AppLayout";
import ClipsPage from "@/pages/ClipsPage";
import LoginPage from "@/pages/LoginPage";
import NotFoundPage from "@/pages/NotFoundPage";
import PreviewPage from "@/pages/PreviewPage";
import SettingsPage from "@/pages/SettingsPage";
import RequireSession from "@/session/RequireSession";
import { SessionProvider } from "@/session/Session";

// 画面の URL。手順の 3 画面（/・/settings・/preview）は app.config.ts の steps と合わせる。
// ログインの状態は SessionProvider がアプリを開いたときに一度確かめる。
export default function App() {
    return (
        <BrowserRouter>
            <SessionProvider>
                <Routes>
                    <Route element={<AppLayout />}>
                        <Route path="/login" element={<LoginPage />} />
                        {/* 手順の画面はログインしてから */}
                        <Route element={<RequireSession />}>
                            <Route path="/" element={<ClipsPage />} />
                            <Route path="/settings" element={<SettingsPage />} />
                            <Route path="/preview" element={<PreviewPage />} />
                        </Route>
                        <Route path="*" element={<NotFoundPage />} />
                    </Route>
                </Routes>
            </SessionProvider>
        </BrowserRouter>
    );
}
