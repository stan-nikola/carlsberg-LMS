// Спільні хелпери побудови Excel-звітів (exceljs) — винесено з
// app/api/manager/export/route.js (Фаза B адмінки, повний дамп бази),
// щоб /api/admin/export імпортував ті самі функції, а не копіював їх.
// Увесь стиль (кольори, рамки, freeze-заголовок, data-bar замість
// справжніх діаграм — exceljs їх не вміє записувати) — той самий, що вже
// був у звіті керівника, тут лише не прив'язаний до одного файлу.

export const BRAND_GREEN = "FF00321E";
export const HEADER_FILL = "FFEFF3F0";
export const FAIL_FILL = "FFFFE1E1";
export const GREEN_TINT = "FFE3F5EA";
export const BORDER_COLOR = "FFD7E0E2";
const THIN_BORDER = { style: "thin", color: { argb: BORDER_COLOR } };
export const CELL_BORDER = { top: THIN_BORDER, left: THIN_BORDER, bottom: THIN_BORDER, right: THIN_BORDER };

export function fmtDate(value) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export function fmtMinutes(seconds) {
  if (seconds == null) return "";
  return Math.round(seconds / 60);
}

// Золото/срібло/бронза — той самий поріг (100% / 95%+ / 90%+), що вже
// показує MedalIcon/medalTier (lib/progress.js) — тут емодзі замість SVG,
// Excel не малює React-іконки.
export function medalEmoji(scorePercent) {
  if (scorePercent == null) return "";
  if (scorePercent >= 100) return "🥇";
  if (scorePercent >= 95) return "🥈";
  if (scorePercent >= 90) return "🥉";
  return "";
}

export function styleHeaderRow(row) {
  row.font = { bold: true, color: { argb: BRAND_GREEN } };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = CELL_BORDER;
  });
  row.commit();
}

/** Рамки по кожній клітинці таблиці (не лише лінія під заголовком). */
export function addBorders(ws, firstRow, lastRow, colCount) {
  for (let r = firstRow; r <= lastRow; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= colCount; c++) {
      row.getCell(c).border = CELL_BORDER;
    }
    row.commit();
  }
}

export function autoSheet(wb, name, columns, rows) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns;
  styleHeaderRow(ws.getRow(1));
  rows.forEach((r) => ws.addRow(r));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  if (rows.length > 0) addBorders(ws, 2, rows.length + 1, columns.length);
  return ws;
}

/** Фарбує кожен рядок даних у зелений/червоний за колонкою "Так"/"Ні". */
export function highlightPassColumn(ws, columnKey) {
  const colIndex = ws.columns.findIndex((c) => c.key === columnKey) + 1;
  if (!colIndex) return;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const value = row.getCell(colIndex).value;
    if (value !== "Так" && value !== "Ні") return;
    const fill = { type: "pattern", pattern: "solid", fgColor: { argb: value === "Так" ? GREEN_TINT : FAIL_FILL } };
    row.eachCell((cell) => {
      cell.fill = fill;
    });
  });
}

const STATUS_LABELS = {
  not_started: "Не розпочато",
  in_progress: "В процесі",
  overdue: "Прострочено",
};

// completed саме по собі означає лише "дійшов до кінця" — НЕ "склав".
export function statusLabel(status, passed) {
  if (status === "completed") return passed ? "Складено" : "Завершено, не складено";
  return STATUS_LABELS[status] || status;
}
