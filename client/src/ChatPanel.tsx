import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { QUICK_TALK } from "./game";

interface ChatPanelProps {
  scope: "lounge" | "room";
  roomCode: string | null;
  token: string | null;
  displayName: string;
  under13: boolean;
}

const REPORT_REASONS = [
  "Cussing or insults",
  "Disrespect at the table",
  "Bullying another player",
  "Something else not family-friendly",
];

export function ChatPanel({
  scope,
  roomCode,
  token,
  displayName,
  under13,
}: ChatPanelProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0] as string);
  const [reportDone, setReportDone] = useState(false);

  const messages = useQuery({
    queryKey: ["messages", scope, roomCode],
    queryFn: () => api.listMessages({ scope, roomCode }),
    refetchInterval: 4000,
  });

  const post = useMutation({
    mutationFn: (args: { body: string; quickTalk: boolean }) =>
      api.postMessage({
        token,
        guestName: token ? null : displayName,
        scope,
        roomCode,
        body: args.body,
        quickTalk: args.quickTalk,
      }),
    onSuccess: (res) => {
      if (res.posted) {
        setDraft("");
        setNotice(null);
        void queryClient.invalidateQueries({
          queryKey: ["messages", scope, roomCode],
        });
      } else {
        setNotice(res.notice ?? "Keep it cool — that one can't post.");
      }
    },
    onError: () => setNotice("Chat hiccup — try that again in a second."),
  });

  const report = useMutation({
    mutationFn: () =>
      api.reportPlayer({
        reporterName: displayName,
        targetName: reportTarget ?? "",
        reason: reportReason,
        scope,
      }),
    onSuccess: () => {
      setReportDone(true);
      setReportTarget(null);
    },
  });

  const list = messages.data?.messages ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1" aria-label="Chat messages">
        {messages.isPending && (
          <p className="text-sm text-[var(--dim)]">Loading chat…</p>
        )}
        {list.length === 0 && !messages.isPending && (
          <p className="text-sm text-[var(--dim)]">
            No messages yet. Say hey to the family — keep it cool and it posts
            right away.
          </p>
        )}
        {list.map((m) => (
          <div key={m.id} className="rounded-xl bg-[var(--bg)] px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-bold text-[var(--text)]">
                {m.authorName}
              </span>
              {m.authorName !== displayName && (
                <button
                  type="button"
                  className="shrink-0 text-xs font-semibold text-[#b91c1c] underline"
                  aria-label={`Report ${m.authorName}`}
                  onClick={() => {
                    setReportTarget(m.authorName);
                    setReportDone(false);
                  }}
                >
                  Report
                </button>
              )}
            </div>
            <p className="text-sm text-[var(--text)]">{m.body}</p>
          </div>
        ))}
      </div>

      {reportTarget && (
        <div className="mt-3 rounded-xl border border-[#f5b942] bg-[#fff7e0] p-3">
          <p className="text-sm font-bold text-[#7c2d12]">
            Report {reportTarget}?
          </p>
          <label className="mt-2 block text-xs font-semibold text-[#7c2d12]" htmlFor="report-reason">
            What happened?
          </label>
          <select
            id="report-reason"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-2 py-2 text-sm text-[#221812]"
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
          >
            {REPORT_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded-full bg-[#b91c1c] px-4 py-2 text-sm font-bold text-white"
              onClick={() => report.mutate()}
              disabled={report.isPending}
            >
              Send report
            </button>
            <button
              type="button"
              className="rounded-full bg-white px-4 py-2 text-sm font-bold text-[#7c2d12]"
              onClick={() => setReportTarget(null)}
            >
              Cancel
            </button>
          </div>
          <p className="mt-2 text-xs text-[#7c2d12]">
            Repeat reports add strikes, and strikes put a player on a 24-hour
            chat cool-down automatically.
          </p>
        </div>
      )}
      {reportDone && (
        <p className="mt-2 rounded-lg bg-[#dcfce7] px-3 py-2 text-sm font-semibold text-[#14532d]">
          Report sent. Thanks for keeping the table family-friendly.
        </p>
      )}

      {notice && (
        <p className="mt-2 rounded-lg bg-[#ffedd5] px-3 py-2 text-sm font-semibold text-[#7c2d12]" role="alert">
          {notice}
        </p>
      )}

      <div className="mt-3">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--dim)]">
          Quick talk {under13 ? "— under-13 players chat with these phrases" : "— tap to send"}
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {QUICK_TALK.map((q) => (
            <button
              key={q}
              type="button"
              className="rounded-full bg-[#14532d] px-3 py-1.5 text-xs font-bold text-white"
              onClick={() => post.mutate({ body: q, quickTalk: true })}
              disabled={post.isPending}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {!under13 && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) post.mutate({ body: draft, quickTalk: false });
          }}
        >
          <label className="sr-only" htmlFor={`chat-input-${scope}`}>
            Type a message
          </label>
          <input
            id={`chat-input-${scope}`}
            className="min-w-0 flex-1 rounded-full border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)]"
            placeholder="Say it friendly…"
            value={draft}
            maxLength={300}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            type="submit"
            className="shrink-0 rounded-full bg-[#ff6b4a] px-5 py-2.5 text-sm font-bold text-white"
            disabled={post.isPending || !draft.trim()}
          >
            Send
          </button>
        </form>
      )}
      <p className="mt-2 text-xs text-[var(--dim)]">
        Every message is checked before it posts — a word filter and a tone
        check keep cussing, insults, and disrespect off the table.
      </p>
    </div>
  );
}
