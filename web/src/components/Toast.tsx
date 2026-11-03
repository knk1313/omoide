import { useToast as useTemplateToast } from "@/components/ui/Toast";

// 移行中だけ使う、旧 API（toast(message, type)）からテンプレートの Toast への橋渡し。
// 画面をテンプレートの useToast に移し終えたら削除する（docs/migration-decisions.md M-03）。
export function useToast() {
    const { toast } = useTemplateToast();
    return { toast: (message: string, type: "success" | "error" = "success") => toast({ title: message, type }) };
}
