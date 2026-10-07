// Small GitHub REST helper for the reminder/reply workflows. Uses the
// workflow's GITHUB_TOKEN and GITHUB_REPOSITORY (both set by Actions).

export const LABEL = "playlist-request";
const MONTH_MARKER = /<!-- playlist-month:(\d{4}-\d{2}) -->/;

export function monthMarker(monthKey) {
  return `<!-- playlist-month:${monthKey} -->`;
}

// The month an issue is asking about, from the hidden marker in its body.
export function issueMonth(issue) {
  return (issue.body || "").match(MONTH_MARKER)?.[1] ?? null;
}

export async function gh(path, { method = "GET", body } = {}) {
  const { GITHUB_TOKEN, GITHUB_REPOSITORY } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) {
    throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY must be set.");
  }
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPOSITORY}${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body && { "Content-Type": "application/json" }),
      },
      body: body && JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(`GitHub ${method} ${path} failed (${res.status}): ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

export async function listOpenRequests() {
  const issues = await gh(`/issues?state=open&labels=${LABEL}&per_page=100`);
  return issues.filter((i) => !i.pull_request);
}

export function comment(number, body) {
  return gh(`/issues/${number}/comments`, { method: "POST", body: { body } });
}

export function closeIssue(number, reason = "completed") {
  return gh(`/issues/${number}`, {
    method: "PATCH",
    body: { state: "closed", state_reason: reason },
  });
}

// Comment on and close every open request issue whose month passes `match`.
export async function closeRequestIssues(match, message, reason) {
  for (const issue of await listOpenRequests()) {
    if (match(issueMonth(issue))) {
      await comment(issue.number, message);
      await closeIssue(issue.number, reason);
      console.log(`Closed #${issue.number}.`);
    }
  }
}
