import { useState, type HTMLAttributes } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Link } from "./Link";

// DADS パンくずナビゲーション（https://design.digital.go.jp/dads/components/breadcrumb/ / HTML 版 breadcrumb.css）。
//   - <nav aria-label="パンくずリスト"> + <ol>。項目は inline で、幅を超えたら折り返す。
//   - リンクはリンクテキストと同じ装飾。区切りは 12px のシェブロン（装飾）。最後の項目は現在ページ（aria-current="page"）のテキスト。
//   - collapseOnMobile: md 未満では先頭と末尾だけ表示し、中間を「…」ボタンにまとめる（押すと全部表示する）。

export type BreadcrumbItem = {
    label: string;
    /** 省略すると現在ページ（テキスト）として扱う。通常は最後の項目だけ省略する。 */
    href?: string;
};

export type BreadcrumbProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
    items: readonly BreadcrumbItem[];
    collapseOnMobile?: boolean;
    /** nav の aria-label。同じページに複数置くときに区別する。 */
    label?: string;
};

function Separator() {
    return <ChevronRight aria-hidden="true" focusable="false" className="mx-px inline-block size-3 shrink-0 align-middle text-text-strong" />;
}

export function Breadcrumb({ items, collapseOnMobile = false, label = "パンくずリスト", className, ...props }: BreadcrumbProps) {
    const [expanded, setExpanded] = useState(false);
    const collapsible = collapseOnMobile && !expanded && items.length > 2;
    const lastIndex = items.length - 1;

    return (
        <nav aria-label={label} className={cn("text-16 leading-170 tracking-2 text-text", className)} {...props}>
            <ol className="m-0 list-none p-0">
                {items.map((item, i) => {
                    const isLast = i === lastIndex;
                    const isMiddle = i > 0 && !isLast;
                    const current = isLast || !item.href;
                    return (
                        <li key={`${item.label}-${i}`} className={cn("inline break-words", collapsible && isMiddle && "hidden md:inline")}>
                            {/* 省略ボタンは末尾項目の前（中間項目の代わり）に置き、モバイルだけ表示する */}
                            {collapsible && isLast && (
                                <span className="inline md:hidden">
                                    <Separator />
                                    <button
                                        type="button"
                                        aria-label="省略した階層を表示"
                                        onClick={() => setExpanded(true)}
                                        className="rounded-4 px-1 text-text underline decoration-1 underline-offset-3 hover:underline-thick focus-visible:focus-ring-fill"
                                    >
                                        …
                                    </button>
                                </span>
                            )}
                            {i > 0 && <Separator />}
                            {current ? (
                                <span aria-current={isLast ? "page" : undefined}>{item.label}</span>
                            ) : (
                                <Link to={item.href!} className="rounded-4">
                                    {item.label}
                                </Link>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
