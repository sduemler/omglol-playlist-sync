// Handles your reply on a playlist-request issue: finds the Apple Music link in
// the comment, publishes it, then confirms and closes the issue. Replying again
// later (even on the closed issue) swaps the link for that month.
//
// The workflow only runs this for comments by the repo owner. The comment text
// arrives through env vars, never interpolated into a shell command.

import {
  UserError,
  currentMonthKey,
  monthName,
  publishPlaylist,
} from "./update-playlist.mjs";
import { closeIssue, comment, issueMonth } from "./github.mjs";

const { COMMENT_BODY = "", ISSUE_NUMBER, ISSUE_BODY = "", ISSUE_STATE } = process.env;
const {
  GITHUB_SERVER_URL = "https://github.com",
  GITHUB_REPOSITORY,
  GITHUB_RUN_ID,
} = process.env;
const runUrl = `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;

async function main() {
  const current = currentMonthKey();
  const monthKey = issueMonth({ body: ISSUE_BODY }) ?? current;

  // Chit-chat on an already-closed issue isn't a request.
  if (ISSUE_STATE === "closed" && !/music\.apple\.com/i.test(COMMENT_BODY)) {
    console.log("Closed issue and no Apple Music link in the comment; ignoring.");
    return;
  }

  if (monthKey !== current) {
    await comment(
      ISSUE_NUMBER,
      `This issue is for ${monthName(monthKey)}, but it's ${monthName(current)} now, ` +
        "so I didn't change the page. Reply on this month's issue, or use **Actions → " +
        "Publish playlist → Run workflow** to set it by hand.",
    );
    return;
  }

  try {
    const { url, changed } = await publishPlaylist(COMMENT_BODY, monthKey);
    await comment(
      ISSUE_NUMBER,
      changed
        ? `Published ${url} to the page ✅`
        : `The page already shows ${url}, so nothing changed ✅`,
    );
    await closeIssue(ISSUE_NUMBER, "completed");
  } catch (err) {
    if (err instanceof UserError) {
      await comment(ISSUE_NUMBER, err.message);
      return;
    }
    await comment(
      ISSUE_NUMBER,
      `Something went wrong publishing the playlist: \`${err.message}\`\n\nRun log: ${runUrl}`,
    );
    throw err;
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
