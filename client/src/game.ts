// C.F.N.B. Cutthroat game engine — Al's house rules, exactly:
// - 3- or 4-player, every player for themselves. 3-player removes the 2 of
//   clubs so the deal breaks even (17 cards each).
// - Minimum bid is 3. No nil, no passing.
// - Spades are always trump and can be led at any time, even the first trick.
// - In 4-player games the holder of the 2 of clubs leads it to open trick 1.
// - You must follow suit if you can, and you must beat the card currently
//   winning the trick when you have a card that can.
// - Scoring: make your bid = bid x10 + 1 per extra book. Set = -bid x10.
//   Taking 3 or more over your bid is a double set = -bid x10.
// - First to 150 wins; scores can go negative.

import bigMamaImg from "./assets/big-mama.webp";
import auntiePearlImg from "./assets/auntie-pearl.webp";
import uncleRayImg from "./assets/uncle-ray.webp";
import bigMikeImg from "./assets/big-mike.webp";
import cousinJayImg from "./assets/cousin-jay.webp";
import cousinNayImg from "./assets/cousin-nay.webp";
import marcusImg from "./assets/marcus.webp";
import deeImg from "./assets/dee.webp";
import treyImg from "./assets/trey.webp";

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export interface CardT {
  suit: Suit;
  rank: number; // 2..14 (11 J, 12 Q, 13 K, 14 A)
}

