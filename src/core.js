/**
 * archaeologist-live — the self-documenting repo.
 * Incrementally absorbs each merged PR into a living HISTORY.md.
 * Zero dependencies: Node 20+ native fetch only.
 */
import fs from "node:fs";
import path from "node:path";

const GITHUB_API = "https://api.github.com";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ARCHAEOLOGIST_MODEL || "claude-sonnet-4-6";

// ---------------------------------------------------------------- state

const STATE_DIR = ".archaeologist";
const STATE_FILE = "state.json";

export function loadState(repoDir) {
  const p = path.join(repoDir, STATE_DIR, STATE_FILE);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

export function saveState(repoDir, state) {
  const dir = path.join(repoDir, STATE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, STATE_FILE),
    JSON.stringify(state, null, 2) + "\n"
  );
}

export function initState() {
  return {
    version: 1,
    lastMergedAt: new Date(0).toISOString(), // absorb everything on first run
    processedPrs: [],
    fenceCount: 0,
  };
}

// ---------------------------------------------------------------- github

async function gh(url, token) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub ${res.status} for ${url}: ${await res.text()}`);
  }
  return res.json();
}

/** Merged PRs newer than `sinceIso`, oldest first, with files attached. */
export async function fetchNewMergedPrs(repo, sinceIso, token, cap = 30) {
  const out = [];
  for (let page = 1; page <= 5 && out.length < cap; page++) {
    const batch = await gh(
      `${GITHUB_API}/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=50&page=${page}`,
      token
    );
    if (!batch.length) break;
    for (const pr of batch) {
      if (pr.merged_at && pr.merged_at > sinceIso) {
        out.push({
          number: pr.number,
          title: pr.title,
          body: (pr.body || "").slice(0, 3000),
          author: pr.user?.login || "unknown",
          mergedAt: pr.merged_at,
          labels: (pr.labels || []).map((l) => l.name),
          url: pr.html_url,
        });
      }
    }
    // 'updated desc' ordering: once a full page is older than since, stop
    if (batch.every((pr) => (pr.updated_at || "") <= sinceIso)) break;
  }
  out.sort((a, b) => a.mergedAt.localeCompare(b.mergedAt));
  const capped = out.slice(0, cap);
  for (const pr of capped) {
    try {
      const files = await gh(
        `${GITHUB_API}/repos/${repo}/pulls/${pr.number}/files?per_page=30`,
        token
      );
      pr.files = files.map((f) => f.filename);
      pr.additions = files.reduce((s, f) => s + (f.additions || 0), 0);
      pr.deletions = files.reduce((s, f) => s + (f.deletions || 0), 0);
    } catch {
      pr.files = [];
    }
  }
  return capped;
}

// ---------------------------------------------------------------- claude

export async function callClaude(prompt, apiKey, maxTokens = 1500) {
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export function buildUpdatePrompt(repo, prs, recentTail) {
  return `You are the maintainer of a living HISTORY.md for the repository ${repo}. \
New pull requests have just been merged. Absorb them into the record.

Respond with ONLY a JSON object (no markdown fences) shaped as:
{
  "entry": "1-4 sentences of narrative absorbing these PRs, citing PR numbers like (#123). \
Distinguish stated motivations from inference: hedge anything not explicitly written in the PR.",
  "significance": "routine" | "notable" | "major",
  "fences": [
    {
      "title": "short name of the thing future engineers should not change casually",
      "reason": "why, citing the PR",
      "prs": [123]
    }
  ]
}

Rules for "fences": only add one when a PR encodes hard-won context — an incident fix, \
a security hardening, a workaround with non-obvious rationale, a deliberate removal. \
Routine features and dependency bumps get an empty fences array. Be conservative: \
a fence that cries wolf destroys trust.

THE MOST RECENT PORTION OF THE EXISTING HISTORY (for continuity of tone and to avoid repetition):
${recentTail || "(history is empty; this is the first entry)"}

