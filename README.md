# omg.lol monthly playlist sync

Automatically keeps the "current monthly playlist" section of your
[omg.lol](https://omg.lol) page pointed at your latest Spotify playlist —
no manual editing.

Each run it:

1. Works out the current month name, e.g. `June 2026`.
2. Finds your **public** Spotify playlist with that exact name.
3. Swaps a fresh Spotify embed into your omg.lol page (only the bit between two
   marker comments) and publishes.

It's safe to run repeatedly: if the playlist doesn't exist yet, or the page is
already correct, it does nothing.

---

## One-time setup

### 1. Add the markers to your omg.lol page

In your omg.lol web page editor, wherever you want the player, add:

```html
<!-- PLAYLIST:START -->
<!-- PLAYLIST:END -->
```

The script only ever rewrites the lines **between** these two comments;
everything else on your page is left untouched. (The comments themselves are
invisible on the published page.)

### 2. Create a Spotify app

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   and create an app (any name; redirect URI can be `http://localhost`).
2. Copy the **Client ID** and **Client secret**.

Because your monthly playlist is public, that's all the auth needed — no login
or refresh tokens.

### 3. Get your other values

- **Spotify user ID** — Spotify → your profile → `...` → Share → Copy link to
  profile. The ID is the part after `/user/`.
- **omg.lol API key** — [home.omg.lol/account](https://home.omg.lol/account) → API key.
- **omg.lol address** — the part before `.omg.lol` (e.g. `samd`).

---

## Run it on a schedule (GitHub Actions)

1. Push this folder to a GitHub repo.
2. In the repo: **Settings → Secrets and variables → Actions → New repository
   secret**, and add each of:

   | Secret name             | Value                          |
   | ----------------------- | ------------------------------ |
   | `SPOTIFY_CLIENT_ID`     | from the Spotify dashboard     |
   | `SPOTIFY_CLIENT_SECRET` | from the Spotify dashboard     |
   | `SPOTIFY_USER_ID`       | your Spotify user ID           |
   | `OMGLOL_ADDRESS`        | e.g. `samd`                    |
   | `OMGLOL_API_KEY`        | from home.omg.lol/account      |

3. That's it. The workflow in `.github/workflows/update-playlist.yml` runs daily
   for the first 8 days of each month and can also be triggered manually from the
   **Actions** tab (**Run workflow**) any time.

The timezone used for the month name is set in the workflow (`PLAYLIST_TZ`,
default `America/Chicago`). Change it there if needed.

---

## Test it locally first

```bash
cp .env.example .env   # then fill in the values
node --env-file=.env update-playlist.mjs
```

Requires Node 20+. No dependencies to install.

> Tip: to test before the month's playlist exists, temporarily rename one of
> your existing public playlists to the current `MONTH YEAR`, run the script,
> check your page, then rename it back.

---

## Notes / gotchas

- **Spotify embeds use an `<iframe>`.** If omg.lol strips raw HTML from your page
  and the player doesn't render, switch the `embedFor()` function in
  `update-playlist.mjs` to a plain markdown link instead — the playlist URL is
  `playlist.external_urls.spotify`.
- **Exact name match.** The playlist name must match `MONTH YEAR` exactly
  (case-insensitive), e.g. `June 2026`. Stray spaces or different formatting
  won't match.
