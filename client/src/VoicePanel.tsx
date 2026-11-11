// Voice chat for Family Room tables: real peer-to-peer audio with WebRTC.
//
// How it fits together:
// - "Join voice" first asks the server (joinVoice), which enforces the same
//   Keep It Cool standing as text chat: accounts on a cool-down and
//   under-13 accounts are turned away before the mic ever opens.
// - Signaling (who's here, call offers/answers, network candidates) rides
//   the artifact's own voicePost/voicePoll actions, keyed by room code.
// - The audio itself flows directly between players' browsers
//   (RTCPeerConnection + a public STUN server) — it never passes through
//   the artifact's server, and nothing is recorded.
// - Live voice can't be word-filtered before it's heard, so the panel
//   says so plainly and keeps the tools that do work live: mute your mic,
//   turn voice off entirely, silence any one player for yourself, and
//   report — reports feed the same strikes and cool-downs as chat.

import { useEffect, useRef, useState } from "react";
import { api } from "./api";

interface VoicePanelProps {
  roomCode: string;
  token: string | null;
  displayName: string;
}

type VoiceState = "off" | "joining" | "on" | "blocked" | "error";

interface Peer {
  clientId: string;
  name: string;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const REPORT_REASONS = [
  "Cussing or insults on voice",
  "Disrespect at the table",
  "Bullying another player",
  "Something else not family-friendly",
];

function newClientId(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  return `v-${Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function VoicePanel({ roomCode, token, displayName }: VoicePanelProps) {
  const [state, setState] = useState<VoiceState>("off");
  const [message, setMessage] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({});
  const [silenced, setSilenced] = useState<Record<string, boolean>>({});
  const [reportTarget, setReportTarget] = useState<Peer | null>(null);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0] as string);
  const [reportDone, setReportDone] = useState(false);

  const clientIdRef = useRef<string>(newClientId());
  const myNameRef = useRef(displayName);
  const streamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef(new Map<string, RTCPeerConnection>());
  const audioElsRef = useRef(new Map<string, HTMLAudioElement>());
  const analysersRef = useRef(new Map<string, AnalyserNode>());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const pendingIceRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const peersRef = useRef<Peer[]>([]);
  const lastIdRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const silencedRef = useRef<Record<string, boolean>>({});
  silencedRef.current = silenced;

  function clearTimers() {
    for (const t of timersRef.current) window.clearInterval(t);
    timersRef.current = [];
  }

  function teardownAudio() {
    for (const pc of pcsRef.current.values()) pc.close();
    pcsRef.current.clear();
    for (const el of audioElsRef.current.values()) {
      el.srcObject = null;
      el.remove();
    }
    audioElsRef.current.clear();
    analysersRef.current.clear();
    pendingIceRef.current.clear();
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
  }

  async function post(
    toClient: string,
    kind: "presence" | "offer" | "answer" | "ice" | "leave",
    payload: string,
  ) {
    try {
      await api.voicePost({
        roomCode,
        fromClient: clientIdRef.current,
        toClient,
        kind,
        payload,
      });
    } catch {
      /* a lost signal just means the next poll retries the handshake */
    }
  }

  function watchLevel(key: string, stream: MediaStream) {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      analysersRef.current.set(key, analyser);
    } catch {
      /* speaking glow is a nicety; voice works without it */
    }
  }

  function ensurePeer(peerId: string): RTCPeerConnection {
    const existing = pcsRef.current.get(peerId);
    if (existing) return existing;
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcsRef.current.set(peerId, pc);
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getAudioTracks()) pc.addTrack(track, stream);
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        void post(peerId, "ice", JSON.stringify(e.candidate.toJSON()));
      }
    };
    pc.ontrack = (e) => {
      const remote = e.streams[0];
      if (!remote) return;
      let el = audioElsRef.current.get(peerId);
      if (!el) {
        el = new Audio();
        el.autoplay = true;
        document.body.appendChild(el);
        audioElsRef.current.set(peerId, el);
      }
      el.srcObject = remote;
      el.muted = silencedRef.current[peerId] ?? false;
      void el.play().catch(() => undefined);
      watchLevel(peerId, remote);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        pcsRef.current.delete(peerId);
        const el = audioElsRef.current.get(peerId);
        if (el) {
          el.srcObject = null;
          el.remove();
          audioElsRef.current.delete(peerId);
        }
        analysersRef.current.delete(peerId);
      }
    };
    return pc;
  }

  async function handleSignal(sig: {
    fromClient: string;
    kind: string;
    payload: string;
  }) {
    if (sig.kind === "leave") {
      const pc = pcsRef.current.get(sig.fromClient);
      if (pc) pc.close();
      pcsRef.current.delete(sig.fromClient);
      const el = audioElsRef.current.get(sig.fromClient);
      if (el) {
        el.srcObject = null;
        el.remove();
        audioElsRef.current.delete(sig.fromClient);
      }
      analysersRef.current.delete(sig.fromClient);
      return;
    }
    if (sig.kind !== "offer" && sig.kind !== "answer" && sig.kind !== "ice") {
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(sig.payload);
    } catch {
      return;
    }
    const pc = ensurePeer(sig.fromClient);
    try {
      if (sig.kind === "offer") {
        const desc = data as RTCSessionDescriptionInit;
        // Only the lower client id ever sends offers; if two arrive at
        // once anyway, the higher id backs down and answers instead.
        if (pc.signalingState !== "stable") return;
        await pc.setRemoteDescription(desc);
        await flushIce(pc, sig.fromClient);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        void post(sig.fromClient, "answer", JSON.stringify(answer));
      } else if (sig.kind === "answer") {
        if (pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(data as RTCSessionDescriptionInit);
          await flushIce(pc, sig.fromClient);
        }
      } else if (sig.kind === "ice") {
        const cand = data as RTCIceCandidateInit;
        if (pc.remoteDescription) {
          await pc.addIceCandidate(cand);
        } else {
          const queue = pendingIceRef.current.get(sig.fromClient) ?? [];
          queue.push(cand);
          pendingIceRef.current.set(sig.fromClient, queue);
        }
      }
    } catch {
      /* a failed handshake step is retried by the offer loop */
    }
  }

  async function flushIce(pc: RTCPeerConnection, peerId: string) {
    const queue = pendingIceRef.current.get(peerId) ?? [];
    pendingIceRef.current.delete(peerId);
    for (const cand of queue) {
      try {
        await pc.addIceCandidate(cand);
      } catch {
        /* stale candidate; the connection carries on without it */
      }
    }
  }

  async function join() {
    setMessage(null);
    setReportDone(false);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof RTCPeerConnection === "undefined"
    ) {
      setState("error");
      setMessage(
        "This browser can't do voice chat here. Try Chrome or Safari on your phone, or Chrome/Edge on a computer.",
      );
      return;
    }
    setState("joining");
    // Keep It Cool gate — the server checks cool-downs and under-13
    // accounts before the mic opens.
    let clearedName = displayName;
    try {
      const res = await api.joinVoice({
        token,
        guestName: token ? null : displayName,
        roomCode,
      });
      if (!res.ok) {
        setState("blocked");
        setMessage(
          res.error ?? "Voice chat isn't available for your account right now.",
        );
        return;
      }
      if (res.name) clearedName = res.name;
    } catch {
      setState("error");
      setMessage("Couldn't reach the voice check — try again in a second.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setState("error");
      setMessage(
        "Your microphone didn't open. Tap Join voice again and choose Allow when your phone or browser asks — or check the mic permission in your browser settings.",
      );
      return;
    }
    streamRef.current = stream;
    myNameRef.current = clearedName;
    setMuted(false);
    watchLevel("me", stream);
    lastIdRef.current = 0;
    void post("*", "presence", JSON.stringify({ name: clearedName }));

    // Heartbeat: presence every 4s, plus retry offers to any peer whose
    // connection hasn't landed yet.
    const heartbeat = window.setInterval(() => {
      void post("*", "presence", JSON.stringify({ name: myNameRef.current }));
      for (const p of peersRef.current) {
        if (p.clientId === clientIdRef.current) continue;
        const pc = pcsRef.current.get(p.clientId);
        if (
          (!pc || pc.connectionState === "new") &&
          clientIdRef.current < p.clientId
        ) {
          const conn = ensurePeer(p.clientId);
          if (conn.signalingState === "stable" && !conn.localDescription) {
            void conn
              .createOffer()
              .then((offer) => conn.setLocalDescription(offer).then(() => offer))
              .then((offer) =>
                post(p.clientId, "offer", JSON.stringify(offer)),
              )
              .catch(() => undefined);
          }
        }
      }
    }, 4000);

    // Signal + presence poll.
    const poll = window.setInterval(() => {
      void (async () => {
        try {
          const res = await api.voicePoll({
            roomCode,
            clientId: clientIdRef.current,
            sinceId: lastIdRef.current,
          });
          for (const sig of res.signals) {
            if (sig.id > lastIdRef.current) lastIdRef.current = sig.id;
            await handleSignal(sig);
          }
          peersRef.current = res.participants;
          setPeers(
            res.participants.filter(
              (p) => p.clientId !== clientIdRef.current,
            ),
          );
          // First contact with a new peer: the lower client id offers.
          for (const p of res.participants) {
            if (p.clientId === clientIdRef.current) continue;
            if (clientIdRef.current < p.clientId && !pcsRef.current.has(p.clientId)) {
              const conn = ensurePeer(p.clientId);
              try {
                const offer = await conn.createOffer();
                await conn.setLocalDescription(offer);
                void post(p.clientId, "offer", JSON.stringify(offer));
              } catch {
                /* heartbeat retries */
              }
            }
          }
        } catch {
          /* next poll in 1.5s picks up where this one left off */
        }
      })();
    }, 1500);

    // Speaking glow, sampled from every live stream's level.
    const levels = window.setInterval(() => {
      const next: Record<string, boolean> = {};
      const buf = new Uint8Array(64);
      for (const [key, analyser] of analysersRef.current) {
        analyser.getByteFrequencyData(buf);
        let sum = 0;
        for (const v of buf) sum += v;
        next[key] = sum / buf.length > 14;
      }
      setSpeaking(next);
    }, 300);

    timersRef.current = [heartbeat, poll, levels];
    setState("on");
  }

  function leave() {
    void post("*", "leave", "");
    clearTimers();
    teardownAudio();
    setPeers([]);
    setSpeaking({});
    setSilenced({});
    setMuted(false);
    setState("off");
    setMessage("Voice is off. Nobody can hear you, and you hear nobody.");
  }

  function toggleMute() {
    const stream = streamRef.current;
    if (!stream) return;
    const next = !muted;
    for (const track of stream.getAudioTracks()) track.enabled = !next;
    setMuted(next);
  }

  function toggleSilence(peer: Peer) {
    const next = !(silenced[peer.clientId] ?? false);
    setSilenced((s) => ({ ...s, [peer.clientId]: next }));
    const el = audioElsRef.current.get(peer.clientId);
    if (el) el.muted = next;
  }

  // Leaving the table turns voice fully off — mic released, peers closed.
  useEffect(() => {
    return () => {
      void api
        .voicePost({
          roomCode,
          fromClient: clientIdRef.current,
          toClient: "*",
          kind: "leave",
          payload: "",
        })
        .catch(() => undefined);
      clearTimers();
      teardownAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const on = state === "on";

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-black text-[var(--text)]">
          🎤 Voice chat — room {roomCode}
        </h3>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
            on
              ? "bg-[#dcfce7] text-[#14532d]"
              : "bg-[var(--bg)] text-[var(--dim)]"
          }`}
          role="status"
        >
          {on ? (muted ? "ON · MIC MUTED" : "ON · MIC LIVE") : "OFF"}
        </span>
      </div>

