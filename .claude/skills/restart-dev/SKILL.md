---
name: restart-dev
description: Cleanly restart the carlsberg-LMS Next.js dev server on Windows when it's stuck, unresponsive, throwing HMR/WebSocket errors, or `npm run dev` fails with an EPERM "operation not permitted, rename ...\.next\dev\server\..." error. Always reach for this skill instead of just re-running `npm run dev` after any edit to schema.prisma, next.config.mjs, or after a background dev-server process was killed/interrupted — a stale, still-locked node process is almost always the real cause of build errors that look unrelated to the actual code change.
---

# Restart the dev server cleanly

Turbopack keeps files under `.next\dev\...` open while its node process is
alive. If a previous `npm run dev` didn't get to shut down cleanly — Ctrl+C
during an active build, a killed terminal, a background run left dangling —
the next `npm run dev` fails with something like:

```
Node.js fs rename failed after 101 retries with error Error: EPERM: operation
not permitted, rename '...\.next\dev\server\server-reference-manifest.js.tmp...'
```

Deleting `.next` without first killing the old process doesn't help — it
just recreates the lock. The order matters: kill the process, **then**
clear the cache, **then** start fresh.

## Run it

```powershell
powershell -ExecutionPolicy Bypass -File .claude/skills/restart-dev/scripts/restart-dev.ps1
```

This does, in order:
1. Force-stops any lingering `node` processes.
2. Removes the `.next` build cache.
3. Puts Node on `PATH` (`C:\Program Files\nodejs`) and starts `npm run dev`.

Run step 3 in the background — it's a long-running server, not a one-shot
command. After starting it, give it a couple of seconds and check the
server's output for `✓ Ready` before navigating to the app, to confirm the
EPERM loop is actually gone and not just retried silently.

## When to reach for this vs. just restarting

- Schema/config changes (`prisma/schema.prisma`, `next.config.mjs`,
  `.env`) don't hot-reload — always restart after those, not just after a
  build error.
- If you see EPERM/rename errors, a 500 on every route, or the dev server
  seems to hang mid-compile, this is very likely the fix — don't spend time
  debugging the actual page code first.
- If restarting still doesn't clear an EPERM error, something outside this
  project (antivirus, a file indexer, OneDrive) may be holding the file —
  that's a Windows-level issue this script can't fix.
