import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_AD_SCRIPT = `(function(gaqqoz){ var d = document, s = d.createElement('script'), l = d.scripts[d.scripts.length - 1]; s.settings = gaqqoz || {}; s.src = "//quarrelsomebitter.com/b.XxVos/dlGMlM0/YWWNcJ/heOmK9NuPZcUllUknP/Tmc/ytMdjfAO0XMQjMk/tiNAzPICyIM_DXQIzvM/wd"; s.async = true; s.referrerPolicy = 'no-referrer-when-downgrade'; l.parentNode.insertBefore(s, l); })({})`;

/**
 * S.T. Rooms ad slot. Loads the script body from site_content
 * (key: "ad_script_st_rooms") so admins can update it live; falls back
 * to the default script if unset.
 */
export function AdBannerScriptSt({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    let injected: HTMLScriptElement | null = null;
    let cancelled = false;

    (async () => {
      let code = DEFAULT_AD_SCRIPT;
      try {
        const { data } = await supabase
          .from("site_content")
          .select("value")
          .eq("key", "ad_script_st_rooms")
          .maybeSingle();
        const v = (data?.value ?? null) as { code?: string } | string | null;
        const stored = typeof v === "string" ? v : v?.code;
        if (stored && stored.trim()) code = stored;
      } catch {
        /* fall back to default */
      }
      if (cancelled || !ref.current) return;
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
  }, []);

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
