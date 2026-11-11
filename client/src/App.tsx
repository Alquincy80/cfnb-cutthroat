import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "./SafeAreaTopScrim";
import { api, type ApiResponse } from "./api";
import {
CAST,
CHAPTERS,
DECKS,
FELTS,
unlockedDecks,
unlockedFelts,
type Difficulty,
} from "./game";
import { GameTable, type GameConfig } from "./GameTable";
import { ChatPanel } from "./ChatPanel";

type Profile = ApiResponse<typeof api, "getProfile">;
type View =
  | "home"
  | "story"
  | "rooms"
  | "lounge"
  | "store"
  | "rules"
  | "account"
  | "look";

interface GuestProgress {
  chapters: number[];
  totalWins: number;
  gamesPlayed: number;
}

const LS_TOKEN = "cfnb-token";
const LS_GUEST = "cfnb-guest";
const LS_LOOK = "cfnb-look";

function loadGuest(): GuestProgress {
  try {
    const raw = localStorage.getItem(LS_GUEST);
    if (raw) {
      const p = JSON.parse(raw) as GuestProgress;
      return {
        chapters: Array.isArray(p.chapters) ? p.chapters : [],
        totalWins: p.totalWins ?? 0,
        gamesPlayed: p.gamesPlayed ?? 0,
      };
    }
  } catch {
    /* fresh guest */
  }
  return { chapters: [], totalWins: 0, gamesPlayed: 0 };
}

const QUICK_OPPONENTS: Record<number, string[]> = {
  3: ["dee", "trey"],
  4: ["big-mama", "uncle-ray", "dee"],
};

// Confetti sprinkled over the cover poster (fixed spots, pure decoration).
const CONFETTI: {
  left: string;
  top: string;
  size: number;
  color: string;
  square?: boolean;
  rot?: number;
}[] = [
  { left: "5%", top: "9%", size: 9, color: "#ffd166" },
  { left: "12%", top: "58%", size: 7, color: "#7dd3fc", square: true, rot: 24 },
  { left: "88%", top: "14%", size: 8, color: "#fda4af" },
  { left: "93%", top: "46%", size: 10, color: "#ffd166", square: true, rot: 40 },
  { left: "3%", top: "38%", size: 7, color: "#86efac" },
  { left: "80%", top: "80%", size: 8, color: "#7dd3fc" },
  { left: "18%", top: "86%", size: 9, color: "#fda4af", square: true, rot: 15 },
  { left: "70%", top: "5%", size: 7, color: "#86efac" },
  { left: "96%", top: "72%", size: 7, color: "#ffd166" },
  { left: "26%", top: "4%", size: 6, color: "#fff7e6" },
];

