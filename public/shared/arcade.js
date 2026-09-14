/* Shared arcade integration, also cached by each standalone game's PWA. */
export function isEditing(target) {
  return !!target?.closest?.(
    'input, textarea, select, [contenteditable="true"], [contenteditable=""]',
  );
}

export function challengeFrom(search) {
  const params = new URLSearchParams(search);
  const raw = params.get("challenge");
  const score = raw && /^\d{1,9}$/.test(raw) ? Number(raw) : 0;
  const mode = params.get("mode") || "veteran";
  if (
    !Number.isSafeInteger(score) ||
    score <= 0 ||
    score > 100_000_000 ||
    !["rookie", "veteran", "superstar"].includes(mode)
  )
    return null;
  return { score, mode };
}

export function scoreLink(
  slug,
  score,
  mode = "veteran",
  origin = location.origin,
) {
  const url = new URL(`/games/${slug}/`, origin);
  url.searchParams.set("challenge", String(Math.floor(score)));
  url.searchParams.set("mode", mode);
  return url.href;
}

export async function shareLink({ title, text, url }, feedback) {
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return;
    }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    if (feedback)
      feedback.textContent = "Challenge link copied. Send it to your rival.";
  } catch (error) {
    if (error?.name === "AbortError") return;
    if (feedback) {
      feedback.textContent = "Copy this link: ";
      const input = document.createElement("input");
      input.readOnly = true;
      input.value = url;
      input.setAttribute("aria-label", "Share link");
      feedback.append(input);
      input.select();
    }
  }
}

export function attachArcade(
  game,
  { slug, title, resultSelector, mode = () => "veteran" },
) {
  document.body.dataset.arcade = slug;
  const panel = document.querySelector(resultSelector);
  const challenge = challengeFrom(location.search);
  const area = document.createElement("div");
  area.className = "arcade-result";
  const summary = document.createElement("p");
  summary.className = "arcade-result-summary";
  const share = document.createElement("button");
  share.type = "button";
  share.className = "arcade-share";
  share.textContent = "Challenge a friend ↗";
  const status = document.createElement("p");
  status.className = "arcade-share-status";
  status.setAttribute("role", "status");
  area.append(summary, share, status);
  panel?.append(area);
  let score = 0;
  let currentMode = "veteran";
  share.addEventListener("click", () =>
    shareLink(
      {
        title: `${title} · Beaver Games`,
        text: `I scored ${score.toLocaleString()} in ${title}${slug === "chicken-attack" ? ` (${currentMode})` : ""}. Your turn.`,
        url: scoreLink(slug, score, currentMode),
      },
      status,
    ),
  );
  game.on("gameover", (result) => {
    score = Math.max(0, Math.floor(result.score || 0));
    currentMode = mode(result);
    let records = {};
    try {
      const value = JSON.parse(
        localStorage.getItem("beaver-games.records") || "{}",
      );
      if (value && typeof value === "object" && !Array.isArray(value))
        records = value;
    } catch {}
    const old = records[slug]?.score || 0;
    records[slug] = { score: Math.max(old, score), playedAt: Date.now() };
    try {
      localStorage.setItem("beaver-games.records", JSON.stringify(records));
    } catch {}
    summary.textContent =
      challenge && challenge.mode === currentMode
        ? score > challenge.score
          ? `Rival beaten by ${(score - challenge.score).toLocaleString()} points!`
          : score === challenge.score
            ? "A tie. Time for the rematch."
            : `${(challenge.score - score).toLocaleString()} points from beating your rival.`
        : score > old
          ? "Personal best. This one deserves a rematch."
          : old > score
            ? `${(old - score).toLocaleString()} points from your personal best.`
            : "One more round?";
    share.disabled = score <= 0;
    status.textContent = "";
    window.parent.postMessage(
      { type: "arcade:result", slug, score, mode: currentMode },
      location.origin,
    );
  });
}

/* Report API failure truthfully; local records never depend on the network. */
const submissions = new Map();
export function postScore(run, name) {
  const previous = submissions.get(run.id) || Promise.resolve();
  const next = previous.then(() => sendScore(run, name));
  submissions.set(run.id, next);
  next.finally(() => {
    if (submissions.get(run.id) === next) submissions.delete(run.id);
  });
  return next;
}

async function sendScore(run, name) {
  const status =
    document.querySelector("[data-score-status]") ||
    (() => {
      const node = document.createElement("p");
      node.dataset.scoreStatus = "";
      node.className = "arcade-score-status";
      node.setAttribute("role", "status");
      document.querySelector("#name-form")?.after(node);
      return node;
    })();
  status.textContent = "Posting to the community board…";
  try {
    const response = await fetch("/api/scores", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...run, name }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(String(response.status));
    status.textContent = "Posted to the community board.";
    window.parent.postMessage({ type: "arcade:score-posted" }, location.origin);
  } catch {
    status.textContent =
      "Community board unavailable. Your result is saved on this device.";
  }
}
