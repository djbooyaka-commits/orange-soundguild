import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Generic ad slot. Loads the script body from site_content
 * (key = contentKey) so admins can update it live. When unset
 * or empty, the slot renders nothing.
 */
export function AdSlotScript({
  contentKey,
  className = "",
}: {
  contentKey: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    let injected: HTMLScriptElement | null = null;
    let cancelled = false;

    (async () => {
      let code = "";
      try {
        const { data } = await supabase
          .from("site_content")
          .select("value")
          .eq("key", contentKey)
          .maybeSingle();
        const v = (data?.value ?? null) as { code?: string } | string | null;
        code = typeof v === "string" ? v : (v?.code ?? "");
      } catch {
        /* no ad */
      }
      if (cancelled || !ref.current || !code.trim()) return;
      const script = document.createElement("script");
      script.text = code;
      container.appendChild(script);
      injected = script;
    })();

    return () => {
      cancelled = true;
      if (injected && injected.parentNode) {
        try {
          injected.parentNode.removeChild(injected);
        } catch {
          /* ignore */
        }
      }
    };
  }, [contentKey]);

  return (
    <aside
      aria-label="Advertisement"
      className={`overflow-hidden rounded-xl border border-border bg-card p-4 ${className}`}
    >
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Advertisement
      </div>
      <div ref={ref} className="min-h-[90px]" />
    </aside>
  );
}
