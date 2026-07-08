# 📖 archaeologist-live

> **The self-documenting repo.** A GitHub Action + CLI that absorbs every merged
> PR into a living `HISTORY.md` — a continuously updated narrative of your
> codebase, with **Chesterton's Fences** flagging code nobody should change
> without reading the history first.

Documentation rots because updating it is a chore. This makes it a side
effect of merging.

Works with **Anthropic (Claude)** or **OpenAI** — bring your own key.
Zero dependencies. Node 20+.

Sequel to [codebase-archaeologist](https://github.com/SAIF-git903/codebase-archaeologist),
which reconstructs a repo's history retroactively; this one keeps it alive
going forward.

---

## What you get

After every merge, `HISTORY.md` gains a dated entry — written by the LLM,
grounded in the PR's actual description and diff metadata:

```markdown
## Chesterton's Fences

- **Print-compatible layout in the receipt view** (#1, added 2026-07-08):
  PR #1 explicitly documents that this layout exists to support the staff
  receipt-printing workflow — it could easily be mistaken for unused CSS
  and removed by a future contributor.

## The Record

### 2026-07-08
Two README documentation patches (#1, #2) were merged, adding notes that
member receipts can be printed directly from the member page. The stated
motivation was a discovery during a front-desk staff walkthrough: staff
were screenshotting receipts and sharing them over WhatsApp because the
print feature was unknown.
```

*(Real output — the first entry this tool wrote about its own test repo.)*

- 🔴 major / 🟡 notable / unbadged routine — triage at a glance
- **Fences are conservative by design**: only incident fixes, security
  hardening, and non-obvious workarounds. A fence that cries wolf destroys trust.
- **Honest epistemics**: stated motivations are reported as stated; anything
  inferred is hedged as inference. The prompt forbids inventing rationale.

## Requirements

An API key from **[Anthropic](https://console.anthropic.com)** or
**[OpenAI](https://platform.openai.com)** — pay-as-you-go, typically
**well under $0.01 per merged PR**.

**Your key never leaves your environment.** Calls go directly from your
machine or CI runner to your provider. This package contains no telemetry,
no middleman server, and zero dependencies.

## Install as a GitHub Action (recommended)

**1.** Add your key to the repo: Settings → Secrets and variables → Actions
→ New repository secret → `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`)

**2.** Enable commit-back: Settings → Actions → General → Workflow
permissions → **Read and write permissions**

**3.** Create `.github/workflows/history.yml`:

```yaml
name: Living History
on:
  pull_request:
    types: [closed]
    branches: [main]
permissions:
  contents: write
  pull-requests: read
jobs:
  absorb:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: SAIF-git903/archaeologist-live@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          # or: openai_api_key: ${{ secrets.OPENAI_API_KEY }}
      - name: Commit updated history
        run: |
          git config user.name "archaeologist-live[bot]"
          git config user.email "bot@archaeologist.dev"
          git add HISTORY.md .archaeologist/state.json
          git diff --cached --quiet || git commit -m "chronicle: absorb PR #${{ github.event.pull_request.number }} [skip ci]"
          git push
```

**4.** Merge a PR. Watch `HISTORY.md` write itself.

See [examples/](examples/) for ready-made workflow files for both providers.

## Or run via CLI

```bash
export GITHUB_TOKEN=github_pat_...
export ANTHROPIC_API_KEY=sk-ant-...   # or OPENAI_API_KEY=sk-...

cd your-repo
npx archaeologist-live update owner/repo
```

Windows PowerShell: `$env:ANTHROPIC_API_KEY = "..."` instead of `export`.

Runs are **incremental and idempotent**: state lives in
`.archaeologist/state.json` (commit it). Already-absorbed PRs are never
double-written; a re-run with nothing new is a no-op. The first run absorbs
the last 30 days; for the full back-history, generate a foundation document
with [codebase-archaeologist](https://github.com/SAIF-git903/codebase-archaeologist)
first.

## Configuration

| Env var | Purpose | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic auth | — |
| `OPENAI_API_KEY` | OpenAI auth | — |
| `ARCHAEOLOGIST_PROVIDER` | Force `anthropic` or `openai` when both keys exist | anthropic |
| `ARCHAEOLOGIST_MODEL` | Anthropic model | `claude-sonnet-4-6` |
| `ARCHAEOLOGIST_OPENAI_MODEL` | OpenAI model | `gpt-4o-mini` |
| `GITHUB_TOKEN` | PR data access (auto-provided in Actions) | — |

## FAQ

**Where does my API key live?** In your repo's encrypted Actions secrets (or
your shell env for CLI use). GitHub injects it into the runner at execution
time and masks it in logs; the runner is destroyed after the job.

**Who pays for the LLM calls?** You do, to your own provider, for your own
merges only. The author of this package never sees your key, your data, or
your bill.

**What if a run fails?** Nothing is lost. State only advances after a
successful write, so the next run re-absorbs anything missed.

**Does it work on private repos?** Yes — the action reads PR data with the
built-in `github.token`.

## Design notes

- **Zero dependencies.** Native fetch only. Nothing to audit, nothing to break.
- **Idempotent.** Processed PRs are tracked in state; re-runs are safe.
- **Conservative.** The fence prompt is explicitly instructed that a false
  alarm is worse than a missed one.

## Roadmap

- Python runner (same state format)
- More providers: Gemini; local models via OpenAI-compatible endpoints (Ollama)
- Fence-aware PR review: comment when a PR *touches* fenced code
- Weekly digest mode for high-velocity repos
- Seeding from a codebase-archaeologist retroactive history

Issues and PRs welcome — this is an early experiment in living documentation.

## License

MIT