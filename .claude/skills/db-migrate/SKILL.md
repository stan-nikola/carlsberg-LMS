---
name: db-migrate
description: Apply a prisma/schema.prisma change to carlsberg-LMS's live Neon Postgres database without losing or fabricating real data. Use this whenever a schema change touches a table that already has rows — adding a required column/relation, splitting one model into two, renaming or restructuring — anything where a plain `npx prisma migrate dev` would refuse, ask to reset, or want `--accept-data-loss`. This database holds real employee/course/enrollment data; never run `prisma migrate reset` or `db push --accept-data-loss` to route around a warning without the user explicitly confirming it first.
---

# Migrate the database without losing data

`prisma migrate dev` is interactive and, in this environment, cannot prompt
for a resolution when a step would drop or fabricate data — it just refuses
or reports data loss. That's the right thing for it to do: this database
holds real production-like data (real employees, real course content, real
enrollments imported earlier this project), and this project's hard rule is
**never guess data — leave it unresolved and ask, rather than write
something plausible-but-wrong**. The workflow below gets a schema change
applied safely, on your own terms, instead of letting the CLI force a
reset.

## Steps

1. **Edit `prisma/schema.prisma`** to the desired end state first, same as
   any other migration.

2. **Generate the migration SQL without applying it:**
   ```powershell
   $env:Path = "C:\Program Files\nodejs;" + $env:Path
   npx prisma migrate dev --name <descriptive_name> --create-only
   ```
   If this succeeds cleanly with no data-loss warning, the generated SQL in
   `prisma/migrations/<timestamp>_<name>/migration.sql` is safe as-is — skip
   to step 4.

3. **If Prisma reports it can't do this safely** (e.g. "Added the required
   column `x` ... N rows exist" or a data-loss warning) — hand-edit that
   generated `migration.sql` yourself, in this order, all in one file:
   - Add new columns as **nullable** first (no `NOT NULL` yet).
   - Backfill them with real data — a `DO $$ ... $$` block or `UPDATE` that
     only sets values you can actually derive (from existing columns, from
     values the user gave you) or that reference already-known rows.
     **Never invent a value for a real row just to satisfy a constraint** —
     if a row's correct value genuinely isn't knowable yet, leave it
     `NULL` and say so, don't guess.
   - Only then `ALTER COLUMN ... SET NOT NULL`, add the real foreign-key
     constraints, drop old columns — whatever the schema's final shape
     needs.
   - See `prisma/migrations/20260908180000_course_block_hierarchy/migration.sql`
     in this repo for a worked example (splitting `Module.courseId` into a
     new `Block` table in between, migrating existing rows into it, then
     tightening the constraint).

4. **Apply it non-interactively** (this environment can't run the
   interactive `migrate dev` prompts):
   ```powershell
   npx prisma migrate deploy
   ```

5. **Regenerate the client:**
   ```powershell
   npx prisma generate
   ```

6. **Verify before moving on.** Write a small throwaway script — this
   project's existing pattern:
   ```js
   require("dotenv/config");
   const { PrismaClient } = require("./app/generated/prisma");
   const { PrismaPg } = require("@prisma/adapter-pg");
   const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
   // query the affected table(s), print row counts and a few real rows
   ```
   Run it with `node <script>.js` (prefix `$env:Path = "C:\Program Files\nodejs;" + $env:Path` in PowerShell first),
   confirm the numbers/spot-checked rows look right, then **delete the
   script** — it was just for this one check, not something to keep around.

## Why this matters more than usual here

This isn't a toy dataset. Earlier work in this project already hit real
consequences of skipping steps like this — a wrong heuristic once assigned
a real employee to the wrong manager, caught only because the user happened
to know the org chart personally. Treat every migration as touching real
people's data: prefer leaving a value `NULL` and flagging it over writing
something plausible, and always do the step-6 spot check before considering
the migration done.
