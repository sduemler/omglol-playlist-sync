# Plan: switch the omg.lol playlist from Spotify to Apple Music

Status: **built 2026-10-07, not yet committed/pushed or tested live.** See
Progress at the bottom.

## Why

- You're moving to Apple Music (Apple One) and dropping to free Spotify.
- Since Feb 2026, Spotify's API only works for apps whose **owner has
  Premium** ([migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)).
  On free Spotify the current script stops working, and so would any
  Apple → Spotify copying.
- Apple Music's embedded player loads the playlist each time the page is
  viewed. Songs you add show up without a nightly sync.
- Finding your playlist automatically on Apple would need a $99/yr developer
  account plus a sign-in that expires about every 6 months. Instead, **you
  paste the share link once a month** and the workflows handle the rest.

## What a month will look like

1. On the 1st, GitHub opens an issue: **"🎵 November 2026 playlist link?"**,
   assigned to you. You get an email and a GitHub Mobile notification.
2. You make the playlist in Apple Music, copy its share link, and **reply** to
   the issue. Comment in the app, or just reply to the notification email.
3. A few minutes later the omg.lol page shows the new embed. The bot comments
   "Published ✅" and closes the issue.
4. If you haven't replied by the 4th, the bot adds a "still waiting" comment,
   which notifies you again. If you never reply, the page keeps last month's
   playlist.
5. Songs you add later in the month show up on the page with nothing to do.

---

## What you need to do

### Before the build

- [x] ~~Check whether Mixtape Mixup depends on your Spotify Premium.~~ Resolved:
      it moved to someone else's Spotify app on 2026-10-05.
- [ ] **Decide the player size** (see Open questions below). Built at 450px.

### GitHub notification setup (one-time)

- [ ] github.com → Settings → Notifications: make sure **email** is on for
      "Participating, @mentions and custom".
- [ ] Install **GitHub Mobile** and turn on push notifications. This is the
      nicest way to answer.
- [ ] Replying by email only works from an email address **verified on your
      GitHub account**. Check that the address you'd reply from is listed
      under Settings → Emails.

### After the build (one-time)

- [ ] Do one real test month (see "Testing" below).
- [ ] Delete the old repo secrets: `SPOTIFY_CLIENT_ID`,
      `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_USER_ID`
      (Settings → Secrets and variables → Actions). Keep `OMGLOL_ADDRESS`
      and `OMGLOL_API_KEY`.
- [ ] Downgrade Spotify **after** the new flow has published once. The old
      flow keeps working until then.

### Every month

- [ ] Make the playlist in Apple Music. Any name works; it no longer has to
      be "Month Year".
- [ ] Share it: playlist → `•••` → **Share** → **Copy Link**. You get
      something like `https://music.apple.com/us/playlist/october-2026/pl.u-AbC123`.
      Sharing creates the public copy that the embed shows. Edits sync to it,
      sometimes with a short delay.
- [ ] Reply to the issue with that link. Extra text is fine; the bot uses the
      first Apple Music playlist link it finds.

---

## Build steps (for Claude)

### 1. Script: `update-playlist.mjs`

- Remove all Spotify code (`getSpotifyToken`, `findPlaylist`, the Spotify
  env vars).
- Take the link from `PLAYLIST_URL` (env var).
- Validate it as a **public** playlist link:
  `https://music.apple.com/<storefront>/playlist/<slug>/pl.<id>` (ignore any
  `?query`).
  - Reject `music.apple.com/library/playlist/p.…` links (library-only, not
    public) with a clear message: "That's a private library link; use
    Share → Copy Link."
- Build the embed URL by swapping in the embed host,
  `https://embed.music.apple.com/<storefront>/playlist/<slug>/pl.<id>`.
  Write the iframe Apple's own embed generator uses (`allow`, `sandbox`,
  `border-radius`, width 100%).
- Keep `getWebContent`, `publishWebContent`, `replaceBetweenMarkers` and
  the "already up to date" no-op exactly as they are.
- Add `DRY_RUN=1`, which prints the new marker block instead of publishing
  (for testing).
- Record each published month in **`playlists.json`** (`{"2026-11": "<url>"}`),
  committed back to the repo. This has three jobs:
  - It's the single "is this month done?" check, so the reminder workflow
    and a manual run agree.
  - It keeps a history of every monthly playlist.
  - The monthly commit counts as repo activity. GitHub disables scheduled
    workflows in **public** repos after 60 days without activity, and the
    last commit here was 2026-06-14.

