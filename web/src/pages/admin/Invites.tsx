import { useState, type FormEvent } from "react";
import { Button, Card, ErrorBox, PageTitle, Spinner } from "../../components/ui";
import { adminApi, fmtDate, useAdminAction, useAdminInvites } from "../../lib/admin";
import { useFeatures } from "../../lib/queries";
import { cn } from "../../lib/utils";
import { inputClass, Section, Table, Td } from "./common";

export default function Invites() {
  const features = useFeatures();
  const list = useAdminInvites();
  const [uses, setUses] = useState(1);
  const [days, setDays] = useState("");
  const [note, setNote] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const create = useAdminAction(adminApi.createInvite);
  const revoke = useAdminAction(adminApi.revokeInvite);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setCopied(false);
    create.mutate(
      { uses, days: days ? Number(days) : undefined, note },
      {
        onSuccess: (r) => {
          setLink(r.link);
          setNote("");
        },
      },
    );
  };

  return (
    <div>
      <PageTitle
        title="Invites"
        subtitle={
          features.data?.signups === "invite"
            ? "Sign-up is invite-only. Each link creates up to its number of accounts; the link is shown once, because only a hash of it is stored."
            : "Sign-up is open on this deployment, so invites are not needed. You can still make them for when it is invite-only."
        }
      />
      <Card>
        <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">For (a note)</span>
            <input className={cn(inputClass, "w-56")} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Sam, meetup…" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">Sign-ups</span>
            <input className={cn(inputClass, "w-24")} type="number" min={1} max={10000} value={uses} onChange={(e) => setUses(Number(e.target.value) || 1)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">Expires after (days)</span>
            <input className={cn(inputClass, "w-32")} type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} placeholder="never" />
          </label>
          <Button type="submit" disabled={create.isPending}>
            Create invite
          </Button>
        </form>
        {create.error && <ErrorBox error={create.error} className="mt-3" />}
        {link && (
          <div className="mt-4 rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm">
            <p className="text-xs text-muted">Copy it now: it is not shown again.</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="break-all">{link}</code>
              <Button
                variant="secondary"
                className="px-2 py-1 text-xs"
                onClick={async () => {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                }}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        )}
      </Card>
      <Section title="All invites">
        {list.error && <ErrorBox error={list.error} />}
        {revoke.error && <ErrorBox error={revoke.error} className="mb-3" />}
        {!list.data ? (
          <Spinner />
        ) : list.data.length === 0 ? (
          <p className="text-sm text-muted">No invites.</p>
        ) : (
          <Table head={["Id", "For", "Used", "Expires", "Created", ""]}>
            {[...list.data].reverse().map((i) => {
              const expired = i.expires_at != null && new Date(i.expires_at) < new Date();
              const spent = i.uses >= i.max_uses;
              return (
                <tr key={i.id} className={cn((expired || spent) && "text-muted")}>
                  <Td className="font-mono text-xs">{i.id}</Td>
                  <Td>{i.note || <span className="text-muted">—</span>}</Td>
                  <Td className="tabular-nums">
                    {i.uses} / {i.max_uses}
                    {spent && <span className="ml-1 text-xs">(used up)</span>}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {i.expires_at ? fmtDate(i.expires_at) : "never"}
                    {expired && <span className="ml-1 text-xs">(expired)</span>}
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{fmtDate(i.created_at)}</Td>
                  <Td className="text-right">
                    <Button variant="ghost" className="px-2 py-1 text-xs text-danger" disabled={revoke.isPending} onClick={() => confirm(`Revoke invite ${i.id}? Accounts it created stay.`) && revoke.mutate(i.id)}>
                      Revoke
                    </Button>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>
    </div>
  );
}
