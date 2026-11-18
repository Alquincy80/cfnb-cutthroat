// "Send to a Friend" — share the live game link.
// Phones open the native share sheet (navigator.share); anything else falls
// back to copying the link to the clipboard. No new dependencies.

export const GAME_URL = "https://cfnb-cutthroat.onrender.com/";
export const SHARE_TEXT = "Play C.F.N.B. Cutthroat free — Family Card Night!";

export type ShareOutcome = "shared" | "copied" | "failed";

/** Share the game link. Returns how it went so the UI can confirm. */
export async function shareGame(): Promise<ShareOutcome> {
  const shareData = {
    title: "C.F.N.B. Cutthroat: Family Card Night",
    text: SHARE_TEXT,
    url: GAME_URL,
  };
  if (
    typeof navigator !== "undefined" &&
    "share" in navigator &&
    typeof navigator.share === "function"
  ) {
    try {
      await navigator.share(shareData);
      return "shared";
    } catch (err) {
      // The player closed the share sheet without picking anyone — not an error.
      if (err instanceof DOMException && err.name === "AbortError") return "shared";
      // Otherwise fall through to the clipboard.
    }
  }
  const text = `${SHARE_TEXT} ${GAME_URL}`;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return "copied";
    }
  } catch {
    // Fall through to the legacy copy below.
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok ? "copied" : "failed";
  } catch {
    return "failed";
  }
}
