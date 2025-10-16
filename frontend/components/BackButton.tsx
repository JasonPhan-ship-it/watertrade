"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { type ButtonHTMLAttributes, type ReactNode } from "react";

type BackButtonProps = {
  /**
   * Optional href to navigate to when there is no history stack (e.g. page opened in new tab).
   * Defaults to the home page.
   */
  fallbackHref?: string;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function BackButton({
  fallbackHref = "/",
  children = "Back",
  className = "",
  ...buttonProps
}: BackButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(fallbackHref);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2 ${className}`}
      {...buttonProps}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      <span>{children}</span>
    </button>
  );
}

export default BackButton;
