import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { CommentView } from "../lib/types";
import { timeAgo } from "../lib/utils";
import { Button, ErrorBox } from "./ui";

export function Comments({ kind, slug }: { kind: "lesson" | "problem"; slug: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["comments", kind, slug];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<CommentView[]>(`/comments?kind=${kind}&slug=${encodeURIComponent(slug)}`), staleTime: 30_000 });
  const create = useMutation({
    mutationFn: (input: { body: string; parent_id?: string }) => api.post("/comments", { target_kind: kind, target_slug: slug, ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/comments/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: key }) });
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const comments = q.data ?? [];

  return (
    <section className="mt-12" data-testid="comments">
      <h2 className="mb-3 text-lg font-semibold">Discussion {comments.length > 0 && <span className="text-sm font-normal text-muted">({comments.length})</span>}</h2>
      {user ? (
        <form
          className="mb-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!body.trim()) return;
            create.mutate({ body }, { onSuccess: () => setBody("") });
          }}
        >
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Ask a question, share an insight, or point out a mistake." className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
          {create.error ? <ErrorBox error={create.error} className="mt-2" /> : null}
          <Button type="submit" className="mt-2" disabled={create.isPending || !body.trim()}>
            Post
          </Button>
        </form>
      ) : (
        <p className="mb-6 text-sm text-muted">
          <Link to="/login" className="text-accent">
            Sign in
          </Link>{" "}
          to join the discussion.
        </p>
      )}
      <ul className="space-y-4">
        {comments.map((c) => (
          <li key={c.id} className="rounded-xl border border-line bg-elev p-3">
            <CommentBody c={c} canDelete={!!user && (user.id === c.author_id || user.role === "admin")} onDelete={() => remove.mutate(c.id)} />
            {c.replies.length > 0 && (
              <ul className="mt-3 space-y-3 border-l border-line pl-3">
                {c.replies.map((r) => (
                  <li key={r.id}>
                    <CommentBody c={r} canDelete={!!user && (user.id === r.author_id || user.role === "admin")} onDelete={() => remove.mutate(r.id)} />
                  </li>
                ))}
              </ul>
            )}
            {user && !c.deleted && (
              <div className="mt-2">
                {replyTo === c.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      create.mutate({ body: reply, parent_id: c.id }, {
                        onSuccess: () => {
                          setReply("");
                          setReplyTo(null);
                        },
                      });
                    }}
                    className="flex gap-2"
                  >
                    <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply…" className="flex-1 rounded-lg border border-line bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent" />
                    <Button type="submit" disabled={!reply.trim()}>
                      Reply
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setReplyTo(null)}>
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <button className="text-xs text-muted hover:text-fg" onClick={() => setReplyTo(c.id)}>
                    Reply
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CommentBody({ c, canDelete, onDelete }: { c: CommentView; canDelete: boolean; onDelete: () => void }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="font-medium text-fg">{c.author_name}</span>
        <span>{timeAgo(c.created_at)}</span>
        {canDelete && !c.deleted && (
          <button onClick={onDelete} className="ml-auto rounded p-1 hover:text-danger" aria-label="Delete comment">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <p className={c.deleted ? "mt-1 text-sm italic text-muted" : "mt-1 whitespace-pre-wrap text-sm"}>{c.deleted ? "[deleted]" : c.body}</p>
    </div>
  );
}
