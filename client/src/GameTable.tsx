import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  CAST,
  CHAPTERS,
  DECKS,
  FELTS,
  RANK_LABEL,
  SUIT_SYMBOL,
  aiBid,
  aiPlay,
  buildDeck,
  legalPlays,
  scoreHand,
  shuffle,
  sortHand,
  winningIndex,
  type CardT,
  type Character,
  type Difficulty,
  type Suit,
} from "./game";
import { ChatPanel } from "./ChatPanel";
import { VoicePanel } from "./VoicePanel";

export interface GameConfig {
  mode: "quick" | "story" | "room";
  playerCount: 3 | 4;
  difficulty: Difficulty;
  opponentIds: string[];
  chapter: number | null;
  chapterName: string | null;
  roomCode: string | null;
  roomSeatNames: string[];
}

interface Seat {
  name: string;
  character: Character | null;
  isHuman: boolean;
}

interface PlayedCard {
  player: number;
  card: CardT;
}

interface HandSummary {
  name: string;
  bid: number;
  books: number;
  points: number;
  note: string;
}

interface GameTableProps {
  config: GameConfig;
  playerName: string;
  deckId: string;
  feltId: string;
  chatToken: string | null;
  chatUnder13: boolean;
  onExit: () => void;
  onGameEnd: (playerWon: boolean) => void;
}

/* ---------- Suit styling: color-coded for instant reading ---------- */
const SUIT_META: Record<Suit, { name: string; color: string; softBg: string }> = {
  spades: { name: "Spades", color: "#111113", softBg: "#e4e4e7" },
  hearts: { name: "Hearts", color: "#b91c1c", softBg: "#fee2e2" },
  diamonds: { name: "Diamonds", color: "#1d4ed8", softBg: "#dbeafe" },
  clubs: { name: "Clubs", color: "#166534", softBg: "#dcfce7" },
};

function fullCardName(card: CardT): string {
  const rank = RANK_LABEL[card.rank] ?? String(card.rank);
  const rankName =
    card.rank === 14 ? "Ace" : card.rank === 13 ? "King" : card.rank === 12 ? "Queen" : card.rank === 11 ? "Jack" : rank;
  return `${rankName} of ${SUIT_META[card.suit].name}`;
}

/* ---------- Big, clear playing card ----------
   Every card face is three stacked zones in normal flow — nothing is
   absolutely positioned over anything else, so no element can cover
   another:
   1. Top zone: big rank at the top-left on a tinted chip, small suit pip
      directly under it. This zone is reserved height; the center pip
      starts below it and can never reach the rank.
   2. Middle zone: the big center suit pip, in its own flex-1 area.
   3. Bottom zone: the full suit name on its own full-width band, sized
      so even DIAMONDS fits the narrowest hand card without truncation.
   Hand cards also reserve a short empty strip at the very foot of the
   card: the PLAY tag sits in that strip, below the suit name, instead of
   across the top where it covered the rank. There is deliberately NO
   rotated bottom corner index — its upside-down pip used to land on top
   of the suit name and its rank read as clutter. */
function CardFace({
  card,
  deckFace,
  variant = "hand",
  isWinning = false,
}: {
  card: CardT;
  deckFace: string;
  variant?: "hand" | "trick" | "small";
  isWinning?: boolean;
}) {
  const meta = SUIT_META[card.suit];
  const symbol = SUIT_SYMBOL[card.suit];
  const rank = RANK_LABEL[card.rank] ?? String(card.rank);
  const isTrick = variant === "trick";
  const isSmall = variant === "small";

  if (isSmall) {
    return (
      <div
        className="flex h-14 w-10 flex-col items-center justify-center rounded-lg border-2 font-black shadow-[0_1px_2px_rgba(0,0,0,0.25),0_4px_10px_rgba(0,0,0,0.22)] antialiased"
        style={{ background: deckFace, color: meta.color, borderColor: meta.color }}
        aria-label={fullCardName(card)}
      >
        <span className="text-base leading-none">{rank}</span>
        <span className="text-lg leading-none">{symbol}</span>
      </div>
    );
  }

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-xl border-2 bg-white font-black antialiased shadow-[0_1px_2px_rgba(0,0,0,0.22),0_6px_16px_rgba(0,0,0,0.28),inset_0_0_0_1px_rgba(255,255,255,0.9)] ${
        isTrick ? "h-[128px] w-[96px] sm:h-[140px] sm:w-[104px]" : "h-full w-full"
      } ${isWinning ? "ring-4 ring-[#ffcf33] shadow-[0_0_0_1px_#b45309,0_0_18px_rgba(255,209,102,0.85),0_6px_16px_rgba(0,0,0,0.28)]" : ""}`}
      style={{
        background: `linear-gradient(160deg, #ffffff 0%, ${deckFace} 55%, #ffffff 100%)`,
        borderColor: isWinning ? "#d97706" : "#9c8b6a",
        color: meta.color,
      }}
      aria-label={fullCardName(card)}
      role="img"
    >
      {/* Zone 1 — rank chip, top-left: rank big, small pip under it.
          The crown for a winning trick card sits inline at the top-right
          of this same row, never over the rank. */}
      <div className="relative z-10 flex shrink-0 items-start justify-between px-1 pt-0.5">
        <div
          className="flex flex-col items-center rounded-md px-1 py-px leading-none shadow-[0_1px_2px_rgba(0,0,0,0.14)] ring-1 ring-inset ring-black/15"
          style={{ background: meta.softBg }}
        >
          <span className={`${isTrick ? "text-[28px] sm:text-[30px]" : "text-[20px] sm:text-[24px]"} leading-none`}>{rank}</span>
          <span className={`${isTrick ? "text-[17px] sm:text-[19px]" : "text-[12px] sm:text-[16px]"} leading-none`}>{symbol}</span>
        </div>
        {isWinning && (
          <span className="rounded-full bg-[#ffd166] px-1 py-0.5 text-[10px] leading-none shadow" aria-hidden="true">
            👑
          </span>
        )}
      </div>

      {/* Zone 2 — big center pip, in its own space between the zones */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-1" aria-hidden="true">
        <span className={`${isTrick ? "text-[48px] sm:text-[54px]" : "text-[22px] sm:text-[34px]"} leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]`}>{symbol}</span>
      </div>

      {/* Zone 3 — suit name band: full width, one line, never truncated.
          No tracking on hand cards so DIAMONDS fits at phone width. */}
      <div className="relative z-10 shrink-0 px-1 pb-0.5">
        <span
          className={`block w-full whitespace-nowrap rounded-full py-px text-center font-black uppercase leading-tight ring-1 ring-inset ring-black/10 ${
            isTrick ? "text-[9px] tracking-[0.12em]" : "text-[8px] tracking-normal sm:text-[9px]"
          }`}
          style={{ background: meta.softBg, color: meta.color }}
        >
          {meta.name}
        </span>
      </div>

      {/* Hand cards only: reserved empty strip at the foot of the card
          where the PLAY tag sits — below the suit name, clear of the rank,
          the center pip, and the name. */}
      {!isTrick && <div className="h-[16px] shrink-0" aria-hidden="true" />}
    </div>
  );
}

