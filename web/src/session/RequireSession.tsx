import { Navigate, Outlet, useLocation } from "react-router";
import { Loading } from "@/components/app/PageStatus";
import { useSession } from "./Session";
import ShareProblem, { isShareProblem } from "./ShareProblem";

// ログインしていないと進めない画面の入口。ログインが要ればパスワード画面へ移し、ログイン後に元の画面へ戻す。
export default function RequireSession() {
    const { status } = useSession();
    const location = useLocation();

    if (status === "checking") {
        return <Loading label="確認しています" />;
    }
    if (status === "login") {
        return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }
    if (isShareProblem(status)) {
        return <ShareProblem status={status} />;
    }
    return <Outlet />;
}