export function App() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("home");
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(LS_TOKEN),
  );
  const [guestName, setGuestName] = useState("You");
  const [guest, setGuest] = useState<GuestProgress>(loadGuest);
  const [game, setGame] = useState<GameConfig | null>(null);
  const [showAd, setShowAd] = useState(false);
  const [pendingResult, setPendingResult] = useState<{
    won: boolean;
    chapter: number | null;
  } | null>(null);

  const [look, setLook] = useState<{ deckId: string; feltId: string }>(() => {
    try {
      const raw = localStorage.getItem(LS_LOOK);
      if (raw) return JSON.parse(raw) as { deckId: string; feltId: string };
    } catch {
      /* default look */
    }
    return { deckId: "house", feltId: "classic-green" };
  });
  useEffect(() => {
    localStorage.setItem(LS_LOOK, JSON.stringify(look));
  }, [look]);

  const profile = useQuery({
    queryKey: ["profile", token],
    queryFn: () => api.getProfile({ token: token as string }),
    enabled: !!token,
  });
  const prof: Profile | null =
    profile.data && profile.data.ok ? profile.data : null;

  const signedIn = !!prof;
  const displayName = prof?.name ?? guestName;
  const under13 = prof?.under13 ?? false;
  const chapters = prof ? prof.chapters : guest.chapters;
  const totalWins = prof ? prof.totalWins : guest.totalWins;
  const gamesPlayed = prof ? prof.gamesPlayed : guest.gamesPlayed;
  const hasPass = prof?.hasFamilyPass ?? false;
  const hasNoAds = prof?.hasRemoveAds ?? false;

  const myDecks = useMemo(
    () => unlockedDecks(chapters, totalWins, hasPass),
    [chapters, totalWins, hasPass],
  );
  const myFelts = useMemo(
    () => unlockedFelts(chapters, hasPass),
    [chapters, hasPass],
  );

  useEffect(() => {
    localStorage.setItem(LS_GUEST, JSON.stringify(guest));
  }, [guest]);

  const recordResult = useMutation({
    mutationFn: (args: { won: boolean; chapter: number | null }) =>
      api.recordGameResult({
        token: token as string,
        won: args.won,
        chapter: args.chapter,
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["profile"] }),
  });

  function handleGameEnd(won: boolean) {
    const chapter = game?.chapter ?? null;
    if (token && prof) {
      recordResult.mutate({ won, chapter });
    } else {
      setGuest((g) => ({
        chapters:
          won && chapter != null && !g.chapters.includes(chapter)
            ? [...g.chapters, chapter].sort((a, b) => a - b)
            : g.chapters,
        totalWins: g.totalWins + (won ? 1 : 0),
        gamesPlayed: g.gamesPlayed + 1,
      }));
    }
    setPendingResult({ won, chapter });
    if (!hasNoAds) setShowAd(true);
  }

  function startQuick(playerCount: 3 | 4, difficulty: Difficulty) {
    setGame({
      mode: "quick",
      playerCount,
      difficulty,
      opponentIds: QUICK_OPPONENTS[playerCount] ?? ["dee", "trey"],
      chapter: null,
      chapterName: null,
      roomCode: null,
      roomSeatNames: [],
    });
  }

  if (game) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <SafeAreaTopScrim backgroundColor="var(--bg)" />
        <GameTable
          config={game}
          playerName={displayName}
          deckId={look.deckId}
          feltId={look.feltId}
          chatToken={token}
          chatUnder13={under13}
          onExit={() => setGame(null)}
          onGameEnd={handleGameEnd}
        />
        {showAd && (
          <HouseAd
            hasPass={hasPass}
            result={pendingResult}
            onClose={() => setShowAd(false)}
            onStore={() => {
              setShowAd(false);
              setGame(null);
              setView("store");
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <main className="mx-auto w-full max-w-3xl px-4 pb-10">
        {view === "home" && (
          <HomeScreen
            displayName={displayName}
            signedIn={signedIn}
            totalWins={totalWins}
            gamesPlayed={gamesPlayed}
            chaptersWon={chapters.length}
            onQuick={startQuick}
            onStory={() => setView("story")}
            onRooms={() => setView("rooms")}
            onLounge={() => setView("lounge")}
            onStore={() => setView("store")}
            onRules={() => setView("rules")}
            onAccount={() => setView("account")}
            onLook={() => setView("look")}
          />
        )}
        {view === "story" && (
          <StoryScreen
            chapters={chapters}
            hasPass={hasPass}
            onBack={() => setView("home")}
            onStore={() => setView("store")}
            onPlay={(ch) =>
              setGame({
                mode: "story",
                playerCount: 4,
                difficulty: ch.difficulty,
                opponentIds: ch.opponents,
                chapter: ch.n,
                chapterName: ch.name,
                roomCode: null,
                roomSeatNames: [],
              })
            }
          />
        )}
        {view === "rooms" && (
          <RoomsScreen
            displayName={displayName}
            signedIn={signedIn}
            onBack={() => setView("home")}
            onStart={(cfg) => setGame(cfg)}
          />
        )}
        {view === "lounge" && (
          <section className="pt-4">
            <BackBar title="Family Lounge" onBack={() => setView("home")} />
            <p className="mt-1 text-sm text-[var(--dim)]">
              The whole family's table talk, in one room. Chat is moderated —
              keep it cool.
            </p>
            <div className="mt-3 h-[480px] rounded-3xl bg-[var(--surface)] p-4 shadow">
              <ChatPanel
                scope="lounge"
                roomCode={null}
                token={token}
                displayName={displayName}
                under13={under13}
              />
            </div>
          </section>
        )}
        {view === "store" && (
          <StoreScreen
            signedIn={signedIn}
            hasPass={hasPass}
            hasNoAds={hasNoAds}
            token={token}
            onBack={() => setView("home")}
            onAccount={() => setView("account")}
          />
        )}
        {view === "rules" && <RulesScreen onBack={() => setView("home")} />}
        {view === "account" && (
          <AccountScreen
            prof={prof}
            token={token}
            guestName={guestName}
            onGuestName={setGuestName}
            onBack={() => setView("home")}
            onSignedIn={(t) => {
              localStorage.setItem(LS_TOKEN, t);
              setToken(t);
            }}
            onSignOut={() => {
              localStorage.removeItem(LS_TOKEN);
              setToken(null);
              void queryClient.invalidateQueries({ queryKey: ["profile"] });
            }}
          />
        )}
        {view === "look" && (
          <LookScreen
            deckId={look.deckId}
            feltId={look.feltId}
            myDecks={myDecks}
            myFelts={myFelts}
            onChange={setLook}
            onBack={() => setView("home")}
          />
        )}
      </main>
    </div>
  );
}

function BackBar({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        className="rounded-full bg-[var(--surface)] px-4 py-2 text-sm font-bold text-[var(--text)] shadow"
      >
        ← Back
      </button>
      <h2 className="text-2xl font-black text-[var(--text)]">{title}</h2>
    </div>
  );
}

function HouseAd({
  hasPass,
  result,
  onClose,
  onStore,
}: {
  hasPass: boolean;
  result: { won: boolean; chapter: number | null } | null;
  onClose: () => void;
  onStore: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-3xl bg-[#221812] p-5 text-center shadow-2xl">
        <p className="text-xs font-black uppercase tracking-widest text-[#f5b942]">
          Between games · House ad
        </p>
        <p className="mt-2 text-xl font-black text-white">
          {result?.won
            ? "Winner's table energy! 🏆"
            : "Good game, family."}
        </p>
        {!hasPass ? (
          <>
            <p className="mt-2 text-sm text-white/85">
              The <strong>Full Family Pass</strong> opens Story chapters 3–8,
              every felt and card back, and takes ads away for good — $4.99,
              once.
            </p>
            <button
              type="button"
              onClick={onStore}
              className="mt-4 w-full rounded-full bg-[#f5b942] py-3 text-base font-black text-[#221812]"
            >
              See the Family Pass
            </button>
          </>
        ) : (
          <p className="mt-2 text-sm text-white/85">
            You've got the Family Pass — every chapter and cosmetic is yours.
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-full bg-white/15 py-3 text-base font-black text-white"
        >
          Keep playing
        </button>
      </div>
    </div>
  );
}

// ---------- Home ----------

function HomeScreen(props: {
  displayName: string;
  signedIn: boolean;
  totalWins: number;
  gamesPlayed: number;
  chaptersWon: number;
  onQuick: (pc: 3 | 4, d: Difficulty) => void;
  onStory: () => void;
  onRooms: () => void;
  onLounge: () => void;
  onStore: () => void;
  onRules: () => void;
  onAccount: () => void;
  onLook: () => void;
}) {
  const [playerCount, setPlayerCount] = useState<3 | 4>(4);
  const [difficulty, setDifficulty] = useState<Difficulty>("spicy");
  return (
    <div className="pt-4 sm:pt-5">
      {/* ---- Cookout-poster cover ---- */}
      <section
        className="relative overflow-hidden rounded-[2rem] px-4 pb-6 pt-6 shadow-2xl sm:px-8 sm:pt-8"
        style={{
          background:
            "radial-gradient(ellipse 90% 55% at 50% -5%, rgba(255,216,130,0.65), rgba(255,216,130,0) 60%), linear-gradient(165deg, #7c2d12 0%, #b91c1c 34%, #ea580c 68%, #f59e0b 100%)",
        }}
      >
        {/* Sunburst rays */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "repeating-conic-gradient(from -90deg at 50% 30%, rgba(255,196,64,0.20) 0deg 9deg, rgba(255,196,64,0) 9deg 18deg)",
            WebkitMaskImage:
              "radial-gradient(ellipse 75% 65% at 50% 32%, black 30%, transparent 72%)",
            maskImage:
              "radial-gradient(ellipse 75% 65% at 50% 32%, black 30%, transparent 72%)",
          }}
        />
        {/* Confetti */}
        {CONFETTI.map((d, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="pointer-events-none absolute"
            style={{
              left: d.left,
              top: d.top,
              width: d.size,
              height: d.size,
              background: d.color,
              borderRadius: d.square ? 2 : "50%",
              transform: d.square ? `rotate(${d.rot ?? 0}deg)` : undefined,
              opacity: 0.9,
            }}
          />
        ))}

        <div className="relative">
          {/* Tagline ribbon */}
          <div className="mx-auto w-fit max-w-full -rotate-2 rounded-full bg-gradient-to-r from-[#991b1b] via-[#dc2626] to-[#991b1b] px-4 py-2 shadow-[0_0_28px_rgba(255,190,60,0.85)] ring-2 ring-[#ffd166]">
            <p className="text-center text-[11px] font-black uppercase tracking-[0.16em] text-[#ffe9b0] sm:text-sm">
              You can choose your family, but not your blood
            </p>
          </div>

          <h1 className="mt-4 text-center text-5xl font-black leading-[0.95] text-[#fff7e6] drop-shadow-[0_3px_0_rgba(124,45,18,0.9)] sm:text-6xl">
            C.F.N.B.
            <span className="block text-[#ffd166]">Cutthroat</span>
          </h1>
          <p className="mx-auto mt-2 max-w-md text-center text-base font-bold text-white/90 sm:text-lg">
            Family Card Night — bid from 3, beat the card on the table,
            first to 150.
          </p>

          {/* The family, front and center */}
          <div
            className="mt-5 flex flex-wrap items-start justify-center gap-x-2 gap-y-3 sm:gap-x-3"
            aria-label="The family cast"
          >
            {CAST.map((c, i) => (
              <figure
                key={c.id}
                className="flex w-16 flex-col items-center sm:w-20"
                style={{ transform: `rotate(${(i % 3 - 1) * 3}deg)` }}
              >
                <img
                  src={c.img ?? undefined}
                  alt={`Portrait of ${c.name}`}
                  title={c.name}
                  className="h-16 w-16 rounded-full object-cover shadow-[0_6px_18px_rgba(0,0,0,0.45)] ring-4 ring-[#ffd166] sm:h-20 sm:w-20"
                />
                <figcaption className="mt-1 text-center text-[10px] font-black uppercase tracking-wide text-[#ffe9b0] sm:text-[11px]">
                  {c.name}
                </figcaption>
              </figure>
            ))}
          </div>

          {/* Big glowing Deal 'Em button */}
          <div className="relative mx-auto mt-6 w-full max-w-sm">
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full bg-[#ffb03a] opacity-60 blur-md motion-safe:animate-pulse"
            />
            <button
              type="button"
              onClick={() => props.onQuick(playerCount, difficulty)}
              className="relative w-full rounded-full bg-gradient-to-b from-[#ffd166] via-[#ff9f2e] to-[#ff6b35] py-4 text-2xl font-black uppercase tracking-wide text-[#431407] shadow-[0_10px_30px_rgba(0,0,0,0.4)] ring-4 ring-[#fff3d6] active:scale-[0.98]"
            >
              ♠ Deal &apos;Em — Play! ♠
            </button>
          </div>
          <p className="mt-3 text-center text-xs font-bold text-white/85">
            Free to play · no sign-up needed · deals the table set up below
          </p>

          <p className="mt-2 text-center text-sm font-semibold text-white/90">
            Playing as{" "}
            <span className="font-black text-white">{props.displayName}</span>
            {" · "}
            {props.gamesPlayed} games · {props.totalWins} wins ·{" "}
            {props.chaptersWon}/8 chapters
            {!props.signedIn && " · playing as guest"}
          </p>
        </div>
      </section>

      {/* Quick Play */}
      <section className="mt-6 rounded-3xl bg-[#14532d] p-5 shadow-xl">
        <h2 className="text-2xl font-black text-white">Quick Play</h2>
        <p className="mt-1 text-sm font-semibold text-white/85">
          No sign-up. Pick your table and get dealt in against the computer.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="Table size">
          {([4, 3] as const).map((pc) => (
            <button
              key={pc}
              type="button"
              aria-pressed={playerCount === pc}
              onClick={() => setPlayerCount(pc)}
              className={`rounded-2xl py-3 text-base font-black ${
                playerCount === pc
                  ? "bg-[#f5b942] text-[#221812]"
                  : "bg-white/15 text-white"
              }`}
            >
              {pc}-player {pc === 3 ? "(2♣ out)" : "classic"}
            </button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="Computer skill">
          {(
            [
              ["friendly", "Friendly"],
              ["spicy", "Spicy"],
              ["cutthroat", "Cutthroat"],
            ] as [Difficulty, string][]
          ).map(([d, label]) => (
            <button
              key={d}
              type="button"
              aria-pressed={difficulty === d}
              onClick={() => setDifficulty(d)}
              className={`rounded-2xl py-2.5 text-sm font-black ${
                difficulty === d
                  ? "bg-[#f5b942] text-[#221812]"
                  : "bg-white/15 text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => props.onQuick(playerCount, difficulty)}
          className="mt-4 w-full rounded-full bg-[#ff6b4a] py-4 text-xl font-black text-white shadow-lg active:scale-[0.99]"
        >
          Deal me in ▶
        </button>
      </section>

      {/* Main menu grid */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <MenuButton
          title="Story Mode"
          sub="8 chapters to the Head Table"
          emoji="📖"
          onClick={props.onStory}
        />
        <MenuButton
          title="Family Rooms"
          sub="Private room, 6-letter code"
          emoji="🏠"
          onClick={props.onRooms}
        />
        <MenuButton
          title="Family Lounge"
          sub="Moderated family chat"
          emoji="💬"
          onClick={props.onLounge}
        />
        <MenuButton
          title="Store"
          sub="Family Pass $4.99 · No Ads $1.99"
          emoji="🛒"
          onClick={props.onStore}
        />
        <MenuButton
          title="My Look"
          sub="Card backs & table felts"
          emoji="🎨"
          onClick={props.onLook}
        />
        <MenuButton
          title={props.signedIn ? "My Account" : "Sign In / Sign Up"}
          sub={props.signedIn ? "Progress saved" : "Save progress everywhere"}
          emoji="👤"
          onClick={props.onAccount}
        />
      </div>
      <button
        type="button"
        onClick={props.onRules}
        className="mt-4 w-full rounded-full bg-[var(--surface)] py-3 text-base font-black text-[var(--text)] shadow"
      >
        How to Play — the house rules
      </button>
    </div>
  );
}

function MenuButton({
  title,
  sub,
  emoji,
  onClick,
}: {
  title: string;
  sub: string;
  emoji: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-3xl bg-[var(--surface)] p-4 text-left shadow active:scale-[0.99]"
    >
      <span className="text-2xl" aria-hidden="true">
        {emoji}
      </span>
      <span className="mt-1 block text-base font-black text-[var(--text)]">
        {title}
      </span>
      <span className="block text-xs font-semibold text-[var(--dim)]">
        {sub}
      </span>
    </button>
  );
}

// ---------- Story ----------

function StoryScreen(props: {
  chapters: number[];
  hasPass: boolean;
  onBack: () => void;
  onStore: () => void;
  onPlay: (ch: (typeof CHAPTERS)[number]) => void;
}) {
  return (
    <section className="pt-4">
      <BackBar title="Story Mode" onBack={props.onBack} />
      <p className="mt-1 text-sm text-[var(--dim)]">
        Climb from the kitchen table to Big Mama's head seat. Win a chapter to
        unlock the next — and its felt, card back, or talk pack. Chapters 1–2
        are free; 3–8 come with the Family Pass.
      </p>
      <div className="mt-4 space-y-3">
        {CHAPTERS.map((ch) => {
          const won = props.chapters.includes(ch.n);
          const prevWon = ch.n === 1 || props.chapters.includes(ch.n - 1);
          const needsPass = ch.n >= 3 && !props.hasPass;
          const locked = !prevWon || needsPass;
          const lead = CAST.find((c) => c.id === ch.opponents[0]);
          return (
            <article
              key={ch.n}
              className="flex gap-3 rounded-3xl bg-[var(--surface)] p-4 shadow"
            >
              {lead?.img ? (
                <img
                  src={lead.img}
                  alt={`Portrait of ${lead.name}`}
                  className="h-20 w-20 shrink-0 rounded-2xl object-cover"
                />
              ) : (
                <div
                  className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-[#7c2d12] text-lg font-black text-[#f5b942]"
                  aria-label={`Portrait placeholder for ${lead?.name ?? "opponent"}`}
                >
                  {lead?.name.split(" ").map((w) => w[0]).join("")}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-black text-[var(--text)]">
                  Ch. {ch.n} — {ch.name} {won && "✅"}
                </h3>
                <p className="text-xs font-semibold text-[var(--dim)]">
                  {ch.room}
                </p>
                <p className="mt-1 text-xs font-semibold text-[var(--dim)]">
                  vs {ch.opponents
                    .map((id) => CAST.find((c) => c.id === id)?.name ?? id)
                    .join(", ")}{" "}
                  · {ch.difficulty}
                </p>
                <div className="mt-2" aria-label={`Mean Meter ${ch.mean} percent`}>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-black uppercase tracking-wide text-[#b91c1c]">
                      Mean Meter
                    </span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--border)]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#f5b942] to-[#b91c1c]"
                        style={{ width: `${ch.mean}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-black text-[var(--text)]">
                      {ch.mean}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-xs font-bold text-[#b45309]">
                  Win unlocks: {ch.unlock}
                </p>
                {needsPass ? (
                  <button
                    type="button"
                    onClick={props.onStore}
                    className="mt-2 rounded-full bg-[#f5b942] px-5 py-2.5 text-sm font-black text-[#221812]"
                  >
                    🔒 Get the Family Pass
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => props.onPlay(ch)}
                    className="mt-2 rounded-full bg-[#14532d] px-5 py-2.5 text-sm font-black text-white disabled:opacity-40"
                  >
                    {locked
                      ? `🔒 Win Chapter ${ch.n - 1} first`
                      : won
                        ? "Replay chapter"
                        : "Play chapter"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

// ---------- Rooms ----------

function RoomsScreen(props: {
  displayName: string;
  signedIn: boolean;
  onBack: () => void;
  onStart: (cfg: GameConfig) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(props.displayName === "You" ? "" : props.displayName);
  const [playerCount, setPlayerCount] = useState<3 | 4>(4);
  const [code, setCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const room = useQuery({
    queryKey: ["room", code],
    queryFn: () => api.getRoom({ code: code as string }),
    enabled: !!code,
    refetchInterval: 3000,
  });

  const create = useMutation({
    mutationFn: () =>
      api.createRoom({ hostName: name.trim(), playerCount }),
    onSuccess: (res) => {
      if (res.code) {
        setCode(res.code);
        setError(null);
        void queryClient.invalidateQueries({ queryKey: ["room"] });
      } else setError(res.error ?? "Could not create the room.");
    },
  });

  const join = useMutation({
    mutationFn: () =>
      api.joinRoom({ code: joinCode.trim().toUpperCase(), name: name.trim() }),
    onSuccess: (res) => {
      if (res.ok) {
        setCode(joinCode.trim().toUpperCase());
        setError(null);
      } else setError(res.error ?? "Could not join that room.");
    },
  });

  const seats = room.data?.found ? room.data.seats : [];
  const myName = name.trim();

  return (
    <section className="pt-4">
      <BackBar title="Family Rooms" onBack={props.onBack} />
      <p className="mt-1 text-sm text-[var(--dim)]">
        Make a private room, share the 6-letter code, and the family joins
        from any device. Empty seats are played by the computer, and table
        chat rides along.
      </p>

      {!code && (
        <div className="mt-4 rounded-3xl bg-[var(--surface)] p-4 shadow">
          <label className="block text-sm font-black text-[var(--text)]" htmlFor="room-name">
            Your table name
          </label>
          <input
            id="room-name"
            className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-base text-[var(--text)]"
            placeholder="e.g. Uncle Al"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Room table size">
            {([4, 3] as const).map((pc) => (
              <button
                key={pc}
                type="button"
                aria-pressed={playerCount === pc}
                onClick={() => setPlayerCount(pc)}
                className={`rounded-2xl py-2.5 text-sm font-black ${
                  playerCount === pc
                    ? "bg-[#14532d] text-white"
                    : "bg-[var(--bg)] text-[var(--text)]"
                }`}
              >
                {pc}-player table
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!myName || create.isPending}
            onClick={() => create.mutate()}
            className="mt-3 w-full rounded-full bg-[#ff6b4a] py-3 text-base font-black text-white disabled:opacity-40"
          >
            Create my room
          </button>
          <div className="my-4 flex items-center gap-3 text-xs font-black uppercase tracking-wide text-[var(--dim)]">
            <span className="h-px flex-1 bg-[var(--border)]" /> or join{" "}
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>
          <label className="block text-sm font-black text-[var(--text)]" htmlFor="join-code">
            Room code
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="join-code"
              className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-base font-black uppercase tracking-[0.3em] text-[var(--text)]"
              placeholder="ABCDEF"
              value={joinCode}
              maxLength={6}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            />
            <button
              type="button"
              disabled={!myName || joinCode.trim().length !== 6 || join.isPending}
              onClick={() => join.mutate()}
              className="shrink-0 rounded-full bg-[#14532d] px-5 py-2.5 text-sm font-black text-white disabled:opacity-40"
            >
              Join room
            </button>
          </div>
          {error && (
            <p className="mt-3 rounded-lg bg-[#fee2e2] px-3 py-2 text-sm font-semibold text-[#7f1d1d]" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      {code && (
        <div className="mt-4 rounded-3xl bg-[#14532d] p-5 text-center shadow-xl">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-[#f5b942]">
            Your room code
          </p>
          <p className="mt-1 text-5xl font-black tracking-[0.2em] text-white">
            {code}
          </p>
          <p className="mt-2 text-sm font-semibold text-white/85">
            Tell the family this code — they tap Family Rooms, type it in, and
            they're at your table.
          </p>
          <div className="mt-4 space-y-2 text-left">
            {Array.from({ length: room.data?.playerCount ?? playerCount }).map((_, i) => {
              const seat = seats[i];
              return (
                <p
                  key={i}
                  className="rounded-xl bg-black/30 px-3 py-2 text-sm font-bold text-white"
                >
                  Seat {i + 1}:{" "}
                  {seat
                    ? `${seat.name} (family)`
                    : "Computer player fills this seat"}
                </p>
              );
            })}
          </div>
          <button
            type="button"
            className="mt-4 w-full rounded-full bg-[#ff6b4a] py-3.5 text-lg font-black text-white"
            onClick={() =>
              props.onStart({
                mode: "room",
                playerCount: (room.data?.playerCount as 3 | 4) ?? playerCount,
                difficulty: "spicy",
                opponentIds:
                  (room.data?.playerCount ?? playerCount) === 3
                    ? ["dee", "trey"]
                    : ["big-mama", "uncle-ray", "dee"],
                chapter: null,
                chapterName: null,
                roomCode: code,
                roomSeatNames: seats.map((s) => s.name),
              })
            }
          >
            Start the game ▶
          </button>
          <button
            type="button"
            className="mt-2 w-full rounded-full bg-white/15 py-2.5 text-sm font-black text-white"
            onClick={() => setCode(null)}
          >
            Leave lobby
          </button>
          <p className="mt-3 text-xs text-white/70">
            Heads-up: room codes, seats, and chat are live now. Turn-by-turn
            play across different phones switches on when the game is
            published to its own site — in this build, the table plays on this
            device with the computer in the open seats.
          </p>
        </div>
      )}
    </section>
  );
}

// ---------- Store ----------

function StoreScreen(props: {
  signedIn: boolean;
  hasPass: boolean;
  hasNoAds: boolean;
  token: string | null;
  onBack: () => void;
  onAccount: () => void;
}) {
  const queryClient = useQueryClient();
  const [buying, setBuying] = useState<"family_pass" | "remove_ads" | null>(null);
  const [card, setCard] = useState("4242 4242 4242 4242");
  const [msg, setMsg] = useState<string | null>(null);

  const buy = useMutation({
    mutationFn: (product: "family_pass" | "remove_ads") =>
      api.buyProduct({ token: props.token as string, product, cardNumber: card }),
    onSuccess: (res) => {
      if (res.ok) {
        setMsg("Done! It's on your account — enjoy the full table.");
        setBuying(null);
        void queryClient.invalidateQueries({ queryKey: ["profile"] });
      } else {
        setMsg(res.error ?? "That didn't go through. Try again.");
      }
    },
    onError: () => setMsg("Checkout hiccup — try again in a second."),
  });

  return (
    <section className="pt-4">
      <BackBar title="Store" onBack={props.onBack} />
      <p className="mt-1 text-sm text-[var(--dim)]">
        Free to play, always: Quick Play, Story chapters 1–2, Family Rooms,
        and the Lounge cost nothing. These one-time buys open the rest — no
        subscription, ever.
      </p>
      <p className="mt-2 rounded-xl bg-[#fff7e0] px-3 py-2 text-xs font-bold text-[#7c2d12]">
        Stripe TEST MODE: checkout runs on Stripe's test rails. Use test card
        4242 4242 4242 4242, any future date, any 3-digit code — no real money
        moves. Live payments start when the owner claims the Stripe account at
        publish time.
      </p>

      {!props.signedIn && (
        <button
          type="button"
          onClick={props.onAccount}
          className="mt-3 w-full rounded-full bg-[#14532d] py-3 text-base font-black text-white"
        >
          Sign in first so your purchase follows you
        </button>
      )}

      <div className="mt-4 space-y-3">
        <article className="rounded-3xl bg-[#221812] p-5 shadow-xl">
          <p className="text-xs font-black uppercase tracking-widest text-[#f5b942]">
            Best value
          </p>
          <h3 className="mt-1 text-2xl font-black text-white">
            Full Family Pass — $4.99
          </h3>
          <ul className="mt-2 space-y-1 text-sm font-semibold text-white/90">
            <li>✅ Story chapters 3–8, all the way to the Head Table</li>
            <li>✅ Every felt and card back unlocked</li>
            <li>✅ Ads removed for good</li>
            <li>✅ One-time payment. Yours forever.</li>
          </ul>
          {props.hasPass ? (
            <p className="mt-3 rounded-full bg-[#14532d] py-2.5 text-center text-sm font-black text-white">
              You own the Family Pass ✅
            </p>
          ) : (
            <button
              type="button"
              disabled={!props.signedIn}
              onClick={() => setBuying("family_pass")}
              className="mt-3 w-full rounded-full bg-[#f5b942] py-3 text-base font-black text-[#221812] disabled:opacity-40"
            >
              Buy the Family Pass
            </button>
          )}
        </article>

        <article className="rounded-3xl bg-[var(--surface)] p-5 shadow">
          <h3 className="text-xl font-black text-[var(--text)]">
            Remove Ads — $1.99
          </h3>
          <p className="mt-1 text-sm font-semibold text-[var(--dim)]">
            Just want the between-game ads gone? This does exactly that.
            Chapters 3–8 stay with the Family Pass.
          </p>
          {props.hasNoAds ? (
            <p className="mt-3 rounded-full bg-[#dcfce7] py-2.5 text-center text-sm font-black text-[#14532d]">
              Ads are off on your account ✅
            </p>
          ) : (
            <button
              type="button"
              disabled={!props.signedIn}
              onClick={() => setBuying("remove_ads")}
              className="mt-3 w-full rounded-full bg-[#14532d] py-3 text-base font-black text-white disabled:opacity-40"
            >
              Remove ads — $1.99
            </button>
          )}
        </article>
      </div>

      {buying && (
        <form
          className="mt-4 rounded-3xl bg-[var(--surface)] p-4 shadow"
          onSubmit={(e) => {
            e.preventDefault();
            buy.mutate(buying);
          }}
        >
          <h4 className="text-base font-black text-[var(--text)]">
            Checkout — {buying === "family_pass" ? "Full Family Pass $4.99" : "Remove Ads $1.99"}
          </h4>
          <label className="mt-3 block text-sm font-bold text-[var(--text)]" htmlFor="card-number">
            Card number (Stripe test card)
          </label>
          <input
            id="card-number"
            inputMode="numeric"
            className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-base text-[var(--text)]"
            value={card}
            onChange={(e) => setCard(e.target.value)}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-bold text-[var(--text)]" htmlFor="card-exp">
                Expiry
              </label>
              <input
                id="card-exp"
                className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-base text-[var(--text)]"
                placeholder="12/34"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-[var(--text)]" htmlFor="card-cvc">
                CVC
              </label>
              <input
                id="card-cvc"
                inputMode="numeric"
                className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-base text-[var(--text)]"
                placeholder="123"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={buy.isPending}
            className="mt-4 w-full rounded-full bg-[#ff6b4a] py-3 text-base font-black text-white disabled:opacity-50"
          >
            {buy.isPending ? "Processing…" : "Pay in test mode"}
          </button>
          <button
            type="button"
            onClick={() => setBuying(null)}
            className="mt-2 w-full rounded-full bg-[var(--bg)] py-2.5 text-sm font-black text-[var(--text)]"
          >
            Cancel
          </button>
        </form>
      )}
      {msg && (
        <p className="mt-3 rounded-xl bg-[#dcfce7] px-3 py-2 text-sm font-bold text-[#14532d]" role="status">
          {msg}
        </p>
      )}
      <p className="mt-4 text-xs text-[var(--dim)]">
        Ads only ever appear between games — never during a hand — and at
        launch they're house ads for the Family Pass. A real ad network can be
        connected after the game is published and approved.
      </p>
    </section>
  );
}

// ---------- Rules ----------

function RulesScreen({ onBack }: { onBack: () => void }) {
  const rules: [string, string][] = [
    ["Every player for themselves", "No teams, no partners. 4-player classic, or 3-player with the 2 of clubs taken out so everybody gets 17 cards."],
    ["Bid from 3", "Bidding starts at 3 books. There's no nil and no passing — everybody bids, every hand."],
    ["Spades are always trump", "Spades beat every other suit, and spades can be broken and led at any time — even led off on the very first trick."],
    ["The 2 of clubs opens", "In a 4-player game, whoever holds the 2 of clubs leads it to start the first trick of the game."],
    ["Beat the card on the table", "You must follow the suit that was led when you can — and if a card you hold can beat the card currently winning the trick, you have to play a card that beats it. No holding back your winner."],
    ["Making your bid", "Hit your bid and you score bid ×10, plus 1 point for every extra book. Bid 5, take 6 books: 51 points."],
    ["Getting set", "Take fewer books than you bid and you lose bid ×10. Scores can go below zero — and you can still climb back and win."],
    ["The double set", "Careful: taking 3 or more books OVER your bid is sandbagging, and that's a double set — minus bid ×10, same as getting set. Bid honest."],
    ["First to 150 wins", "Hands keep dealing until somebody reaches 150 points."],
  ];
  return (
    <section className="pt-4">
      <BackBar title="How to Play" onBack={onBack} />
      <p className="mt-1 text-sm font-semibold text-[var(--dim)]">
        C.F.N.B. stands for “You can choose your family, but not your blood.”
        These are the house rules, exactly how the family plays them:
      </p>
      <div className="mt-4 space-y-3">
        {rules.map(([title, body], i) => (
          <article key={title} className="rounded-3xl bg-[var(--surface)] p-4 shadow">
            <h3 className="text-base font-black text-[var(--text)]">
              {i + 1}. {title}
            </h3>
            <p className="mt-1 text-sm text-[var(--dim)]">{body}</p>
          </article>
        ))}
      </div>
      <article className="mt-3 rounded-3xl bg-[#14532d] p-4 shadow">
        <h3 className="text-base font-black text-white">Table manners</h3>
        <p className="mt-1 text-sm font-semibold text-white/90">
          Chat is “Keep It Cool” moderated: a word filter and a tone check read
          every message before it posts, reports add strikes, and repeat
          offenders get an automatic 24-hour cool-down. Players under 13 chat
          with quick-talk phrases only. Voice chat at Family Room tables runs
          on the same standing: players on a cool-down can't join voice,
          under-13 players stay on quick-talk, voice reports add the same
          strikes, and anyone can mute themselves, silence another player, or
          turn voice off completely.
        </p>
      </article>
    </section>
  );
}

// ---------- Account ----------

function AccountScreen(props: {
  prof: Profile | null;
  token: string | null;
  guestName: string;
  onGuestName: (n: string) => void;
  onBack: () => void;
  onSignedIn: (token: string) => void;
  onSignOut: () => void;
}) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthYear, setBirthYear] = useState("1990");
  const [error, setError] = useState<string | null>(null);

  const signIn = useMutation({
    mutationFn: () => api.signIn({ email, password }),
    onSuccess: (res) => {
      if (res.token) {
        setError(null);
        props.onSignedIn(res.token);
      } else setError(res.profile.error ?? "Sign-in failed.");
    },
    onError: () => setError("Sign-in hiccup — try again."),
  });
  const signUp = useMutation({
    mutationFn: () =>
      api.signUp({
        name,
        email,
        password,
        birthYear: Number(birthYear) || 1990,
      }),
    onSuccess: (res) => {
      if (res.token) {
        setError(null);
        props.onSignedIn(res.token);
      } else setError(res.profile.error ?? "Sign-up failed.");
    },
    onError: () => setError("Sign-up hiccup — try again."),
  });

  if (props.prof) {
    return (
      <section className="pt-4">
        <BackBar title="My Account" onBack={props.onBack} />
        <div className="mt-4 rounded-3xl bg-[var(--surface)] p-5 shadow">
          <p className="text-2xl font-black text-[var(--text)]">
            Hey, {props.prof.name} 👋
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--dim)]">
            {props.prof.email}
            {props.prof.under13 && " · Under-13 player: quick-talk chat only"}
            {props.prof.muted && " · Chat cool-down in effect"}
          </p>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-[var(--bg)] p-3">
              <dt className="text-[11px] font-black uppercase tracking-wide text-[var(--dim)]">Games</dt>
              <dd className="text-xl font-black text-[var(--text)]">{props.prof.gamesPlayed}</dd>
            </div>
            <div className="rounded-2xl bg-[var(--bg)] p-3">
              <dt className="text-[11px] font-black uppercase tracking-wide text-[var(--dim)]">Wins</dt>
              <dd className="text-xl font-black text-[var(--text)]">{props.prof.totalWins}</dd>
            </div>
            <div className="rounded-2xl bg-[var(--bg)] p-3">
              <dt className="text-[11px] font-black uppercase tracking-wide text-[var(--dim)]">Chapters</dt>
              <dd className="text-xl font-black text-[var(--text)]">{props.prof.chapters.length}/8</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm font-semibold text-[var(--dim)]">
            {props.prof.hasFamilyPass
              ? "Full Family Pass: owned ✅"
              : "Full Family Pass: not yet — find it in the Store."}
            {" · "}
            {props.prof.hasRemoveAds ? "Ads: off ✅" : "Ads: on between games"}
          </p>
          <p className="mt-2 text-sm text-[var(--dim)]">
            Your progress, unlocks, and purchases live on this account, so
            they follow you across phone and PC wherever you sign in.
          </p>
          <button
            type="button"
            onClick={props.onSignOut}
            className="mt-4 w-full rounded-full bg-[var(--bg)] py-3 text-base font-black text-[var(--text)]"
          >
            Sign out
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="pt-4">
      <BackBar title="Account" onBack={props.onBack} />
      <div className="mt-4 rounded-3xl bg-[var(--surface)] p-5 shadow">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Sign in or sign up">
          <button
            type="button"
            aria-pressed={mode === "in"}
            onClick={() => setMode("in")}
            className={`rounded-full py-2.5 text-sm font-black ${mode === "in" ? "bg-[#14532d] text-white" : "bg-[var(--bg)] text-[var(--text)]"}`}
          >
            Sign in
          </button>
          <button
            type="button"
            aria-pressed={mode === "up"}
            onClick={() => setMode("up")}
            className={`rounded-full py-2.5 text-sm font-black ${mode === "up" ? "bg-[#14532d] text-white" : "bg-[var(--bg)] text-[var(--text)]"}`}
          >
            Sign up
          </button>
        </div>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === "in") signIn.mutate();
            else signUp.mutate();
          }}
        >
          {mode === "up" && (
            <>
              <div>
                <label className="block text-sm font-bold text-[var(--text)]" htmlFor="acct-name">
                  Table name
                </label>
                <input
                  id="acct-name"
                  required
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-base text-[var(--text)]"
                  value={name}
                  maxLength={40}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-[var(--text)]" htmlFor="acct-birth">
                  Birth year (sets the under-13 chat safety)
                </label>
                <input
                  id="acct-birth"
                  required
                  inputMode="numeric"
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-base text-[var(--text)]"
                  value={birthYear}
                  maxLength={4}
                  onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-bold text-[var(--text)]" htmlFor="acct-email">
              Email
            </label>
            <input
              id="acct-email"
              type="email"
              required
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-base text-[var(--text)]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-[var(--text)]" htmlFor="acct-pass">
              Password {mode === "up" && "(6+ characters)"}
            </label>
            <input
              id="acct-pass"
              type="password"
              required
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-base text-[var(--text)]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p className="rounded-lg bg-[#fee2e2] px-3 py-2 text-sm font-semibold text-[#7f1d1d]" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={signIn.isPending || signUp.isPending}
            className="w-full rounded-full bg-[#ff6b4a] py-3 text-base font-black text-white disabled:opacity-50"
          >
            {mode === "in" ? "Sign in" : "Create my account"}
          </button>
        </form>
        <button
          type="button"
          disabled
          className="mt-3 w-full cursor-not-allowed rounded-full bg-[var(--bg)] py-3 text-base font-black text-[var(--dim)]"
          aria-label="Continue with Google (activates at publish)"
        >
          Continue with Google — activates when the game is published
        </button>
        <p className="mt-2 text-xs text-[var(--dim)]">
          Google sign-in needs the game's own Google app, which gets connected
          when the game is published to its own site. Email sign-up works right
          now.
        </p>
      </div>

      <div className="mt-3 rounded-3xl bg-[var(--surface)] p-4 shadow">
        <label className="block text-sm font-black text-[var(--text)]" htmlFor="guest-name">
          Just visiting? Guest table name
        </label>
        <input
          id="guest-name"
          className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-base text-[var(--text)]"
          value={props.guestName}
          maxLength={40}
          onChange={(e) => props.onGuestName(e.target.value)}
        />
        <p className="mt-1 text-xs text-[var(--dim)]">
          Guests can play everything free and chat in the Lounge. Guest
          progress stays on this device; an account carries it everywhere.
        </p>
      </div>
    </section>
  );
}

// ---------- Look / cosmetics ----------

function LookScreen(props: {
  deckId: string;
  feltId: string;
  myDecks: string[];
  myFelts: string[];
  onChange: (look: { deckId: string; feltId: string }) => void;
  onBack: () => void;
}) {
  return (
    <section className="pt-4">
      <BackBar title="My Look" onBack={props.onBack} />
      <p className="mt-1 text-sm text-[var(--dim)]">
        Card backs and felts are earned, not given: win Story chapters and
        games to unlock them — or open them all with the Family Pass.
      </p>
      <h3 className="mt-5 text-lg font-black text-[var(--text)]">Card backs</h3>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {DECKS.map((d) => {
          const owned = props.myDecks.includes(d.id);
          const active = props.deckId === d.id;
          return (
            <button
              key={d.id}
              type="button"
              disabled={!owned}
              aria-pressed={active}
              onClick={() => props.onChange({ deckId: d.id, feltId: props.feltId })}
              className={`rounded-3xl bg-[var(--surface)] p-3 text-left shadow ${active ? "ring-4 ring-[#f5b942]" : ""} ${owned ? "" : "opacity-55"}`}
            >
              <span
                className="block h-16 rounded-xl border border-black/10"
                style={{ background: d.back }}
                aria-hidden="true"
              />
              <span className="mt-2 block text-sm font-black text-[var(--text)]">
                {d.name} {active && "· in use"}
              </span>
              <span className="block text-xs font-semibold text-[var(--dim)]">
                {owned ? d.how : `🔒 ${d.how}`}
              </span>
            </button>
          );
        })}
      </div>
      <h3 className="mt-6 text-lg font-black text-[var(--text)]">Table felts</h3>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {FELTS.map((f) => {
          const owned = props.myFelts.includes(f.id);
          const active = props.feltId === f.id;
          return (
            <button
              key={f.id}
              type="button"
              disabled={!owned}
              aria-pressed={active}
              onClick={() => props.onChange({ deckId: props.deckId, feltId: f.id })}
              className={`rounded-3xl bg-[var(--surface)] p-3 text-left shadow ${active ? "ring-4 ring-[#f5b942]" : ""} ${owned ? "" : "opacity-55"}`}
            >
              <span
                className="block h-16 rounded-xl border border-black/10"
                style={{ background: f.css }}
                aria-hidden="true"
              />
              <span className="mt-2 block text-sm font-black text-[var(--text)]">
                {f.name} {active && "· in use"}
              </span>
              <span className="block text-xs font-semibold text-[var(--dim)]">
                {owned ? f.how : `🔒 ${f.how}`}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
