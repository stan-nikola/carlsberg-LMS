"use client";

import type { Ref } from "react";
import { PeopleIcon } from "@/components/ui/icons";
import { LinesSkeleton } from "@/components/ui/Skeleton";
import { TeamStatusBar } from "@/components/manager/TeamStatusBar";
import { AttentionList } from "@/components/manager/AttentionList";
import { TeamMatrix } from "@/components/manager/TeamMatrix";
import { pluralPeople, type AttentionItem, type StatusBarSegment, type TeamMatrixData } from "@/lib/teamInsights";
import { BarRow, ChartCard } from "@/components/manager/dashboard/ChartCard";
import type { TeamCompareRow } from "@/components/manager/dashboard/types";

/**
 * Полоса статусів команди — кожна людина рівно в одному сегменті, сегмент =
 * посилання на список. Звичайна картка сітки, а не окрема шапка: інакше її не
 * можна було ні зменшити, ні перетягнути, ні прибрати.
 */
export function StatusCard({ statusBar }: { statusBar: { segments: StatusBarSegment[]; total: number; noEnrollments: number } }) {
  return (
    <ChartCard
      icon={<PeopleIcon />}
      title="Стан команди"
      note={`${statusBar.total} ${pluralPeople(statusBar.total)} із призначеннями`}
      hint="Кожна людина рівно в ОДНОМУ сегменті — за найгіршим своїм станом (прострочено → відстає → не почала → неактивна → за графіком). Число в сегменті — люди; друге число поруч у легенді — скільки курсів у цьому стані саме в цих людей. Клік відкриває список саме цих людей."
    >
      <TeamStatusBar data={statusBar} />
    </ChartCard>
  );
}

/** Усі, кому треба увага, за терміновістю з кнопкою «Нагадати» — єдиний блок дашборда, з якого можна одразу ДІЯТИ. */
export function AttentionCard({ items }: { items: AttentionItem[] }) {
  return (
    <ChartCard
      icon={<PeopleIcon />}
      title="Потребують уваги"
      hint="Усі, кому потрібна увага, найтерміновіші зверху: прострочення важать найбільше, далі відставання від графіка, не розпочате й відсутність на платформі. Чипи називають одиницю («2 курси прострочено»), а «Нагадати» надсилає сповіщення з готовим текстом за причиною."
    >
      <AttentionList items={items} />
    </ChartCard>
  );
}

/** Матриця люди × курси (id картки — peopleStatus, заради збереженого в localStorage вибору/порядку). */
export function PeopleMatrixCard({ matrix }: { matrix: TeamMatrixData }) {
  return (
    <ChartCard
      icon={<PeopleIcon />}
      title="Люди × курси"
      hint="Уся команда одним поглядом: рядок — людина (проблемні зверху), стовпчик — курс, клітинка — стан призначення. Клік по клітинці відкриває цей курс у цієї людини, по імені — сторінку людини, по назві курсу — усі призначення курсу."
    >
      <TeamMatrix data={matrix} />
    </ChartCard>
  );
}

/**
 * Той самий підсумок, що «Показники команди», але по КОЖНОМУ прямому
 * підлеглому з усім його піддеревом — порівняння команд, не людей. Дерево
 * вантажиться окремо, коли картка наближається до екрана (cardRef).
 */
export function TeamCompareCard({
  loaded,
  teams,
  live,
  cardRef,
}: {
  loaded: boolean;
  teams: TeamCompareRow[];
  live: boolean;
  cardRef: Ref<HTMLDivElement>;
}) {
  return (
    <ChartCard
      icon={<PeopleIcon />}
      title="Порівняння команд"
      cardRef={cardRef}
      hint="Для кожного прямого підлеглого — підсумок по ньому й усіх, хто під ним (не лише його власні призначення). Дозволяє побачити, чия команда відстає, а не лише загальний середній по всіх одразу."
    >
      {!loaded ? (
        <LinesSkeleton rows={5} />
      ) : teams.length === 0 ? (
        <p className="admin-hint">Немає даних.</p>
      ) : (
        <ul className="mgr-bar-list">
          {teams.map((t) => (
            // Клік — та сама сторінка команди в межах піддерева цього підлеглого (?team=).
            <BarRow
              key={t.id}
              href={`/manager/team?team=${t.id}`}
              stacked
              label={
                <>
                  <span className="mgr-bar-label-main">{t.name}</span>
                  {t.overdue > 0 ? <span className="mgr-bar-label-sub">{t.overdue} прострочено</span> : null}
                </>
              }
              pct={live ? t.pct : 0}
              value={`${t.completed}/${t.total} · ${t.pct}%`}
            />
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