/* ---------- Clowning lines ---------- */
const WIN_BUBBLES: { emoji: string; text: string }[] = [
  { emoji: "😂", text: "Gotcha! That's MY book!" },
  { emoji: "🔥", text: "Told y'all — too easy!" },
  { emoji: "😎", text: "Just like I planned it." },
  { emoji: "👏", text: "Write that one down!" },
];
const LOSE_BUBBLES: { emoji: string; text: string }[] = [
  { emoji: "😲", text: "Ouch! You got me that time!" },
  { emoji: "👀", text: "Okay, okay — I see you!" },
  { emoji: "😅", text: "Lucky... real lucky." },
  { emoji: "🤣", text: "Alright, laugh it up!" },
];
const COMEBACKS = [
  "Oh, you think that's funny? Watch this! 👀",
  "Laugh now — my spades are coming! ♠",
  "Keep clowning, I'm about to cook! 🔥",
  "Big talk! Let's see your next card!",
];

const PLAYER_REACTIONS: { emoji: string; label: string }[] = [
  { emoji: "😂", label: "Laugh" },
  { emoji: "🔥", label: "Fire — that was hot" },
  { emoji: "👀", label: "Eyes — I see you" },
  { emoji: "😲", label: "Shocked" },
  { emoji: "👏", label: "Clap" },
  { emoji: "🎉", label: "Celebrate" },
];

type Bubble = { emoji: string; text: string; id: number };