export const SUIT_SYMBOL: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};
export const RANK_LABEL: Record<number, string> = {
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

export function cardLabel(c: CardT): string {
  return `${RANK_LABEL[c.rank] ?? c.rank}${SUIT_SYMBOL[c.suit]}`;
}

export type Difficulty = "friendly" | "spicy" | "cutthroat";

export interface Character {
  id: string;
  name: string;
  img: string | null;
  tagline: string;
  lines: string[];
}

export const CAST: Character[] = [
  {
    id: "big-mama",
    name: "Big Mama",
    img: bigMamaImg,
    tagline: "Runs this table. Always has.",
    lines: [
      "Baby, I taught this game to half the parish.",
      "Mmm-hmm. Play your little card.",
      "At my table, we eat AND we win.",
    ],
  },
  {
    id: "auntie-pearl",
    name: "Auntie Pearl",
    img: auntiePearlImg,
    tagline: "Sees every card. Says very little.",
    lines: [
      "I saw that hand before you picked it up.",
      "Pearls on, game face on.",
      "Child, I counted that book already.",
    ],
  },
  {
    id: "uncle-ray",
    name: "Uncle Ray",
    img: uncleRayImg,
    tagline: "Talks slow. Plays fast.",
    lines: [
      "Back in my day we played for bragging rights AND the last rib.",
      "Hold on, let me think... nah, take that.",
      "Garage rules: no crying at the table.",
    ],
  },
  {
    id: "cousin-jay",
    name: "Cousin Jay",
    img: cousinJayImg,
    tagline: "All confidence, all the time.",
    lines: [
      "Y'all might as well deal me the win now.",
      "I bid with my chest!",
      "Watch the master work.",
    ],
  },
  {
    id: "big-mike",
    name: "Big Mike",
    img: bigMikeImg,
    tagline: "Gentle giant. Ruthless spades.",
    lines: [
      "No hard feelings. Just hard spades.",
      "I came for the cookout, stayed for the books.",
      "Ha! That's how Big Mike does it.",
    ],
  },
  {
    id: "cousin-nay",
    name: "Cousin Nay",
    img: cousinNayImg,
    tagline: "Style points count too.",
    lines: [
      "Cute card. Mine's cuter.",
      "I don't chase books, books chase me.",
      "Period. Next trick.",
    ],
  },
  {
    id: "marcus",
    name: "Marcus",
    img: marcusImg,
    tagline: "Counts everything. Misses nothing.",
    lines: [
      "I've already counted every spade out there.",
      "Math doesn't bluff.",
      "That play had a 12% chance of working. It didn't.",
    ],
  },
  {
    id: "dee",
    name: "Dee",
    img: deeImg,
    tagline: "Quick hands, quicker mouth.",
    lines: [
      "Oh, you thought that was gon' win? Bless your heart.",
      "I play fast 'cause dinner's getting cold.",
      "Run that back, I dare you.",
    ],
  },
  {
    id: "trey",
    name: "Trey",
    img: treyImg,
    tagline: "Youngest at the table. Zero fear.",
    lines: [
      "I'm not scared of nobody's spade!",
      "Bid 3? I could bid in my sleep.",
      "Somebody write this win down!",
    ],
  },
];

export interface Chapter {
  n: number;
  name: string;
  room: string;
  opponents: string[]; // cast ids, in seat order for a 4-player table
  difficulty: Difficulty;
  mean: number; // Mean Meter 0..100
  unlock: string; // what winning unlocks
}

export const CHAPTERS: Chapter[] = [
  { n: 1, name: "Kitchen Table", room: "A small cozy home kitchen — where it all starts.", opponents: ["trey", "dee", "cousin-jay"], difficulty: "friendly", mean: 10, unlock: "Original Classic card backs" },
  { n: 2, name: "Auntie Pearl's Porch", room: "Screened porch, sweet tea, and Pearl watching every move.", opponents: ["auntie-pearl", "trey", "dee"], difficulty: "friendly", mean: 22, unlock: "Cookout Crimson card backs + Porch felt" },
  { n: 3, name: "The Cookout", room: "The whole family, the grill smoking, everybody talking at once.", opponents: ["cousin-jay", "big-mike", "cousin-nay"], difficulty: "spicy", mean: 35, unlock: "Sunset felt" },
  { n: 4, name: "Uncle Ray's Garage", room: "Folding table under the work light. Garage rules apply.", opponents: ["uncle-ray", "marcus", "big-mike"], difficulty: "spicy", mean: 48, unlock: "Garage felt" },
  { n: 5, name: "Church Basement", room: "After-service fellowship hall. Quiet room, loud game.", opponents: ["auntie-pearl", "marcus", "dee"], difficulty: "spicy", mean: 60, unlock: "Royal Diamond card backs" },
  { n: 6, name: "Reunion Qualifier", room: "The big family reunion — only the sharpest get a Head Table seat.", opponents: ["cousin-nay", "uncle-ray", "marcus"], difficulty: "cutthroat", mean: 72, unlock: "Midnight Stars card backs" },
  { n: 7, name: "Big Mama's Dining Room", room: "The good room. The good chairs. No mercy.", opponents: ["big-mama", "auntie-pearl", "uncle-ray"], difficulty: "cutthroat", mean: 85, unlock: "Emerald Crest card backs + Head Table felt" },
  { n: 8, name: "The Head Table", room: "Black and gold, under the lights. Big Mama's head seat is on the line.", opponents: ["big-mama", "marcus", "auntie-pearl"], difficulty: "cutthroat", mean: 100, unlock: "Champion Crown Gold card backs" },
];

export interface DeckStyle {
  id: string;
  name: string;
  back: string; // css background for card backs
  face: string; // css background for card faces
  how: string;
}

export const DECKS: DeckStyle[] = [
  { id: "house", name: "House Deck", back: "repeating-linear-gradient(45deg,#7c2d12 0 10px,#9a3412 10px 20px)", face: "#FFF8EC", how: "Everyone starts here" },
  { id: "classic", name: "Original Classic", back: "repeating-linear-gradient(45deg,#14532d 0 10px,#166534 10px 20px)", face: "#FFF8EC", how: "Win Story Chapter 1" },
  { id: "crimson", name: "Cookout Crimson", back: "repeating-linear-gradient(45deg,#7f1d1d 0 10px,#b91c1c 10px 20px)", face: "#FFF5F0", how: "Win Story Chapter 2" },
  { id: "diamond", name: "Royal Diamond", back: "repeating-linear-gradient(45deg,#1e3a8a 0 10px,#2563eb 10px 20px)", face: "#F5F8FF", how: "Win Story Chapter 5" },
  { id: "stars", name: "Midnight Stars", back: "radial-gradient(circle at 30% 30%, #f5b942 1.5px, transparent 2px), radial-gradient(circle at 70% 60%, #fff 1.5px, transparent 2px), #111827", face: "#F8FAFF", how: "Win Story Chapter 6" },
  { id: "emerald", name: "Emerald Crest", back: "repeating-linear-gradient(45deg,#064e3b 0 10px,#059669 10px 20px)", face: "#F2FFF8", how: "Win Story Chapter 7" },
  { id: "crown", name: "Champion Crown Gold", back: "repeating-linear-gradient(45deg,#92400e 0 10px,#f5b942 10px 20px)", face: "#FFFBEB", how: "Win Story Chapter 8 — the Head Table" },
  { id: "win1", name: "First Win Gold Trim", back: "repeating-linear-gradient(45deg,#3f3f46 0 10px,#71717a 10px 20px)", face: "#FFF8EC", how: "Win any 1 game" },
  { id: "win2", name: "Veteran Stripes", back: "repeating-linear-gradient(90deg,#581c87 0 12px,#7e22ce 12px 24px)", face: "#FBF5FF", how: "Win any 2 games" },
  { id: "win5", name: "Five-Star Table", back: "repeating-linear-gradient(90deg,#0f172a 0 12px,#b91c1c 12px 24px)", face: "#FFF8EC", how: "Win any 5 games" },
];

export const FELTS: { id: string; name: string; css: string; how: string }[] = [
  { id: "classic-green", name: "Classic Green", css: "radial-gradient(ellipse at center, #1e7a3c 0%, #14532d 70%)", how: "Everyone starts here" },
  { id: "porch", name: "Porch Boards", css: "repeating-linear-gradient(90deg,#8a5a33 0 34px,#7c4f2b 34px 68px)", how: "Win Story Chapter 2" },
  { id: "sunset", name: "Cookout Sunset", css: "radial-gradient(ellipse at center, #b45309 0%, #7c2d12 75%)", how: "Win Story Chapter 3" },
  { id: "garage", name: "Garage Concrete", css: "radial-gradient(ellipse at center, #4b5563 0%, #1f2937 75%)", how: "Win Story Chapter 4" },
  { id: "head-table", name: "Head Table Black & Gold", css: "radial-gradient(ellipse at center, #292524 0%, #0c0a09 70%), repeating-linear-gradient(45deg, transparent 0 18px, rgba(245,185,66,.15) 18px 20px)", how: "Win Story Chapter 7" },
];

export function unlockedDecks(chapters: number[], totalWins: number, hasPass: boolean): string[] {
  if (hasPass) return DECKS.map((d) => d.id);
  const out = new Set<string>(["house"]);
  if (chapters.includes(1)) out.add("classic");
  if (chapters.includes(2)) out.add("crimson");
  if (chapters.includes(5)) out.add("diamond");
  if (chapters.includes(6)) out.add("stars");
  if (chapters.includes(7)) out.add("emerald");
  if (chapters.includes(8)) out.add("crown");
  if (totalWins >= 1) out.add("win1");
  if (totalWins >= 2) out.add("win2");
  if (totalWins >= 5) out.add("win5");
  return [...out];
}

export function unlockedFelts(chapters: number[], hasPass: boolean): string[] {
  if (hasPass)
    return ["classic-green", "porch", "sunset", "garage", "head-table"];
  const out = new Set<string>(["classic-green"]);
  if (chapters.includes(2)) out.add("porch");
  if (chapters.includes(3)) out.add("sunset");
  if (chapters.includes(4)) out.add("garage");
  if (chapters.includes(7)) out.add("head-table");
  return [...out];
}

// ---------- Engine ----------

export function buildDeck(playerCount: 3 | 4): CardT[] {
  const suits: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
  const cards: CardT[] = [];
  for (const s of suits) {
    for (let r = 2; r <= 14; r++) {
      if (playerCount === 3 && s === "clubs" && r === 2) continue;
      cards.push({ suit: s, rank: r });
    }
  }
  return cards;
}

export function shuffle(cards: CardT[]): CardT[] {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j] as CardT;
    a[j] = t as CardT;
  }
  return a;
}

