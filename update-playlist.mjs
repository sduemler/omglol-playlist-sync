// Updates the "current monthly playlist" embed on an omg.lol web page.
//
// Flow:
//   1. Work out the current month name, e.g. "June 2026".
//   2. Ask Spotify (app-only auth) for the user's public playlists and find the
//      one whose name matches that month.
//   3. Read the current omg.lol page, swap in a fresh Spotify embed between the
//      <!-- PLAYLIST:START --> / <!-- PLAYLIST:END --> markers, and publish.
//
// Idempotent: if no matching playlist exists yet, or the page already shows the
// right embed, it exits without changing anything.
//
// Requires Node 20+ (uses the built-in fetch). No dependencies.

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_USER_ID,
  OMGLOL_ADDRESS,
  OMGLOL_API_KEY,
  PLAYLIST_TZ = "UTC",
} = process.env;

const START_MARKER = "<!-- PLAYLIST:START -->";
const END_MARKER = "<!-- PLAYLIST:END -->";

function requireEnv() {
  const missing = [
    "SPOTIFY_CLIENT_ID",
    "SPOTIFY_CLIENT_SECRET",
    "SPOTIFY_USER_ID",
    "OMGLOL_ADDRESS",
    "OMGLOL_API_KEY",
  ].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
}

// "June 2026" for the current date in the configured timezone.
function currentPlaylistName(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PLAYLIST_TZ,
    month: "long",
    year: "numeric",
  }).format(date);
}

async function getSpotifyToken() {
  const basic = Buffer.from(
    `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`,
  ).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`Spotify auth failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()).access_token;
}

// Find the user's public playlist whose name matches `name` (case-insensitive).
async function findPlaylist(token, name) {
  const target = name.trim().toLowerCase();
  let url = `https://api.spotify.com/v1/users/${encodeURIComponent(
    SPOTIFY_USER_ID,
  )}/playlists?limit=50`;

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(
        `Spotify playlists fetch failed (${res.status}): ${await res.text()}`,
      );
    }
    const page = await res.json();
    const match = page.items.find(
      (p) => p && p.name && p.name.trim().toLowerCase() === target,
    );
    if (match) return match;
    url = page.next;
  }
  return null;
}

function embedFor(playlist) {
  const id = playlist.id;
  return [
    `<iframe style="border-radius:12px" src="https://open.spotify.com/embed/playlist/${id}?utm_source=generator" width="100%" height="352" frameborder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`,
  ].join("\n");
}

async function getWebContent() {
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

async function main() {
  requireEnv();

  const name = currentPlaylistName();
  console.log(`Looking for playlist named "${name}"...`);

  const token = await getSpotifyToken();
  const playlist = await findPlaylist(token, name);
  if (!playlist) {
    console.log(
      `No public playlist named "${name}" found yet. Nothing to do.`,
    );
    return;
  }
  console.log(`Found playlist ${playlist.id} ("${playlist.name}").`);

  const content = await getWebContent();
  const updated = replaceBetweenMarkers(content, embedFor(playlist));
  if (updated === null) {
    throw new Error(
      `Could not find ${START_MARKER} / ${END_MARKER} markers on the omg.lol page. ` +
        `Add them once around your playlist section.`,
    );
  }

  if (updated === content) {
    console.log("Page already up to date. Nothing to publish.");
    return;
  }

  await publishWebContent(updated);
  console.log("Published updated playlist embed to omg.lol. ✅");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
