import { BrowserRouter, Route, Routes } from "react-router";
import AppLayout from "@/layouts/AppLayout";
import ErrorBoundary from "@/components/app/ErrorBoundary";
import ClipsPage from "@/pages/ClipsPage";
import LoginPage from "@/pages/LoginPage";
import NotFoundPage from "@/pages/NotFoundPage";
import PreferencesPage from "@/pages/PreferencesPage";
import PreviewPage from "@/pages/PreviewPage";
import SettingsPage from "@/pages/SettingsPage";
import VideosPage from "@/pages/VideosPage";
import RequireSession from "@/session/RequireSession";
import { SessionProvider } from "@/session/Session";
import { ThemePreferenceProvider } from "@/context/ThemePreference";

// 画面の URL。手順の 4 画面（/videos・/・/settings・/preview）は app.config.ts の steps と合わせる。
// ログインの状態は SessionProvider がアプリを開いたときに一度確かめる。
export default function App() {
    return (
        <ErrorBoundary>
            <ThemePreferenceProvider>
                <BrowserRouter>
                    <SessionProvider>
                        <Routes>
                            <Route element={<AppLayout />}>
                                <Route path="/login" element={<LoginPage />} />
                                {/* 手順の画面はログインしてから */}
                                <Route element={<RequireSession />}>
                                    <Route path="/videos" element={<VideosPage />} />
                                    <Route path="/" element={<ClipsPage />} />
                                    <Route path="/settings" element={<SettingsPage />} />
                                    <Route path="/preview" element={<PreviewPage />} />
                                    <Route path="/preferences" element={<PreferencesPage />} />
                                </Route>
                                <Route path="*" element={<NotFoundPage />} />
                            </Route>
                        </Routes>
                    </SessionProvider>
                </BrowserRouter>
            </ThemePreferenceProvider>
        </ErrorBoundary>
    );
}
