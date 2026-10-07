# omg.lol monthly playlist sync

Keeps the "current monthly playlist" section of your
[omg.lol](https://omg.lol) page pointed at this month's **Apple Music**
playlist.

Each month:

1. On the 1st, a GitHub Action opens an issue, **"🎵 October 2026 playlist
   link?"**, assigned to you, so you get an email and a GitHub Mobile
   notification.
2. You reply with the playlist's Apple Music share link. Comment in GitHub, or
   just reply to the notification email.
3. A few minutes later the embed between your page's markers is replaced, the
   link is recorded in [`playlists.json`](playlists.json), and the issue
   closes itself.
4. Haven't replied by the 4th? It nudges you once. Never reply, and the page
   keeps last month's playlist.

Apple's embedded player loads the playlist live, so songs you add later in the
month appear on the page with nothing else to do.

---

## One-time setup

### 1. Add the markers to your omg.lol page

In your omg.lol web page editor, wherever you want the player, add:

```html
<!-- PLAYLIST:START -->
<!-- PLAYLIST:END -->
```

The script only ever rewrites the lines **between** these two comments. The
comments themselves are invisible on the published page.

### 2. Add repo secrets

**Settings → Secrets and variables → Actions → New repository secret**:

| Secret name      | Value                               |
| ---------------- | ----------------------------------- |
| `OMGLOL_ADDRESS` | the part before `.omg.lol`, e.g. `samd` |
| `OMGLOL_API_KEY` | from [home.omg.lol/account](https://home.omg.lol/account) |

No Apple account or API keys are needed.

### 3. Make sure you'll see the reminder

- github.com → **Settings → Notifications**: email on for "Participating,
  @mentions and custom".
- Install **GitHub Mobile** and allow push notifications.
- To answer by email, reply from an address that's **verified on your GitHub
  account** (Settings → Emails). Otherwise GitHub drops the reply.

---

## Getting the link

In Apple Music, open the playlist → **•••** → **Share** → **Copy Link**. It
looks like `https://music.apple.com/us/playlist/october-2026/pl.u-AbC123`.
Sharing makes a public copy for the embed to show. Later edits sync to it,
sometimes after a short delay.

A `music.apple.com/library/...` link won't work; it's private to you. The bot
tells you if you send one.

---

## The workflows

| Workflow | When | What |
| --- | --- | --- |
| **Monthly playlist reminder** (`playlist-reminder.yml`) | daily, days 1–8, or by hand | opens the month's issue, nudges once on day 4, closes last month's unanswered issue |
| **Playlist reply** (`playlist-reply.yml`) | you comment on a request issue | publishes the first Apple Music playlist link in your comment, then confirms and closes |
| **Publish playlist** (`playlist-publish.yml`) | by hand | **Actions → Publish playlist → Run workflow**, paste a link. For swapping the link or skipping the issue |

Only **your** comments are acted on, since anyone can comment on a public repo.
Replying again on a closed issue in the same month swaps the link.

The timezone for "this month" is `America/Chicago`, set by `PLAYLIST_TZ` in
each workflow.

---

## Test it locally

```bash
cp .env.example .env   # then fill in the omg.lol values
DRY_RUN=1 PLAYLIST_URL="https://music.apple.com/us/playlist/…/pl.u-…" node --env-file=.env update-playlist.mjs
```

`DRY_RUN=1` reads your page and prints the block it would publish, without
changing anything. Drop it to publish for real.