### 2. Reminder workflow: `.github/workflows/playlist-reminder.yml`

- Trigger: `schedule` daily on days 1–8 (reuse the current cron), plus
  `workflow_dispatch` for testing. Permissions: `issues: write`.
- Compute the month key and name in `America/Chicago`.
- If `playlists.json` already has this month: do nothing.
- Close any still-open request issue from **last** month with a "skipped"
  comment.
- If there's no open issue for this month, open one:
  - title "🎵 <Month Year> playlist link?"
  - label `playlist-request`
  - assigned to the repo owner, with an `@sduemler` mention in the body
    (assignment and mention make sure GitHub notifies you about an issue a
    bot opened)
  - short instructions in the body
- If it's day 4 or later and no nudge has been posted yet, add one "still
  waiting" comment.
- Use `gh` CLI with `GITHUB_TOKEN`; no extra secrets needed.

### 3. Reply workflow: `.github/workflows/playlist-reply.yml`

- Trigger: `issue_comment` `[created]`.
- Guards (job `if:`):
  - the issue has label `playlist-request`
  - it's an issue, not a PR
  - the commenter is the owner
    (`github.event.comment.user.login == github.repository_owner`). The repo
    is public, so anyone can comment; this check stops strangers from
    swapping your embed.
- **Security:** pass the comment body to the script through an `env:` var.
  Never put `${{ github.event.comment.body }}` directly in a `run:` line;
  that allows shell injection.
- Pull the first playlist link out of the body with a regex. This handles
  quoted email threads and signatures.
  - No valid link → comment explaining why (e.g. "that's a library link")
    and leave the issue open.
  - Valid link → run the script, commit `playlists.json`, comment
    "Published ✅ <link>", close the issue.
- Permissions: `issues: write`, `contents: write`. Add a `concurrency`
  group so two quick replies can't race.

### 4. Manual fallback

- Keep `workflow_dispatch` on the publish workflow with a `playlist_url`
  input. This covers mid-month swaps or a playlist link you want to change.
  It writes `playlists.json` the same way.
- Remove the old daily Spotify schedule from `update-playlist.yml`.

### 5. Cleanup

- `.env.example`: remove the Spotify vars and add `PLAYLIST_URL` and
  `DRY_RUN`.
- Rewrite the README: setup, the monthly flow, the notification checklist,
  and how to get a share link.
- Keep the omg.lol markers unchanged. Your page needs no edits.

### Testing

1. Locally: `DRY_RUN=1 PLAYLIST_URL=<link> node --env-file=.env update-playlist.mjs`
   and check the iframe it prints.
2. Run once for real and look at the page on desktop and phone width.
3. Trigger the reminder workflow by hand. Confirm the issue shows up and you
   get the email and push notification.
4. Reply from your phone once and by email once. Confirm both publish and
   close the issue. Check that a comment from another account is ignored
   (or reason through the guard if you don't have a second account).

## Open questions

- **Player size.** The page currently uses Spotify's compact 152px player to
  match the EP embed. Apple's playlist embed defaults to 450px with a track
  list. Apple has no real compact playlist player, and shorter heights crop
  it. Options: use 450, or try something like 175 and see if the crop looks
  OK. Decide once you see it on the page.
- **Day for the nudge.** It's set for day 4. Change it if you want.

## Progress

- [x] 1. Script (`update-playlist.mjs`, plus `github.mjs`)
- [x] 2. Reminder workflow (`playlist-reminder.yml` + `remind.mjs`)
- [x] 3. Reply workflow (`playlist-reply.yml` + `reply.mjs`)
- [x] 4. Manual fallback (`playlist-publish.yml`, renamed from `update-playlist.yml`)
- [x] 5. Cleanup + README + `.env.example`
- [x] Local testing: link parsing, dry run against the real page, and all
      reminder/reply/manual flows simulated against mocked GitHub + omg.lol APIs
- [ ] Commit + push to main (workflows only run from the default branch)
- [ ] Live test for October 2026
- [ ] Your one-time steps (notifications, delete Spotify secrets, Spotify downgrade)

Not verified: whether the Apple embed renders when a link has no name in it
(the code fills in `playlist`). The in-app browser couldn't render any Apple
embed, and normal share links always include the name.
