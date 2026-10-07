// Monthly reminder: opens a "<Month Year> playlist link?" issue assigned to the
// repo owner, nudges once if it's still unanswered on NUDGE_DAY, and closes
// last month's issue if it was never answered.
//
// Runs daily on days 1–8 (see .github/workflows/playlist-reminder.yml). Safe
// to run any number of times.

import { currentMonthKey, monthName, readHistory, TZ } from "./update-playlist.mjs";
import {
  LABEL,
  closeRequestIssues,
  comment,
  gh,
  issueMonth,
  listOpenRequests,
  monthMarker,
} from "./github.mjs";

const NUDGE_DAY = 4;
const NUDGE_MARKER = "<!-- playlist-nudge -->";

const owner = process.env.GITHUB_REPOSITORY_OWNER;
const monthKey = currentMonthKey();
const name = monthName(monthKey);
const day = Number(
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, day: "numeric" }).format(new Date()),
);

async function main() {
  // Last month's request was never answered: close it.
  await closeRequestIssues(
    (month) => month !== monthKey,
    "No link came in for this month, so the page kept the previous playlist. Closing.",
    "not_planned",
  );

  const history = await readHistory();
  if (history[monthKey]) {
    console.log(`${name} is already published (${history[monthKey]}).`);
    await closeRequestIssues(
      (month) => month === monthKey,
      `Already published: ${history[monthKey]} ✅`,
      "completed",
    );
    return;
  }

  let issue = (await listOpenRequests()).find((i) => issueMonth(i) === monthKey);
  if (!issue) {
    await ensureLabel();
    issue = await gh("/issues", {
      method: "POST",
      body: {
        title: `🎵 ${name} playlist link?`,
        labels: [LABEL],
        assignees: owner ? [owner] : [],
        body: [
          `@${owner} time for the ${name} playlist!`,
          "",
          "1. Make the playlist in Apple Music.",
          "2. Open it, tap **••• → Share → Copy Link**.",
          "3. Reply here with the link, in GitHub or by replying to the notification email.",
          "",
          "The page updates a few minutes later and this issue closes itself. Songs you add later show up on their own.",
          "",
          monthMarker(monthKey),
        ].join("\n"),
      },
    });
    console.log(`Opened #${issue.number} for ${name}.`);
    return;
  }

  if (day < NUDGE_DAY) {
    console.log(`#${issue.number} is open; waiting for a reply.`);
    return;
  }
  const comments = await gh(`/issues/${issue.number}/comments?per_page=100`);
  if (comments.some((c) => c.body.includes(NUDGE_MARKER))) {
    console.log(`#${issue.number} is open and already nudged.`);
    return;
  }
  await comment(
    issue.number,
    `@${owner} still waiting on the ${name} link. Reply with it whenever you're ready.\n\n${NUDGE_MARKER}`,
  );
  console.log(`Nudged #${issue.number}.`);
}

async function ensureLabel() {
  try {
    await gh("/labels", {
      method: "POST",
      body: { name: LABEL, color: "c97b2e", description: "Monthly playlist link request" },
    });
  } catch (err) {
    if (!String(err.message).includes("(422)")) throw err; // 422 = already exists
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
