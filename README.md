# carlsberg-LMS

Платформа адаптації Carlsberg Ukraine. В процесі міграції з vanilla
JS + Google Sheets (див. [`/legacy`](./legacy)) на **Next.js (App Router) +
Prisma + Postgres**, з прицілом на деплой у Vercel.

## Стан міграції

- [x] Крок 1 — Next.js ініціалізовано, старий застосунок перенесено в `/legacy`
- [ ] Крок 2 — Prisma schema + підключення БД
- [ ] Крок 3 — перенесення екранів/логіки з `/legacy`
- [ ] Крок 4 — підготовка до деплою на Vercel

## Розробка

```bash
npm install
npm run dev
```

Відкрийте [http://localhost:3000](http://localhost:3000).

## Стара версія (vanilla JS)

Повністю робоча версія на vanilla JS + Google Sheets лежить у
[`/legacy`](./legacy) — використовується лише як довідка під час
перенесення логіки, окремо не деплоїться.