/* ---------- Seat pill: cartoon avatar + name, bid, books, points ---------- */
function SeatPill({
  seat,
  bid,
  books,
  score,
  isTurn,
  isWinning,
  mood,
  layout,
  reaction,
}: {
  seat: Seat;
  bid: number | null;
  books: number;
  score: number;
  isTurn: boolean;
  isWinning: boolean;
  mood: string;
  layout: "row" | "col";
  reaction?: string | null;
}) {
  const col = layout === "col";
  return (
    <div className={`${col ? "w-[72px] shrink-0" : ""}`}>
      <div
        className={`flex rounded-2xl bg-black/60 shadow-[0_2px_8px_rgba(0,0,0,0.35)] ring-2 backdrop-blur-[2px] transition-shadow duration-300 ${
          col ? "flex-col items-center px-0.5 py-px" : "items-center gap-1 px-1.5 py-px"
        } ${isTurn ? "shadow-[0_0_0_1px_rgba(180,83,9,0.7),0_0_14px_rgba(255,209,102,0.8)] ring-[#ffcf33]" : isWinning ? "ring-emerald-200" : "ring-white/40"}`}
      >
        <div className="relative shrink-0">
          {seat.character?.img ? (
            <img
              src={seat.character.img}
              alt={`Portrait of ${seat.name}`}
              className="h-[22px] w-[22px] select-none rounded-full object-cover shadow-md ring-2 ring-white"
              style={{ filter: "contrast(1.07) saturate(1.08)" }}
              draggable={false}
            />
          ) : (
            <div
              className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-gradient-to-br from-[#ffd166] to-[#ff6b35] text-[11px] font-black text-[#431407] shadow-md ring-2 ring-white"
              aria-label={`Your seat at the table`}
            >
              {seat.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <span
            className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9px] shadow-md ring-1 ring-[#b8912a]"
            aria-hidden="true"
            title="Current expression"
          >
            {mood}
          </span>
          {reaction && (
            <span className="absolute -left-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9px] shadow-md ring-2 ring-[#ffd166] motion-safe:animate-bounce" aria-hidden="true">
              {reaction}
            </span>
          )}
        </div>
        {col ? (
          <div className="w-full text-center">
            <p className="text-[9px] font-black leading-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.65)]">{seat.name}</p>
            <p className="text-[8px] font-bold leading-tight text-white/95 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
              Bid {bid ?? "–"} · Bk {books} · {score} pts
            </p>
          </div>
        ) : (
          <div className="min-w-0 text-left">
            <p className="max-w-[150px] truncate text-[12px] font-black leading-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.65)]">{seat.name}</p>
            <p className="text-[9px] font-bold leading-tight text-white/95 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
              Bid {bid ?? "–"} · Books {books} · {score} pts
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Where each seat sits around the ring ---------- */
type Slot = "top" | "bottom" | "left" | "right" | "topleft" | "topright";

function slotFor(playerCount: number, idx: number): Slot {
  if (playerCount === 3) {
    return idx === 0 ? "bottom" : idx === 1 ? "topleft" : "topright";
  }
  return idx === 0 ? "bottom" : idx === 1 ? "left" : idx === 2 ? "top" : "right";
}

function slotGrid(slot: Slot): CSSProperties {
  switch (slot) {
    case "top":
      return { gridColumn: "2", gridRow: "1" };
    case "bottom":
      return { gridColumn: "2", gridRow: "3" };
    case "left":
      return { gridColumn: "1", gridRow: "2" };
    case "right":
      return { gridColumn: "3", gridRow: "2" };
    case "topleft":
      return { gridColumn: "1", gridRow: "1" };
    case "topright":
      return { gridColumn: "3", gridRow: "1" };
  }
}

export function GameTable({
  config,
  playerName,
  deckId,
  feltId,
  chatToken,
  chatUnder13,
  onExit,
  onGameEnd,
}: GameTableProps) {
  const n = config.playerCount;
  const deck = DECKS.find((d) => d.id === deckId) ?? (DECKS[0] as (typeof DECKS)[number]);
  const felt = FELTS.find((f) => f.id === feltId) ?? (FELTS[0] as (typeof FELTS)[number]);
  const chapter = config.chapter != null ? CHAPTERS.find((c) => c.n === config.chapter) : undefined;

  const seats: Seat[] = useMemo(() => {
    const out: Seat[] = [{ name: playerName, character: null, isHuman: true }];
    for (let i = 0; i < n - 1; i++) {
      const roomName = config.roomSeatNames[i + 1];
      const charId = config.opponentIds[i];
      const character = CAST.find((c) => c.id === charId) ?? CAST[i % CAST.length] ?? null;
      out.push({
        name: roomName ?? character?.name ?? `Player ${i + 2}`,
        character,
        isHuman: false,
      });
    }
    return out;
  }, [config, n, playerName]);

  const [phase, setPhase] = useState<"bidding" | "playing" | "handEnd" | "gameEnd">("bidding");
  const [hands, setHands] = useState<CardT[][]>([]);
  const [bids, setBids] = useState<(number | null)[]>(Array(n).fill(null));
  const [books, setBooks] = useState<number[]>(Array(n).fill(0));
  const [scores, setScores] = useState<number[]>(Array(n).fill(0));
  const [trick, setTrick] = useState<PlayedCard[]>([]);
  const [current, setCurrent] = useState(0);
  const [leader, setLeader] = useState(0);
  const [handNumber, setHandNumber] = useState(1);
  const [tricksPlayed, setTricksPlayed] = useState(0);
  const [summary, setSummary] = useState<HandSummary[] | null>(null);
  const [talk, setTalk] = useState<{ name: string; text: string } | null>(null);
  const [bubbles, setBubbles] = useState<Record<number, Bubble>>({});
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const endFired = useRef(false);
  const scoresRef = useRef<number[]>(Array(n).fill(0));
  const bubbleTimer = useRef<number | null>(null);

  function showBubble(seatIdx: number, emoji: string, text: string) {
    const id = Date.now() + Math.random();
    setBubbles((b) => ({ ...b, [seatIdx]: { emoji, text, id } }));
    window.setTimeout(() => {
      setBubbles((b) => {
        if (b[seatIdx]?.id !== id) return b;
        const next = { ...b };
        delete next[seatIdx];
        return next;
      });
    }, 3400);
  }

  function deal(handNo: number, baseScores: number[]) {
    const cards = shuffle(buildDeck(n as 3 | 4));
    const dealt: CardT[][] = Array.from({ length: n }, () => []);
    cards.forEach((c, i) => {
      (dealt[i % n] as CardT[]).push(c);
    });
    const sorted = dealt.map(sortHand);
    let lead = (handNo - 1) % n;
    if (n === 4 && handNo === 1) {
      sorted.forEach((h, pi) => {
        if (h.some((c) => c.suit === "clubs" && c.rank === 2)) lead = pi;
      });
    }
    setHands(sorted);
    setBids(Array(n).fill(null));
    setBooks(Array(n).fill(0));
    setTrick([]);
    setTricksPlayed(0);
    setSummary(null);
    setLeader(lead);
    setCurrent(lead);
    setPhase("bidding");
    setTalk(null);
    setBubbles({});
    setMyReaction(null);
    scoresRef.current = baseScores;
  }

  useEffect(() => {
    deal(1, Array(n).fill(0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myLegal: CardT[] = useMemo(() => {
    if (phase !== "playing" || current !== 0) return [];
    const hand = hands[0] ?? [];
    let legal = legalPlays(hand, trick);
    if (n === 4 && handNumber === 1 && tricksPlayed === 0 && trick.length === 0) {
      const two = hand.find((c) => c.suit === "clubs" && c.rank === 2);
      if (two) legal = [two];
    }
    return legal;
  }, [phase, current, hands, trick, n, handNumber, tricksPlayed]);

  function isMyLegal(card: CardT): boolean {
    return myLegal.some((c) => c.suit === card.suit && c.rank === card.rank);
  }

  function maybeTalk(playerIdx: number) {
    const seat = seats[playerIdx];
    if (seat?.character && Math.random() < 0.55) {
      const lines = seat.character.lines;
      const line = lines[Math.floor(Math.random() * lines.length)];
      if (line) {
        setTalk({ name: seat.character.name, text: line });
        showBubble(playerIdx, "💬", line);
      }
    }
  }

  function applyBid(player: number, bid: number) {
    const next = [...bids];
    next[player] = bid;
    setBids(next);
    // Expression on every bid — confident, clowning energy
    if (player !== 0) {
      const emojis = ["😏", "😎", "🔥", "👀"];
      showBubble(player, emojis[Math.floor(Math.random() * emojis.length)] ?? "😏", `I bid ${bid}! Watch me work.`);
    } else {
      showBubble(0, "💪", `You bid ${bid} — let's eat!`);
    }
    if (next.every((b) => b != null)) {
      setPhase("playing");
      setCurrent(leader);
    } else {
      setCurrent((player + 1) % n);
    }
  }

  function applyPlay(player: number, card: CardT) {
    const newHands = hands.map((h, i) =>
      i === player ? h.filter((c) => !(c.suit === card.suit && c.rank === card.rank)) : h,
    );
    const newTrick = [...trick, { player, card }];
    setHands(newHands);
    if (newTrick.length < n) {
      setTrick(newTrick);
      setCurrent((player + 1) % n);
      return;
    }
    setTrick(newTrick);
    const winPos = winningIndex(newTrick);
    const winner = (newTrick[winPos] as PlayedCard).player;
    window.setTimeout(() => {
      const newBooks = [...books];
      newBooks[winner] = (newBooks[winner] ?? 0) + 1;
      setBooks(newBooks);
      setTrick([]);
      setTricksPlayed((t) => t + 1);

      // Winner clowns, a loser reacts — the table feels alive
      const winB = WIN_BUBBLES[Math.floor(Math.random() * WIN_BUBBLES.length)] ?? WIN_BUBBLES[0]!;
      showBubble(winner, winB.emoji, winB.text);
      const losers = newTrick.map((t) => t.player).filter((p) => p !== winner);
      const loser = losers[Math.floor(Math.random() * losers.length)];
      if (loser != null && Math.random() < 0.7) {
        const loseB = LOSE_BUBBLES[Math.floor(Math.random() * LOSE_BUBBLES.length)] ?? LOSE_BUBBLES[0]!;
        window.setTimeout(() => showBubble(loser, loseB.emoji, loseB.text), 500);
      }
      maybeTalk(winner);

      const tricksTotal = (newHands[0] ?? []).length === 0;
      if (tricksTotal) {
        finishHand(newBooks);
      } else {
        setLeader(winner);
        setCurrent(winner);
      }
    }, 1100);
  }

  function finishHand(finalBooks: number[]) {
    const rows: HandSummary[] = seats.map((s, i) => {
      const bid = bids[i] ?? 3;
      const bk = finalBooks[i] ?? 0;
      const { points, note } = scoreHand(bid, bk);
      return { name: s.name, bid, books: bk, points, note };
    });
    const newScores = scoresRef.current.map((s, i) => s + (rows[i]?.points ?? 0));
    scoresRef.current = newScores;
    setScores(newScores);
    setSummary(rows);
    const top = Math.max(...newScores);
    if (top >= 150) {
      setPhase("gameEnd");
      if (!endFired.current) {
        endFired.current = true;
        const winnerIdx = newScores.indexOf(top);
        onGameEnd(winnerIdx === 0);
      }
    } else {
      setPhase("handEnd");
    }
  }

  useEffect(() => {
    if (phase === "bidding" && current !== 0 && bids[current] == null) {
      const t = window.setTimeout(() => {
        applyBid(current, aiBid(hands[current] ?? [], config.difficulty));
      }, 700);
      return () => window.clearTimeout(t);
    }
    if (phase === "playing" && current !== 0 && trick.length < n) {
      const t = window.setTimeout(() => {
        const hand = hands[current] ?? [];
        if (hand.length === 0) return;
        let card = aiPlay(hand, trick, config.difficulty);
        if (n === 4 && handNumber === 1 && tricksPlayed === 0 && trick.length === 0) {
          const two = hand.find((c) => c.suit === "clubs" && c.rank === 2);
          if (two) card = two;
        }
        applyPlay(current, card);
      }, 800);
      return () => window.clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, current, bids, trick, hands]);

  function onPlayerReact(emoji: string, label: string) {
    setMyReaction(emoji);
    showBubble(0, emoji, label === "Laugh" ? "😂 You clownin'!" : `${emoji} ${label}!`);
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setMyReaction(null), 2600);
    // An opponent clowns back
    const oppIdx = 1 + Math.floor(Math.random() * (n - 1));
    const comeback = COMEBACKS[Math.floor(Math.random() * COMEBACKS.length)] ?? COMEBACKS[0]!;
    window.setTimeout(() => showBubble(oppIdx, "👀", comeback), 650);
  }

  const winnerIdx = phase === "gameEnd" ? scores.indexOf(Math.max(...scores)) : -1;
  const trickWinPos = trick.length > 0 ? winningIndex(trick) : -1;
  const trickWinPlayer = trickWinPos >= 0 ? trick[trickWinPos]?.player : undefined;
  const trickWinCard = trickWinPos >= 0 ? trick[trickWinPos]?.card : undefined;
  const leadingScore = Math.max(...scores, 0);

  // Player's hand is already sorted by suit; deal it into short rows that
  // always fit on one phone screen with the table: at most five cards per
  // row in a 4-player game (13 cards = 3 rows), six per row in a 3-player
  // game (17 cards = 3 rows). Every card stays wide and readable with a
  // real gap beside it instead of shrinking or overlapping.
  const myHand = hands[0] ?? [];
  const perRow = n === 3 ? 6 : 5;
  const rowCount = Math.max(1, Math.ceil(myHand.length / perRow));
  const handRows: CardT[][] = [];
  if (myHand.length > 0) {
    const base = Math.floor(myHand.length / rowCount);
    let rem = myHand.length % rowCount;
    let start = 0;
    for (let r = 0; r < rowCount; r++) {
      const size = base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem--;
      const row = myHand.slice(start, start + size);
      if (row.length > 0) handRows.push(row);
      start += size;
    }
  }

  function moodEmoji(idx: number): string {
    if (bubbles[idx]) return bubbles[idx]!.emoji;
    if (current === idx && (phase === "playing" || phase === "bidding")) return "🤔";
    if (trickWinPlayer === idx) return "😎";
    if ((books[idx] ?? 0) > 0 && (books[idx] ?? 0) >= Math.max(...books)) return "😏";
    return "🙂";
  }

  function resultBadge(row: HandSummary): { label: string; cls: string } {
    if (row.note.toLowerCase().includes("double")) return { label: "💥 DOUBLE SET", cls: "bg-purple-600 text-white" };
    if (row.points < 0) return { label: "😲 SET", cls: "bg-red-600 text-white" };
    if (row.note.includes("+")) return { label: "🎉 MADE IT + OVER", cls: "bg-emerald-600 text-white" };
    return { label: "✅ MADE IT", cls: "bg-emerald-600 text-white" };
  }

  function renderPill(idx: number, layout: "row" | "col") {
    const seat = seats[idx];
    if (!seat) return null;
    return (
      <SeatPill
        key={seat.name}
        seat={seat}
        bid={bids[idx] ?? null}
        books={books[idx] ?? 0}
        score={scores[idx] ?? 0}
        isTurn={current === idx && phase !== "handEnd" && phase !== "gameEnd"}
        isWinning={trickWinPlayer === idx && trick.length > 0}
        mood={moodEmoji(idx)}
        layout={layout}
        reaction={idx === 0 ? myReaction : null}
      />
    );
  }

  // Only the freshest bubble shows, so the talk row stays one line tall
  // and never eats the room reserved for the hand.
  const bubbleList = seats
    .map((seat, idx) => ({ seat, idx, bubble: bubbles[idx] }))
    .filter((x): x is { seat: Seat; idx: number; bubble: Bubble } => !!x.bubble)
    .slice(-1);

  const bannerText =
    phase === "bidding"
      ? current === 0
        ? "Your bid — tap a number in the middle. Minimum 3."
        : `${seats[current]?.name ?? "Player"} is bidding…`
      : phase === "playing"
        ? current === 0
          ? trick.length === 0
            ? "Your lead — tap a gold-ring card to play it."
            : "Your turn — beat the card on the table if you can."
          : `${seats[current]?.name ?? "Player"} is playing…`
        : phase === "handEnd"
          ? "Hand over — here's how it scored."
          : "That's the game!";

  const myTurnToPlay = phase === "playing" && current === 0;

  return (
    <div className="mx-auto w-full max-w-[540px] px-1.5 pb-3">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 py-0.5">
        <button
          type="button"
          onClick={onExit}
          className="rounded-full bg-[#221812] px-3 py-1 text-[13px] font-black text-white shadow-md ring-2 ring-[#ffd166]"
        >
          ← Leave
        </button>
        <p className="min-w-0 flex-1 text-center text-[11px] font-black leading-tight text-[var(--text)]">
          {config.chapterName
            ? `Ch. ${config.chapter}: ${config.chapterName}`
            : config.mode === "room"
              ? `Family Room ${config.roomCode ?? ""}`
              : "Quick Play"}{" "}
          · Hand {handNumber} · First to 150
        </p>
        {config.mode === "room" && config.roomCode ? (
          <span className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={() => setShowChat((s) => !s)}
              className="rounded-full bg-[#14532d] px-3 py-1 text-[13px] font-black text-white shadow"
              aria-expanded={showChat}
            >
              💬 Chat
            </button>
            <button
              type="button"
              onClick={() => setShowVoice((s) => !s)}
              className="rounded-full bg-[#14532d] px-3 py-1 text-[13px] font-black text-white shadow"
              aria-expanded={showVoice}
            >
              🎤 Voice
            </button>
          </span>
        ) : (
          <span className="w-[74px]" />
        )}
      </div>

      {/* ===== THE TABLE: cream frame, gold trim, deep emerald felt ===== */}
      <div
        className="relative rounded-[2rem] bg-[#fdf6ec] p-[3px] shadow-2xl sm:p-1"
        style={{ boxShadow: "0 0 0 1px #7a5c14, 0 0 0 4px #e6c65c, 0 0 0 5px #8a6d1f, 0 24px 48px rgba(0,0,0,0.42)" }}
      >
        <div
          className="relative rounded-[1.6rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_0_24px_rgba(0,0,0,0.18)] ring-2 ring-[#c9a227]"
          style={{ background: felt.css }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[1.6rem]"
            style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 58%, rgba(0,0,0,0.22) 100%)" }}
          />
          <div className="relative flex flex-col gap-[3px] px-1 pb-1 pt-0.5 sm:px-1.5 sm:pb-1.5 sm:pt-1">
            {/* 1 — Instruction banner, its own row */}
            <p className="rounded-full bg-black/55 px-2 py-[3px] text-center text-[11px] font-black leading-tight text-white shadow-[0_1px_4px_rgba(0,0,0,0.3)] ring-1 ring-white/30 [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]" role="status">
              {bannerText}
            </p>

            {/* 2 — Speech bubble, its own row. Never over a seat, card, or another bubble. */}
            <div
              className="flex min-h-[18px] flex-col items-center justify-center"
              aria-label="Table talk bubbles"
              aria-live="polite"
            >
              {bubbleList.length === 0 ? (
                <span className="text-[10px] font-bold text-white/60 [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">Table talk will show here</span>
              ) : (
                bubbleList.map(({ seat, bubble }) => (
                  <div
                    key={bubble.id}
                    className="cf-bubble-in w-full max-w-[320px] truncate rounded-xl bg-white px-2.5 py-0.5 text-center text-[11px] font-bold leading-snug text-[#221812] shadow-[0_4px_14px_rgba(0,0,0,0.3)] ring-2 ring-[#eab308]"
                    role="status"
                  >
                    <span className="mr-1" aria-hidden="true">{bubble.emoji}</span>
                    <span className="font-black">{seat.name}: </span>
                    {bubble.text}
                  </div>
                ))
              )}
            </div>

            {/* 3 — Opponent seat pills: one row of their own above the ring,
                spread across the width, clear of the table */}
            {n === 4 ? (
              <div className="flex items-start justify-between gap-2 px-0.5">
                {renderPill(1, "col")}
                {renderPill(2, "col")}
                {renderPill(3, "col")}
              </div>
            ) : (
              <div className="flex flex-wrap items-start justify-center gap-3">
                {renderPill(1, "row")}
                {renderPill(2, "row")}
              </div>
            )}

            {/* 4 — The ring alone with room around it */}
            <div className="flex items-center justify-center">
              <div
                className="shrink-0 rounded-full p-1 sm:p-2"
                style={{
                  background: "radial-gradient(circle, rgba(255,255,255,0.09) 0%, rgba(0,0,0,0.14) 78%)",
                  border: "4px solid #e6c65c",
                  boxShadow:
                    "inset 0 0 0 2px rgba(122,92,20,0.55), inset 0 0 0 6px rgba(0,0,0,0.2), inset 0 0 0 10px #c9a227, inset 0 0 0 12px rgba(122,92,20,0.9), 0 0 0 1px rgba(122,92,20,0.65), 0 2px 10px rgba(0,0,0,0.3)",
                }}
              >
                <div className="grid grid-cols-3 grid-rows-3 items-center justify-items-center gap-1" aria-label="Cards played on the table">
                  {/* Each played card gets its own grid cell — nothing overlaps */}
                  {seats.map((seat, idx) => {
                    const slot = slotFor(n, idx);
                    const played = trick.find((t) => t.player === idx);
                    const isWin = played != null && idx === trickWinPlayer;
                    return (
                      <div
                        key={played ? `${seat.name}-${played.card.suit}-${played.card.rank}` : seat.name}
                        className={`flex flex-col items-center gap-px ${played ? "cf-card-in" : ""}`}
                        style={slotGrid(slot)}
                      >
                        {played ? (
                          <>
                            <CardFace card={played.card} deckFace={deck.face} variant="trick" isWinning={isWin} />
                            <span className={`whitespace-nowrap rounded-full px-1.5 py-px text-[8px] font-black leading-tight shadow-md ${isWin ? "bg-[#ffd166] text-[#431407] ring-1 ring-[#b45309]/50" : "bg-black/70 text-white"}`}>
                              {isWin ? "👑 " : ""}{seat.name.split(" ")[0]}
                            </span>
                          </>
                        ) : phase === "bidding" ? (
                          <div className="flex h-9 items-center justify-center whitespace-nowrap rounded-lg border border-dashed border-white/45 bg-black/20 px-2 text-center">
                            <span className="text-[10px] font-black leading-tight text-white/85">{seat.name}</span>
                          </div>
                        ) : (
                          <div className="flex h-[128px] w-[96px] items-center justify-center rounded-lg border-2 border-dashed border-white/45 bg-black/20 px-0.5 text-center sm:h-[140px] sm:w-[104px]">
                            <span className="text-[10px] font-black leading-tight text-white/85">{seat.name}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* Center cell: the To beat pill lives here alone, never on a card */}
                  <div className="flex items-center justify-center" style={{ gridColumn: "2", gridRow: "2" }}>
                    {phase === "bidding" ? (
                      <span className="whitespace-nowrap rounded-full bg-[#fdf6ec] px-2 py-1 text-[10px] font-black text-[#221812] shadow-md ring-2 ring-[#b8912a]">
                        Bidding…
                      </span>
                    ) : trickWinCard ? (
                      <span className="flex flex-col items-center rounded-2xl bg-[#fdf6ec] px-1.5 py-1 text-center text-[10px] font-black leading-tight text-[#221812] shadow-md ring-2 ring-[#b8912a]">
                        To beat
                        <span style={{ color: SUIT_META[trickWinCard.suit].color }} className="text-[14px] leading-tight">
                          {(RANK_LABEL[trickWinCard.rank] ?? String(trickWinCard.rank)) + SUIT_SYMBOL[trickWinCard.suit]}
                        </span>
                      </span>
                    ) : (
                      <span className="whitespace-nowrap rounded-full bg-black/50 px-2 py-1 text-[10px] font-black text-white ring-1 ring-white/45">
                        {phase === "playing" ? "New trick" : "The table"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 5 — Your seat pill, own row below the ring */}
            <div className="flex justify-center">{renderPill(0, "row")}</div>

            {/* 6 — Bid picker, compact single row of its own (not inside the ring, not over any card) */}
            {phase === "bidding" && current === 0 && (
              <div className="rounded-2xl bg-[#fdf6ec] p-2 shadow-[0_10px_28px_rgba(0,0,0,0.35)] ring-2 ring-[#b8912a]">
                <p className="text-center text-[10px] font-black uppercase tracking-wide text-[#221812]">Your bid — min 3 · no nil · no passing</p>
                <div className="mt-1.5 grid grid-cols-8 gap-1">
                  {[3, 4, 5, 6, 7, 8, 9, 10].map((b) => (
                    <button
                      key={b}
                      type="button"
                      aria-label={`Bid ${b}`}
                      onClick={() => applyBid(0, b)}
                      className="h-9 rounded-full bg-gradient-to-b from-[#1a7a3c] to-[#14532d] text-sm font-black text-white shadow-[0_2px_6px_rgba(0,0,0,0.3)] ring-1 ring-[#b8912a] transition duration-150 ease-out active:scale-95"
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 7 — Your hand: own reserved section below the table. Space for all
                three rows is part of the one-screen layout — the whole hand is
                visible with the table, no scrolling to reach the bottom row. */}
            {(phase === "playing" || phase === "bidding") && (
              <div className="border-t border-white/25 pt-1">
                <p className="flex items-center justify-between px-0.5 text-[10px] font-black uppercase tracking-widest text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]">
                  <span>🃏 Your hand — sorted by suit</span>
                  <span>{myHand.length} cards</span>
                </p>
                {myHand.length === 0 ? (
                  <p className="py-4 text-center text-sm font-bold text-white/85">Dealing your cards…</p>
                ) : (
                  <div className="mt-0.5 flex flex-col gap-[3px]">
                    {handRows.map((row, ri) => (
                      <div
                        key={ri}
                        className="flex justify-center gap-[3px]"
                        role="group"
                        aria-label={`Your hand, row ${ri + 1} of ${handRows.length}`}
                      >
                        {row.map((card) => {
                          const legal = myTurnToPlay && isMyLegal(card);
                          return (
                            <button
                              key={`${card.suit}-${card.rank}`}
                              type="button"
                              disabled={!legal}
                              aria-label={
                                myTurnToPlay
                                  ? legal
                                    ? `Play ${fullCardName(card)}`
                                    : `${fullCardName(card)} — not a legal play, it cannot beat the card on the table`
                                  : fullCardName(card)
                              }
                              onClick={() => applyPlay(0, card)}
                              className={`relative aspect-[85/120] w-full min-w-0 max-w-[60px] flex-1 rounded-xl transition-all duration-200 ease-out focus:outline-none focus-visible:ring-4 focus-visible:ring-white motion-safe:active:scale-[0.97] sm:max-w-[76px] ${
                                legal
                                  ? "shadow-[0_0_0_3px_#ffcf33,0_0_0_4px_rgba(180,83,9,0.85),0_0_16px_rgba(255,209,102,0.8)]"
                                  : myTurnToPlay
                                    ? "opacity-50 saturate-50"
                                    : ""
                              }`}
                            >
                              <CardFace card={card} deckFace={deck.face} variant="hand" />
                              {legal && (
                                <span className="absolute bottom-0.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#ffd166] px-1.5 py-px text-[8px] font-black leading-tight text-[#431407] shadow-md ring-1 ring-[#b45309]/60">
                                  ▶ PLAY
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Hand end / game end — a card over the table, so nothing moves */}
        {(phase === "handEnd" || phase === "gameEnd") && summary && (
          <div className="absolute inset-0 z-40 flex items-center justify-center rounded-[2rem] bg-black/65 p-3">
            <div className="max-h-full w-full max-w-sm overflow-y-auto rounded-3xl bg-[var(--surface)] p-4 shadow-2xl ring-2 ring-[#ffd166]">
              {phase === "gameEnd" ? (
                <div className="text-center">
                  <p className="text-4xl" aria-hidden="true">{winnerIdx === 0 ? "🏆🎉" : "🃏"}</p>
                  <h3 className="mt-1.5 text-xl font-black text-[var(--text)]">
                    {winnerIdx === 0 ? "You took the table — 150! 👑" : `${seats[winnerIdx]?.name ?? "That's game"} reached 150 first`}
                  </h3>
                  <p className="mt-1 text-xs font-semibold text-[var(--dim)]">
                    Final scores: {seats.map((s, i) => `${s.name} ${scores[i] ?? 0}`).join(" · ")}
                  </p>
                </div>
              ) : (
                <h3 className="text-center text-xl font-black text-[var(--text)]">Hand {handNumber} is in the books 📖</h3>
              )}
              <ul className="mt-3 space-y-1.5">
                {summary.map((row, ri) => {
                  const badge = resultBadge(row);
                  const isMe = ri === 0;
                  return (
                    <li key={row.name} className={`flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-2xl px-3 py-2 text-[13px] ring-1 ${isMe ? "bg-[#fff7e0] ring-[#ffd166]" : "bg-[var(--bg)] ring-[var(--border)]"}`}>
                      <span className="flex items-center gap-1.5 font-black text-[var(--text)]">
                        {row.name}
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black tracking-wide ${badge.cls}`}>{badge.label}</span>
                      </span>
                      <span className="text-[var(--dim)]">Bid {row.bid} · {row.books} books</span>
                      <span className={`text-base font-black ${row.points >= 0 ? "text-[#14532d]" : "text-[#b91c1c]"}`}>{row.points >= 0 ? `+${row.points}` : row.points}</span>
                    </li>
                  );
                })}
              </ul>
              {phase === "handEnd" ? (
                <button
                  type="button"
                  className="mt-3.5 w-full rounded-full bg-gradient-to-b from-[#ff8a5c] to-[#ff6b4a] py-3 text-lg font-black text-white shadow-lg ring-2 ring-[#ffd166]/70 active:scale-[0.99]"
                  onClick={() => {
                    const nh = handNumber + 1;
                    setHandNumber(nh);
                    deal(nh, scoresRef.current);
                  }}
                >
                  ♠ Deal hand {handNumber + 1}
                </button>
              ) : (
                <div className="mt-3.5 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    className="rounded-full bg-[#14532d] px-5 py-2.5 text-base font-black text-white shadow"
                    onClick={() => {
                      endFired.current = false;
                      setScores(Array(n).fill(0));
                      setHandNumber(1);
                      deal(1, Array(n).fill(0));
                    }}
                  >
                    Run it back ▶
                  </button>
                  <button type="button" className="rounded-full bg-[var(--bg)] px-5 py-2.5 text-base font-black text-[var(--text)] shadow" onClick={onExit}>
                    Back to the house
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ===== Scoreboard — outside the felt, where it doesn't crowd the cards ===== */}
      <div
        className="mt-3 grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
        aria-label="Scoreboard"
      >
        {seats.map((s, i) => {
          const isLeader = (scores[i] ?? 0) === leadingScore && leadingScore > 0;
          return (
            <div
              key={s.name}
              className={`rounded-2xl px-2 py-1 text-center shadow ring-1 ${
                i === 0
                  ? "bg-[#fff7e0] ring-[#ffd166]"
                  : isLeader
                    ? "bg-emerald-700 text-white ring-[#ffd166]"
                    : "bg-[var(--surface)] ring-[var(--border)]"
              }`}
            >
              <p className={`truncate text-[11px] font-black ${i === 0 || isLeader ? "" : "text-[var(--text)]"} ${isLeader && i !== 0 ? "text-white" : ""}`}>
                {isLeader ? "👑 " : ""}{s.name}
              </p>
              <p className={`text-base font-black leading-tight ${isLeader && i !== 0 ? "text-white" : "text-[var(--text)]"}`}>{scores[i] ?? 0} pts</p>
              <p className={`text-[10px] font-bold leading-tight ${isLeader && i !== 0 ? "text-white/85" : "text-[var(--dim)]"}`}>
                Bid {bids[i] ?? "–"} · {books[i] ?? 0} books
              </p>
            </div>
          );
        })}
      </div>

      {/* Story Mode Mean Meter — outside the felt with the scoreboard */}
      {chapter && (
        <div className="mt-2 flex items-center gap-2 px-1" aria-label={`Mean Meter ${chapter.mean} percent`}>
          <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-[#b91c1c]">Mean Meter</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-black/15 ring-1 ring-black/10">
            <div className="h-full rounded-full bg-gradient-to-r from-[#ffd166] via-orange-500 to-red-600" style={{ width: `${chapter.mean}%` }} />
          </div>
          <span className="text-xs font-black text-[var(--text)]">{chapter.mean} 🔥</span>
          <span className="hidden min-w-0 flex-1 truncate text-[11px] font-semibold text-[var(--dim)] sm:block">{chapter.room}</span>
        </div>
      )}

      {/* Table talk — outside the felt */}
      {talk && (
        <p className="mt-2 rounded-2xl bg-[#221812] px-3.5 py-2 text-center text-[13px] font-semibold text-white shadow" role="status">
          <span className="font-black text-[#ffd166]">{talk.name}:</span> “{talk.text}”
        </p>
      )}

      {/* Quick-talk bar below the table */}
      <div className="mt-3 flex items-center justify-center gap-2" role="group" aria-label="Quick talk — send a table reaction">
        <span className="hidden text-[10px] font-black uppercase tracking-widest text-[var(--dim)] min-[400px]:block">Quick talk</span>
        {PLAYER_REACTIONS.map((r) => (
          <button
            key={r.emoji}
            type="button"
            aria-label={`React with ${r.label}`}
            onClick={() => onPlayerReact(r.emoji, r.label)}
            className={`flex h-10 w-10 items-center justify-center rounded-full text-[20px] shadow ring-2 transition active:scale-90 ${
              myReaction === r.emoji ? "scale-110 bg-[#ffd166] ring-[#221812]/30" : "bg-[var(--surface)] ring-[var(--border)]"
            }`}
          >
            <span aria-hidden="true">{r.emoji}</span>
          </button>
        ))}
      </div>

      {/* Room voice chat — below the table, mic off until the player joins */}
      {config.mode === "room" && config.roomCode && showVoice && (
        <div className="mt-4 rounded-3xl bg-[var(--surface)] p-4 shadow">
          <VoicePanel roomCode={config.roomCode} token={chatToken} displayName={playerName} />
        </div>
      )}

      {/* Room table chat */}
      {config.mode === "room" && config.roomCode && showChat && (
        <div className="mt-4 h-[380px] rounded-3xl bg-[var(--surface)] p-4 shadow">
          <ChatPanel scope="room" roomCode={config.roomCode} token={chatToken} displayName={playerName} under13={chatUnder13} />
        </div>
      )}
    </div>
  );
}
