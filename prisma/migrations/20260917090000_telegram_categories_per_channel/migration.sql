-- AlterTable: add the 5 per-category Telegram flags, defaulting to true
-- (same default the old blanket flag had) so existing rows stay safe.
ALTER TABLE "NotificationPreference" ADD COLUMN     "telegramCourses" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NotificationPreference" ADD COLUMN     "telegramDeadlines" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NotificationPreference" ADD COLUMN     "telegramBadges" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NotificationPreference" ADD COLUMN     "telegramTeam" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NotificationPreference" ADD COLUMN     "telegramNews" BOOLEAN NOT NULL DEFAULT true;

-- Backfill from the old blanket flag: anyone who had explicitly turned
-- Telegram off keeps that choice across all 5 categories.
UPDATE "NotificationPreference" SET
  "telegramCourses" = "telegram",
  "telegramDeadlines" = "telegram",
  "telegramBadges" = "telegram",
  "telegramTeam" = "telegram",
  "telegramNews" = "telegram";

-- AlterTable: the blanket flag is superseded by the 5 columns above.
ALTER TABLE "NotificationPreference" DROP COLUMN "telegram";
