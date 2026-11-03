import { ButtonLink } from "@/components/ui/Button";
import { ErrorPage } from "@/components/ui/ErrorPage";

// 存在しない URL。AppLayout の中に、テンプレートの ErrorPage で表示する。
export default function NotFoundPage() {
    return (
        <ErrorPage
            status={404}
            title="ページが見つかりません"
            description="お探しのページは存在しないか、移動した可能性があります。"
            actions={<ButtonLink to="/">クリップ選択へ戻る</ButtonLink>}
        />
    );
}
