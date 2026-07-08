# 📖 archaeologist-live

**The self-documenting repo.** A GitHub Action + CLI that absorbs every merged
PR into a living `HISTORY.md` — a continuously updated narrative of your
codebase, with **Chesterton's Fences** flagging the code nobody should change
without reading the history first.

Documentation rots because updating it is a chore. This makes it a side
effect of merging.

Sequel to [codebase-archaeologist](https://github.com/SAIF-git903/codebase-archaeologist),
which reconstructs history retroactively; this one keeps it alive going forward.

## What you get

After every merge to main, `HISTORY.md` gains a dated entry:

```markdown
## Chesterton's Fences
- **DB write retry wrapper** (#13, added 2026-07-09): Added after the July
  2026 outage; removing it reintroduces pool-exhaustion failures.

## The Record
### 2026-07-09 🔴
An emergency fix (#13) added retry logic to database writes after a
production outage; the PR explicitly cites connection pool exhaustion.

### 2026-07-08
Added the member export feature (#12); the PR states it was requested by
gym staff for monthly reporting.
```

- 🔴 major / 🟡 notable / unbadged routine — triage at a glance
- Fences are added **conservatively**: only for incident fixes, security
  hardening, and non-obvious workarounds. A fence that cries wolf destroys trust.
- Stated motivations vs. inference are distinguished, always.

## Install as a GitHub Action (recommended)

1. Add your `ANTHROPIC_API_KEY` to the repo: Settings → Secrets and variables
   → Actions → New repository secret
2. Create `.github/workflows/history.yml` — see [examples/workflow.yml](examples/workflow.yml)
3. Merge a PR. Watch `HISTORY.md` write itself.

Costs roughly a fraction of a cent per merged PR.

## Or run via CLI / npx

```bash
export GITHUB_TOKEN=...
export ANTHROPIC_API_KEY=...
cd your-repo
npx archaeologist-live update owner/repo
```

State lives in `.archaeologist/state.json` (commit it — it's what makes runs
incremental and idempotent). First run absorbs the last 30 days; for the full
back-history, generate a foundation document with codebase-archaeologist first.

## Design notes

- **Zero dependencies.** Node 20+ native fetch only. Nothing to audit, nothing
  to break.
- **Idempotent.** Already-processed PRs are tracked in state; re-runs are safe.
- **Honest.** The prompt forbids inventing motivations; unstated rationale is
  hedged explicitly.

## Roadmap

- Python runner (same state format, `pip install archaeologist-live`)
- Fence-aware PR review: comment when a PR *touches* fenced code
- Weekly digest mode for high-velocity repos (batch instead of per-merge)
- Seed from a codebase-archaeologist retroactive history

## License

MIT
# archaeologist-live
