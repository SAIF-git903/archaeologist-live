/** GitHub Action entrypoint (node20 runtime, zero deps). */
import fs from "node:fs";
import { update } from "./core.js";

const repo = process.env.GITHUB_REPOSITORY;
const result = await update({
  repo,
  repoDir: process.env.GITHUB_WORKSPACE || process.cwd(),
  githubToken: process.env.INPUT_GITHUB_TOKEN || process.env.GITHUB_TOKEN,
  anthropicKey: process.env.INPUT_ANTHROPIC_API_KEY,
});
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `updated=${result.updated}\nsignificance=${result.significance || "none"}\n`
  );
}
