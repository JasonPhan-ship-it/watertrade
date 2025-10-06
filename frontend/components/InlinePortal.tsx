"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  targetId: string; // e.g. "inline-buy-now"
  children: ReactNode;
};

/**
 * Renders children into an existing DOM node (by id) using a portal.
 * Waits for the node to appear after hydration.
 */
export default function InlinePortal({ targetId, children }: Props) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // Try immediately
    let el = document.getElementById(targetId);
    if (el) {
      setTarget(el);
      return;
    }

    // Observe DOM until the target appears
    const observer = new MutationObserver(() => {
      el = document.getElementById(targetId);
      if (el) {
        setTarget(el);
        observer.disconnect();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Safety timeout to stop observing after ~2s
    const timer = setTimeout(() => observer.disconnect(), 2000);

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [targetId]);

  if (!target) return null;
  return createPortal(children, target);
}