      {!on && state !== "joining" && (
        <>
          <p className="mt-1 text-sm text-[var(--dim)]">
            Talk live with the family at this table while you play — phone or
            computer, right in the game. Your voice goes straight from your
            device to theirs; nothing is recorded.
          </p>
          <button
            type="button"
            onClick={() => void join()}
            className="mt-3 w-full rounded-full bg-[#14532d] py-3 text-base font-black text-white"
          >
            🎤 Join voice chat
          </button>
          <p className="mt-2 text-xs text-[var(--dim)]">
            Your browser will ask for the microphone — tap Allow. Voice is
            free for everyone at the table.
          </p>
        </>
      )}

      {state === "joining" && (
        <p className="mt-3 text-sm font-semibold text-[var(--text)]" role="status">
          Opening your microphone… tap Allow if your device asks.
        </p>
      )}

      {on && (
        <>
          <div
            className="mt-3 grid grid-cols-2 gap-2"
            role="group"
            aria-label="Voice controls"
          >
            <button
              type="button"
              onClick={toggleMute}
              aria-pressed={muted}
              className={`rounded-full py-3 text-base font-black ${
                muted
                  ? "bg-[#b91c1c] text-white"
                  : "bg-[#f5b942] text-[#221812]"
              }`}
            >
              {muted ? "🔇 Unmute me" : "🎤 Mute me"}
            </button>
            <button
              type="button"
              onClick={leave}
              className="rounded-full bg-[#221812] py-3 text-base font-black text-white"
            >
              📴 Turn voice off
            </button>
          </div>

          <ul className="mt-3 space-y-1.5" aria-label="Who is on voice">
            <li
              className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 ring-2 ${
                speaking["me"]
                  ? "bg-[#dcfce7] ring-[#22c55e]"
                  : "bg-[var(--bg)] ring-transparent"
              }`}
            >
              <span className="text-sm font-bold text-[var(--text)]">
                {speaking["me"] ? "🔊 " : "🎤 "}
                {myNameRef.current} (you)
                {muted && " — muted"}
              </span>
              <span className="text-xs font-semibold text-[var(--dim)]">
                {speaking["me"] && !muted ? "Speaking" : ""}
              </span>
            </li>
            {peers.map((p) => (
              <li
                key={p.clientId}
                className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 ring-2 ${
                  speaking[p.clientId]
                    ? "bg-[#dcfce7] ring-[#22c55e]"
                    : "bg-[var(--bg)] ring-transparent"
                }`}
              >
                <span className="min-w-0 truncate text-sm font-bold text-[var(--text)]">
                  {speaking[p.clientId] ? "🔊 " : "🎧 "}
                  {p.name}
                  {silenced[p.clientId] && " — silenced by you"}
                </span>
                <span className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => toggleSilence(p)}
                    aria-pressed={silenced[p.clientId] ?? false}
                    aria-label={`${silenced[p.clientId] ? "Unsilence" : "Silence"} ${p.name}`}
                    className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-black text-[var(--text)] shadow"
                  >
                    {silenced[p.clientId] ? "Unsilence" : "Silence"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReportTarget(p);
                      setReportDone(false);
                    }}
                    aria-label={`Report ${p.name}`}
                    className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-black text-[#b91c1c] shadow"
                  >
                    Report
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {peers.length === 0 && (
            <p className="mt-2 text-sm text-[var(--dim)]">
              You're the only one on voice right now. When family open this
              room on their phone or computer and tap Join voice, they'll show
              up here and you'll hear each other. (Computer players don't
              talk.)
            </p>
          )}

          {reportTarget && (
            <div className="mt-3 rounded-xl border border-[#f5b942] bg-[#fff7e0] p-3">
              <p className="text-sm font-bold text-[#7c2d12]">
                Report {reportTarget.name}?
              </p>
              <label
                className="mt-2 block text-xs font-semibold text-[#7c2d12]"
                htmlFor="voice-report-reason"
              >
                What happened on voice?
              </label>
              <select
                id="voice-report-reason"
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
                  onClick={() => {
                    const target = reportTarget;
                    setReportTarget(null);
                    void api
                      .reportPlayer({
                        reporterName: displayName,
                        targetName: target.name,
                        reason: reportReason,
                        scope: "room-voice",
                      })
                      .then(() => setReportDone(true))
                      .catch(() => undefined);
                  }}
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
                Reports add up: three reports add a strike, and strikes put a
                player on an automatic 24-hour cool-down from chat and voice.
              </p>
            </div>
          )}
          {reportDone && (
            <p className="mt-2 rounded-lg bg-[#dcfce7] px-3 py-2 text-sm font-semibold text-[#14532d]">
              Report sent. Thanks for keeping the table family-friendly.
            </p>
          )}
        </>
      )}

      {message && (
        <p
          className="mt-3 rounded-lg bg-[#ffedd5] px-3 py-2 text-sm font-semibold text-[#7c2d12]"
          role="alert"
        >
          {message}
        </p>
      )}

      <p className="mt-3 text-xs text-[var(--dim)]">
        Keep It Cool covers voice too: words said out loud can't be filtered
        before they're heard, so the rules ride on respect — accounts on a
        chat cool-down can't join voice, under-13 players stick to quick-talk,
        and reports from voice add the same strikes as chat reports. Silence
        anyone for yourself any time, or turn voice off and the mic closes
        completely.
      </p>
    </div>
  );
}
