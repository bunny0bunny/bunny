"use client";

import { useState } from "react";
import { Check, Copy, Link2, Send, Share2, Twitter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * RTL share entry point (Release E): native share sheet where the platform
 * supports it, otherwise copy-to-clipboard + X/WhatsApp/Telegram intents.
 * URL is computed on interaction only (no hydration surface).
 */
export function ShareButton({ slug, titleAr, compact = false }: { slug: string; titleAr: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  const url = () => `${window.location.origin}/series/${slug}`;
  const text = () => `اقرأ «${titleAr}» على مكتبة بانيورا`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
    } catch {
      // clipboard API can be denied — fall back to the legacy path
      const el = document.createElement("textarea");
      el.value = url();
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const nativeShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: titleAr, text: text(), url: url() });
        return "shared" as const;
      } catch {
        return "cancelled" as const;
      }
    }
    return "unsupported" as const;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-11 shrink-0 gap-2 border-border text-muted-foreground hover:text-foreground ${compact ? "w-11 px-0 lg:w-auto lg:px-4" : ""}`}
          aria-label={`مشاركة «${titleAr}»`}
        >
          <Share2 className="size-4" aria-hidden />
          <span className={compact ? "hidden lg:inline" : ""}>مشاركة</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={async () => {
            const r = await nativeShare();
            if (r === "unsupported") await copy();
          }}
        >
          <Share2 className="size-4 me-2" aria-hidden /> مشاركة عبر النظام
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer" onClick={copy}>
          {copied ? (
            <>
              <Check className="size-4 me-2 text-success" aria-hidden />
              <span className="text-success">تم نسخ الرابط</span>
            </>
          ) : (
            <>
              <Copy className="size-4 me-2" aria-hidden /> نسخ الرابط
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() =>
            window.open(
              `https://twitter.com/intent/tweet?text=${encodeURIComponent(text())}&url=${encodeURIComponent(url())}`,
              "_blank",
              "noopener"
            )
          }
        >
          <Twitter className="size-4 me-2" aria-hidden /> مشاركة على X
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() =>
            window.open(
              `https://wa.me/?text=${encodeURIComponent(`${text()} ${url()}`)}`,
              "_blank",
              "noopener"
            )
          }
        >
          <Link2 className="size-4 me-2" aria-hidden /> واتساب
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() =>
            window.open(
              `https://t.me/share/url?url=${encodeURIComponent(url())}&text=${encodeURIComponent(text())}`,
              "_blank",
              "noopener"
            )
          }
        >
          <Send className="size-4 me-2" aria-hidden /> تيليجرام
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
