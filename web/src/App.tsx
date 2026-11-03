import { BrowserRouter, Route, Routes } from "react-router";
import AppLayout from "@/components/AppLayout";
import ClipsPage from "@/pages/ClipsPage";
import LoginPage from "@/pages/LoginPage";
import NotFoundPage from "@/pages/NotFoundPage";
import PreviewPage from "@/pages/PreviewPage";
import SettingsPage from "@/pages/SettingsPage";

// 画面の URL。手順の 3 画面（/・/settings・/preview）は app.config.ts の steps と合わせる。
export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route element={<AppLayout />}>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/" element={<ClipsPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/preview" element={<PreviewPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}
