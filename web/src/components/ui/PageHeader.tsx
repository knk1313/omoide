import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Breadcrumb, type BreadcrumbItem } from "./Breadcrumb";

// ページ見出し領域。パンくず → h1（+ 説明・メタ情報）→ 右側の操作、の順に置く。
// DADS の規定どおり、パンくずはヘッダーとページ見出しの間に置き、h1 はページの主題（title 相当）にする。
// h1 は 28px 太字（モバイルは 24px）。操作（ボタン）は md 以上で右に並び、モバイルでは下に回り込む。

export type PageHeaderProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
    title: ReactNode;
    /** タイトル下の補足説明。 */
    description?: ReactNode;
    breadcrumbs?: readonly BreadcrumbItem[];
    /** 右側に置く操作（新規作成ボタンなど）。 */
    actions?: ReactNode;
    /** 更新日時・件数などのメタ情報。 */
    meta?: ReactNode;
    /** パンくずの nav の aria-label（同じページにパンくずが複数あるときに区別する）。 */
    breadcrumbLabel?: string;
};

export function PageHeader({ title, description, breadcrumbs, actions, meta, breadcrumbLabel, className, ...props }: PageHeaderProps) {
    return (
        <div className={cn("flex min-w-0 flex-col gap-4", className)} {...props}>
            {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumb items={breadcrumbs} label={breadcrumbLabel} collapseOnMobile />}
            <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 flex-col gap-1 break-words">
                    <h1 className="m-0 text-std-24B-150 text-text-strong md:text-std-28B-150">{title}</h1>
                    {description && <p className="m-0 text-std-16N-170 text-text-muted">{description}</p>}
                    {meta && <div className="text-16 text-text-subtle">{meta}</div>}
                </div>
                {actions && <div className="flex shrink-0 flex-wrap items-center gap-4">{actions}</div>}
            </div>
        </div>
    );
}