export function sortHand(hand: CardT[]): CardT[] {
  const order: Record<Suit, number> = {
    spades: 0,
    hearts: 1,
    clubs: 2,
    diamonds: 3,
  };
  return [...hand].sort(
    (x, y) => order[x.suit] - order[y.suit] || y.rank - x.rank,
  );
}

/** Strength of a card within a trick: led suit counts, spades trump all. */
export function trickStrength(card: CardT, ledSuit: Suit): number {
  if (card.suit === "spades") return 100 + card.rank;
  if (card.suit === ledSuit) return card.rank;
  return 0;
}

export function winningIndex(
  trick: { player: number; card: CardT }[],
): number {
  if (trick.length === 0) return -1;
  const led = (trick[0] as { card: CardT }).card.suit;
  let best = 0;
  let bestScore = -1;
  trick.forEach((t, i) => {
    const s = trickStrength(t.card, led);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  });
  return best;
}

/**
 * Legal plays under the house rule: follow suit if you can; within the suit
 * you play, if any card can beat the current winner you must play one that
 * beats it (if you have one in that suit). If you cannot follow suit, you may
 * slough anything — but if a spade you hold can beat the current winner, the
 * "must beat the fallen card" rule says you must trump in.
 */
export function legalPlays(
  hand: CardT[],
  trick: { player: number; card: CardT }[],
): CardT[] {
  if (trick.length === 0) return [...hand];
  const led = (trick[0] as { card: CardT }).card.suit;
  const winIdx = winningIndex(trick);
  const winCard = (trick[winIdx] as { card: CardT }).card;
  const winStrength = trickStrength(winCard, led);

  const follow = hand.filter((c) => c.suit === led);
  if (follow.length > 0) {
    const beaters = follow.filter((c) => trickStrength(c, led) > winStrength);
    return beaters.length > 0 ? beaters : follow;
  }
  // Can't follow: a spade that beats the winner must be played if held.
  const trumpBeaters = hand.filter(
    (c) => c.suit === "spades" && trickStrength(c, led) > winStrength,
  );
  if (trumpBeaters.length > 0) return trumpBeaters;
  return [...hand];
}

