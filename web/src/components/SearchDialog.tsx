import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useSearch } from "../lib/queries";
import { cn } from "../lib/utils";

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { data } = useSearch(debounced);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 150);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);
  useEffect(() => setActive(0), [data]);

  if (!open) return null;
  const hits = data ?? [];
  const go = (i: number) => {
    const h = hits[i];
    if (!h) return;
    navigate(h.kind === "lesson" ? `/learn/${h.slug}` : `/practice/${h.slug}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[10vh]" onClick={onClose} role="dialog" aria-modal>
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-elev shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") setActive((a) => Math.min(hits.length - 1, a + 1));
            if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
            if (e.key === "Enter") go(active);
          }}
          placeholder="Search lessons and problems…"
          className="w-full border-b border-line bg-transparent px-4 py-3 text-base outline-none"
        />
        <ul className="max-h-[50vh] overflow-y-auto py-1">
          {hits.length === 0 && debounced.length > 1 && <li className="px-4 py-3 text-sm text-muted">No results.</li>}
          {hits.map((h, i) => (
            <li key={h.kind + h.slug}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => go(i)}
                className={cn("flex w-full flex-col items-start px-4 py-2 text-left", i === active && "bg-elev-2")}
              >
                <span className="text-sm">
                  <span className="mr-2 rounded bg-elev-2 px-1.5 py-0.5 text-[10px] uppercase text-muted">{h.kind}</span>
                  {h.title}
                </span>
                <span className="line-clamp-1 text-xs text-muted">{h.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
