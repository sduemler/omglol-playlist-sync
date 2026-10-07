// Updates the "current monthly playlist" embed on an omg.lol web page.
//
// Flow:
//   1. Take an Apple Music playlist share link (PLAYLIST_URL). It can be buried
//      in other text, e.g. a whole email reply; the first playlist link wins.
//   2. Read the current omg.lol page, swap in an Apple Music embed between the
//      <!-- PLAYLIST:START --> / <!-- PLAYLIST:END --> markers, and publish.
//   3. Record the link for that month in playlists.json (the workflow commits it).
//
// Apple's embed loads the playlist live, so songs added later in the month show
// up on the page without another run.
//
// Idempotent: if the page already shows the right embed it doesn't republish.
//
// Run directly for a manual publish (also what the "Run workflow" button does):
//   PLAYLIST_URL=<link> node --env-file=.env update-playlist.mjs
// DRY_RUN=1 prints the new block instead of publishing or writing anything.
//
// Requires Node 20+ (uses the built-in fetch). No dependencies.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const START_MARKER = "<!-- PLAYLIST:START -->";
const END_MARKER = "<!-- PLAYLIST:END -->";
const HISTORY_FILE = new URL("./playlists.json", import.meta.url);

// Apple's playlist player shows the track list at 450px. Shorter heights crop
// it rather than switching to a compact layout.
const EMBED_HEIGHT = 450;

export const TZ = process.env.PLAYLIST_TZ || "UTC";
export const DRY_RUN = !!process.env.DRY_RUN && process.env.DRY_RUN !== "0";

export class UserError extends Error {}

// "2026-10" for the current date in the configured timezone.
export function currentMonthKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}`;
}

// "2026-10" -> "October 2026"
export function monthName(key) {
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, 15)));
}

// Find the first public Apple Music playlist link in `text`. Throws a
// UserError with a helpful message when there isn't one.
export function parsePlaylistUrl(text = "") {
  const match = text.match(
    /https?:\/\/(?:embed\.)?music\.apple\.com\/([a-z]{2})\/playlist\/(?:([^/\s?#<>"')]+)\/)?(pl\.[\w.-]+)/i,
  );
  if (match) {
    const [, storefront, slug = "playlist", id] = match;
    return {
      url: `https://music.apple.com/${storefront}/playlist/${slug}/${id}`,
      embedUrl: `https://embed.music.apple.com/${storefront}/playlist/${slug}/${id}`,
    };
  }
  if (/music\.apple\.com\/library\//i.test(text)) {
    throw new UserError(
      "That's a private library link, which only works for you. In Apple Music, " +
        "open the playlist, tap ••• → Share → Copy Link, and send that instead.",
    );
  }
  throw new UserError(
    "I couldn't find an Apple Music playlist link (music.apple.com/…/playlist/…/pl.…). " +
      "In Apple Music, open the playlist, tap ••• → Share → Copy Link, and send that.",
  );
}

function embedFor(embedUrl) {
  return `<iframe allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write" frameborder="0" height="${EMBED_HEIGHT}" style="width:100%;overflow:hidden;border-radius:12px;" sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation" src="${embedUrl}"></iframe>`;
}

function requireEnv(...keys) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

async function getWebContent() {
  const { OMGLOL_ADDRESS, OMGLOL_API_KEY } = process.env;
  const res = await fetch(
    `https://api.omg.lol/address/${encodeURIComponent(OMGLOL_ADDRESS)}/web`,
    { headers: { Authorization: `Bearer ${OMGLOL_API_KEY}` } },
  );
  if (!res.ok) {
    throw new Error(`omg.lol GET failed (${res.status}): ${await res.text()}`);
  }
  const body = await res.json();
  if (!body.response || typeof body.response.content !== "string") {
    throw new Error(`Unexpected omg.lol response: ${JSON.stringify(body)}`);
  }
  return body.response.content;
}

async function publishWebContent(content) {
  const { OMGLOL_ADDRESS, OMGLOL_API_KEY } = process.env;
  const res = await fetch(
    `https://api.omg.lol/address/${encodeURIComponent(OMGLOL_ADDRESS)}/web`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OMGLOL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content, publish: true }),
    },
  );
  if (!res.ok) {
    throw new Error(`omg.lol POST failed (${res.status}): ${await res.text()}`);
  }
}

// Replace whatever is between the markers with `block`. Returns null if the
// markers aren't present (so we can fail loudly instead of corrupting the page).
function replaceBetweenMarkers(content, block) {
  const start = content.indexOf(START_MARKER);
  const end = content.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) return null;

  const before = content.slice(0, start + START_MARKER.length);
  const after = content.slice(end);
  return `${before}\n${block}\n${after}`;
}

export async function readHistory() {
  try {
    return JSON.parse(await readFile(HISTORY_FILE, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

async function recordHistory(monthKey, url) {
  const history = await readHistory();
  history[monthKey] = url;
  const sorted = Object.fromEntries(
    Object.entries(history).sort(([a], [b]) => a.localeCompare(b)),
  );
  await writeFile(HISTORY_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
}

// Publish the playlist linked in `input` to the page and record it for
// `monthKey`. Returns { url, changed }.
export async function publishPlaylist(input, monthKey = currentMonthKey()) {
  requireEnv("OMGLOL_ADDRESS", "OMGLOL_API_KEY");
  const { url, embedUrl } = parsePlaylistUrl(input);
  console.log(`Playlist for ${monthName(monthKey)}: ${url}`);

  const content = await getWebContent();
  const block = embedFor(embedUrl);
  const updated = replaceBetweenMarkers(content, block);
  if (updated === null) {
    throw new Error(
      `Could not find ${START_MARKER} / ${END_MARKER} markers on the omg.lol page. ` +
        `Add them once around your playlist section.`,
    );
  }

  if (DRY_RUN) {
    console.log("DRY_RUN: would put this between the markers:\n" + block);
    console.log(updated === content ? "(page already matches)" : "(page would change)");
    return { url, changed: updated !== content };
  }

  const changed = updated !== content;
  if (changed) {
    await publishWebContent(updated);
    console.log("Published updated playlist embed to omg.lol. ✅");
  } else {
    console.log("Page already up to date. Nothing to publish.");
  }
  await recordHistory(monthKey, url);
  return { url, changed };
}

async function main() {
  const monthKey = process.env.PLAYLIST_MONTH || currentMonthKey();
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new UserError(`PLAYLIST_MONTH must look like 2026-10, got "${monthKey}".`);
  }
  const { url } = await publishPlaylist(process.env.PLAYLIST_URL, monthKey);

  // When run from GitHub Actions, close this month's reminder issue so it
  // stops nagging.
  if (!DRY_RUN && process.env.GITHUB_TOKEN) {
    const { closeRequestIssues } = await import("./github.mjs");
    await closeRequestIssues(
      (month) => month === monthKey,
      `Published via a manual run: ${url} ✅`,
      "completed",
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
