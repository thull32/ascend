import { useEffect, useId, useRef, useState } from "react";

let initialised = false;
let counter = 0;

export default function Mermaid({ source }: { source: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useId().replace(/:/g, "");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mermaid = (await import("mermaid")).default;
      if (!initialised) {
        const dark = !document.documentElement.classList.contains("light");
        mermaid.initialize({
          startOnLoad: false,
          theme: dark ? "dark" : "neutral",
          securityLevel: "strict",
          fontFamily: "Inter, system-ui, sans-serif",
          themeVariables: dark ? { primaryColor: "#1a2350", primaryTextColor: "#e6e9f2", lineColor: "#9aa5c4", secondaryColor: "#182042", tertiaryColor: "#111832" } : undefined,
        });
        initialised = true;
      }
      try {
        const { svg } = await mermaid.render(`m${id}${counter++}`, source);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, id]);

  if (error) {
    return (
      <pre className="overflow-x-auto rounded-lg border border-danger/40 p-3 text-xs">
        Diagram failed to render: {error}\n{source}
      </pre>
    );
  }
  return <div ref={ref} className="mermaid-host my-6 flex justify-center overflow-x-auto" />;
}
