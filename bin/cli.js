#!/usr/bin/env node
/** archaeologist-live CLI: `npx archaeologist-live update owner/repo` */
import { update } from "../src/core.js";

const [cmd, repo] = process.argv.slice(2);

if (cmd !== "update" || !repo) {
  console.log(`archaeologist-live — the self-documenting repo

Usage:
  npx archaeologist-live update <owner/repo>

Env:
  GITHUB_TOKEN        GitHub token (in Actions, use secrets.GITHUB_TOKEN)
  ANTHROPIC_API_KEY   Anthropic API key

Run from the root of the checked-out repository. Maintains HISTORY.md
and .archaeologist/state.json; commit both.`);
  process.exit(cmd ? 1 : 0);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set.");
  process.exit(1);
}

update({
  repo,
  repoDir: process.cwd(),
  githubToken: process.env.GITHUB_TOKEN,
  anthropicKey: process.env.ANTHROPIC_API_KEY,
}).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