NEWLY MERGED PRS:
${JSON.stringify(prs, null, 1)}`;
}

export function parseClaudeJson(raw) {
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ---------------------------------------------------------------- history file

const HISTORY_HEADER = (repo) => `# A Living History of ${repo}

*Maintained automatically by [archaeologist-live](https://github.com/SAIF-git903/codebase-archaeologist). \
Each merged PR is absorbed into this record. Entries distinguish stated \
motivations from inference.*

## Chesterton's Fences

*Things you should not change without reading the cited history.*

<!-- fences -->

## The Record

<!-- record -->
`;

export function ensureHistory(historyPath, repo) {
  if (!fs.existsSync(historyPath)) {
    fs.writeFileSync(historyPath, HISTORY_HEADER(repo));
  }
}

export function applyUpdate(historyPath, update, dateIso) {
  let doc = fs.readFileSync(historyPath, "utf-8");
  const date = dateIso.slice(0, 10);

  // newest entries first, inserted right after the record marker
  const badge =
    update.significance === "major"
      ? " 🔴"
      : update.significance === "notable"
        ? " 🟡"
        : "";
  const entry = `\n### ${date}${badge}\n\n${update.entry.trim()}\n`;
  doc = doc.replace("<!-- record -->", `<!-- record -->${entry}`);

  for (const fence of update.fences || []) {
    const cites = (fence.prs || []).map((n) => `#${n}`).join(", ");
    const fenceMd = `\n- **${fence.title}** (${cites}, added ${date}): ${fence.reason}\n`;
    doc = doc.replace("<!-- fences -->", `<!-- fences -->${fenceMd}`);
  }
  fs.writeFileSync(historyPath, doc);
}

/** Tail of the record section, for prompt continuity. */
export function recentTail(historyPath, chars = 2500) {
  if (!fs.existsSync(historyPath)) return "";
  const doc = fs.readFileSync(historyPath, "utf-8");
  const i = doc.indexOf("<!-- record -->");
  if (i === -1) return doc.slice(0, chars);
  return doc.slice(i, i + chars);
}

// ---------------------------------------------------------------- main op

export async function update({ repo, repoDir, githubToken, anthropicKey, log = console.log }) {
  const historyPath = path.join(repoDir, "HISTORY.md");
  let state = loadState(repoDir);
  if (!state) {
    log("No state found — initializing (first run absorbs recent history).");
    state = initState();
    // On first run, don't eat the whole repo history: start from 30 days ago
    state.lastMergedAt = new Date(Date.now() - 30 * 864e5).toISOString();
  }

  log(`Fetching PRs merged after ${state.lastMergedAt}...`);
  const prs = await fetchNewMergedPrs(repo, state.lastMergedAt, githubToken);
  const fresh = prs.filter((p) => !state.processedPrs.includes(p.number));
  if (!fresh.length) {
    log("Nothing new to absorb. HISTORY.md is current.");
    return { updated: false };
  }
  log(`Absorbing ${fresh.length} newly merged PR(s): ${fresh.map((p) => "#" + p.number).join(", ")}`);

  ensureHistory(historyPath, repo);
  const prompt = buildUpdatePrompt(repo, fresh, recentTail(historyPath));
  const raw = await callClaude(prompt, anthropicKey);
  let update_;
  try {
    update_ = parseClaudeJson(raw);
  } catch {
    update_ = { entry: raw.slice(0, 800), significance: "routine", fences: [] };
  }

  applyUpdate(historyPath, update_, new Date().toISOString());

  state.lastMergedAt = fresh[fresh.length - 1].mergedAt;
  state.processedPrs = [...state.processedPrs, ...fresh.map((p) => p.number)].slice(-500);
  state.fenceCount += (update_.fences || []).length;
  saveState(repoDir, state);

  log(
    `Updated HISTORY.md (${update_.significance}${update_.fences?.length ? `, +${update_.fences.length} fence(s)` : ""}).`
  );
  return { updated: true, significance: update_.significance, fences: update_.fences || [] };
}
