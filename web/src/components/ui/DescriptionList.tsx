import { createContext, useContext, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

// DADS 説明リスト（https://design.digital.go.jp/dads/components/description-list/、HTML 版 description-list.css）。
// 「名前」と「値」のペアが繰り返される情報（申請内容の確認、プロフィール、設定項目）に使う。
// 比較が必要ならテーブル、項目の列挙だけなら箇条書きリストを使う。
// <dl> を grid にし、dt は太字、dd はモバイルで左 32px のインデント、md 以上は dt 1 : dd 2 の横並びにする。

const DividedContext = createContext(false);

export type DescriptionListItem = {
    term: ReactNode;
    description: ReactNode;
};

export type DescriptionListProps = Omit<HTMLAttributes<HTMLDListElement>, "children"> & {
    /** 項目の配列。children（DescriptionItem）でも書ける。 */
    items?: DescriptionListItem[];
    children?: ReactNode;
    /** md 以上での列数。設定画面など項目が多いときに 2 列にする。 */
    columns?: 1 | 2;
    /** 項目の間に罫線を引く。 */
    divided?: boolean;
};

export function DescriptionList({ items, children, columns = 1, divided = false, className, ...props }: DescriptionListProps) {
    return (
        <DividedContext.Provider value={divided}>
            <dl
                className={cn(
                    "m-0 grid break-words text-16 leading-170 tracking-2 text-text",
                    divided ? "gap-y-0" : "gap-y-4",
                    columns === 2 && "md:grid-cols-2 md:gap-x-8",
                    className,
                )}
                {...props}
            >
                {items?.map((item, i) => (
                    <DescriptionItem key={i} term={item.term}>
                        {item.description}
                    </DescriptionItem>
                ))}
                {children}
            </dl>
        </DividedContext.Provider>
    );
}

export type DescriptionItemProps = {
    term: ReactNode;
    children: ReactNode;
    className?: string;
};

/** 名前（dt）と値（dd）の 1 組。dl の中で div で包むのは HTML の仕様上認められている。 */
export function DescriptionItem({ term, children, className }: DescriptionItemProps) {
    const divided = useContext(DividedContext);
    return (
        <div className={cn("grid gap-y-1 md:grid-cols-3 md:gap-x-4", divided && "border-b border-border py-4", className)}>
            <dt className="font-bold">{term}</dt>
            <dd className="m-0 ml-8 md:col-span-2 md:ml-0">{children}</dd>
        </div>
    );
}
