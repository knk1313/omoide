import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ButtonLink } from "./Button";

// エラー画面の本文（404 / 500 など）。レイアウトの <main> の中に置くので <section aria-labelledby> で描画する。
// ステータス番号は装飾的に大きく、見出し（h1）で何が起きたかを伝え、次の行動（既定は「ホームへ戻る」）を示す。

export type ErrorPageProps = {
    /** HTTP ステータス（404 / 500 など）。表示しない場合は省略。 */
    status?: number;
    title: ReactNode;
    description?: ReactNode;
    /** 次の行動。省略時は「ホームへ戻る」（/ へのリンク）。 */
    actions?: ReactNode;
    className?: string;
};

export function ErrorPage({ status, title, description, actions, className }: ErrorPageProps) {
    const titleId = useId();
    return (
        <section aria-labelledby={titleId} className={cn("flex flex-col items-center gap-4 px-4 py-16 text-center text-16 leading-170 tracking-2 text-text", className)}>
            {status !== undefined && <p className="nums m-0 text-dsp-48B-140 text-text-subtle">{status}</p>}
            <h1 id={titleId} className="m-0 text-std-28B-150 text-text-strong">
                {title}
            </h1>
            {description && <p className="m-0 max-w-prose text-text-muted">{description}</p>}
            <div className="mt-4 flex w-full max-w-sm flex-col items-stretch gap-2 *:w-full md:w-auto md:max-w-none md:flex-row md:items-center md:gap-4 md:*:w-auto">{actions ?? <ButtonLink to="/">ホームへ戻る</ButtonLink>}</div>
        </section>
    );
}
