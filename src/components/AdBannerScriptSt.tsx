import { useEffect, useRef } from "react";
import { AD_SCRIPT_ST as AD_SCRIPT } from "./adScriptSt";


/**
 * Ad slot for the S.T. Rooms page. Uses a real <script> element so the
 * third-party loader actually executes (innerHTML scripts don't run).
 */
export function AdBannerScriptSt({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const script = document.createElement("script");
    script.text = AD_SCRIPT;
    container.appendChild(script);
    return () => {
      try {
        container.removeChild(script);
      } catch {
        /* ignore */
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