export function estimateBid(hand: CardT[]): number {
  let est = 0;
  for (const c of hand) {
    if (c.suit === "spades") {
      if (c.rank >= 12) est += 1;
      else if (c.rank >= 9) est += 0.5;
    } else {
      if (c.rank === 14) est += 1;
      else if (c.rank === 13) est += 0.5;
    }
  }
  // Long spade suit adds trump power.
  const spades = hand.filter((c) => c.suit === "spades").length;
  if (spades >= 5) est += 0.7;
  return Math.max(3, Math.min(9, Math.round(est)));
}

export function aiBid(hand: CardT[], difficulty: Difficulty): number {
  const est = estimateBid(hand);
  if (difficulty === "friendly") {
    // Friendly players bid close to the minimum and wobble a little.
    return Math.max(3, Math.min(est, 3 + Math.floor(Math.random() * 2)));
  }
  if (difficulty === "spicy") {
    return Math.max(3, est + (Math.random() < 0.25 ? 1 : 0));
  }
  return Math.max(3, est);
}

/** Pick a card for an AI player from its legal plays. */
export function aiPlay(
  hand: CardT[],
  trick: { player: number; card: CardT }[],
  difficulty: Difficulty,
): CardT {
  const legal = legalPlays(hand, trick);
  const sorted = [...legal].sort((a, b) => a.rank - b.rank);
  const lowest = sorted[0] as CardT;
  if (difficulty === "friendly") {
    // Friendly: mostly plays low, sometimes wastes a better card.
    return Math.random() < 0.7
      ? lowest
      : (sorted[Math.floor(Math.random() * sorted.length)] as CardT);
  }
  if (trick.length === 0) {
    // Leading: spicy/cutthroat lead from strength, but not their ace of spades.
    const nonSpade = sorted.filter((c) => c.suit !== "spades");
    if (difficulty === "cutthroat" && nonSpade.length > 0) {
      return nonSpade[nonSpade.length - 1] as CardT;
    }
    return lowest;
  }
  // Following: the legal set already forces a beater when one exists; play
  // the cheapest beater. When nothing can beat, shed the lowest card.
  return lowest;
}

/** Score one finished hand for one player. Returns points and a note. */
export function scoreHand(
  bid: number,
  books: number,
): { points: number; note: string } {
  if (books < bid) return { points: -bid * 10, note: "Set" };
  const over = books - bid;
  if (over >= 3)
    return { points: -bid * 10, note: "Double set — 3+ over the bid" };
  return { points: bid * 10 + over, note: over > 0 ? `Made it +${over}` : "Made it right on" };
}

export const QUICK_TALK: string[] = [
  "Good game!",
  "Nice play!",
  "You got me that time!",
  "Let's go again!",
  "Big Mama's house rules!",
  "Pass the cornbread!",
  "I bid 3!",
  "Watch out, I'm coming for 150!",
  "Good luck, family!",
  "That was a close one!",
];
