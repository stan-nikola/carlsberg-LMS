import path from "node:path";
import PDFDocument from "pdfkit";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PLATFORM_NAME, PLATFORM_TAGLINE, PLATFORM_LOGO_PATH } from "@/lib/branding";

// Carlsberg-зелений (той самий, що --green-700/--green-900 у tokens.css) —
// PDF генерується поза браузером, CSS-змінні тут недоступні, тому взято
// прямий hex того самого відтінку.
const BRAND_GREEN = "#0b4a34";
const BRAND_GOLD = "#b49132";
const LOGO_ABSOLUTE_PATH = path.join(process.cwd(), PLATFORM_LOGO_PATH);

// pdfkit-овий "Helvetica"/"Helvetica-Bold" — це один зі стандартних 14
// base-шрифтів PDF (WinAnsiEncoding), у якого ФІЗИЧНО немає кириличних
// гліфів — не баг рендерингу, кирилиця там просто відсутня як символи.
// Тому для сертифіката (весь текст українською) потрібен реально
// вбудований шрифт із кирилицею. Carlsberg Sans (public/fonts/carlsberg/)
// уже підтверджено має кирилицю (і специфічно українські і/ї/є/ґ), але
// лежить лише в .woff2 — pdfkit/fontkit не вміє коректно субсетувати
// woff2 напряму (падає з RangeError при .end()). public/fonts/pdf/*.ttf —
// ті самі гліфи Carlsberg Sans Light/Bold, один раз розпаковані в сирий
// TTF (wawoff2.decompress, WOFF2 — це стиснені SFNT-таблиці, розпакування
// не змінює самі гліфи/ліцензію шрифту) — див. public/fonts/pdf/README.md.
const FONT_REGULAR_PATH = path.join(process.cwd(), "public/fonts/pdf/CarlsbergSans-Light.ttf");
const FONT_BOLD_PATH = path.join(process.cwd(), "public/fonts/pdf/CarlsbergSans-Bold.ttf");

function formatDateUk(date) {
  return new Date(date).toLocaleDateString("uk-UA", { day: "2-digit", month: "long", year: "numeric" });
}

function buildCertificatePdf({ employeeName, courseTitle, completedAt }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("body", FONT_REGULAR_PATH);
    doc.registerFont("bold", FONT_BOLD_PATH);

    const { width, height } = doc.page;

    // Рамка — подвійна лінія, класичний вигляд сертифіката.
    doc.rect(24, 24, width - 48, height - 48).lineWidth(2).stroke(BRAND_GREEN);
    doc.rect(34, 34, width - 68, height - 68).lineWidth(0.75).stroke(BRAND_GOLD);

    // Той самий логотип, що й PWA-іконка застосунку (public/icons/) —
    // єдине джерело правди lib/branding.js, а не окрема картинка "для PDF".
    const logoSize = 46;
    doc.image(LOGO_ABSOLUTE_PATH, width / 2 - logoSize / 2, 38, { width: logoSize, height: logoSize });

    doc
      .font("body")
      .fontSize(12)
      .fillColor(BRAND_GREEN)
      .text(PLATFORM_NAME.toUpperCase(), 0, 92, { align: "center", characterSpacing: 1.2 });
    doc
      .font("body")
      .fontSize(9)
      .fillColor("#666666")
      .text(PLATFORM_TAGLINE, 0, 108, { align: "center" });

    doc
      .font("bold")
      .fontSize(32)
      .fillColor(BRAND_GREEN)
      .text("СЕРТИФІКАТ", 0, 138, { align: "center" });

    doc
      .font("body")
      .fontSize(14)
      .fillColor("#333333")
      .text("Цим підтверджується, що", 0, 198, { align: "center" });

    doc
      .font("bold")
      .fontSize(26)
      .fillColor("#111111")
      .text(employeeName, 0, 223, { align: "center" });

    doc
      .font("body")
      .fontSize(14)
      .fillColor("#333333")
      .text("успішно опрацював(-ла) курс", 0, 268, { align: "center" });

    doc
      .font("bold")
      .fontSize(20)
      .fillColor(BRAND_GREEN)
      .text(courseTitle, 60, 293, { align: "center", width: width - 120 });

    doc
      .font("bold")
      .fontSize(16)
      .fillColor(BRAND_GOLD)
      .text("зі 100% результатом", 0, 333, { align: "center" });

    doc
      .font("body")
      .fontSize(11)
      .fillColor("#555555")
      .text(`Дата завершення: ${formatDateUk(completedAt)}`, 0, height - 90, { align: "center" });

    doc.end();
  });
}

// GET /api/courses/:slug/certificate — PDF-сертифікат про 100% проходження.
// Навмисно 100%, не "просто складено" (>=80%): сертифікат — окрема,
// вища планка, щоб мотивувати вчити матеріал по-справжньому, а не лише
// "пройти поріг" (те саме прохання користувача — заохотити старатись).
export async function GET(request, { params }) {
  const { slug } = await params;
  const employee = await getCurrentUser();
  if (!employee) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const course = await prisma.course.findUnique({ where: { slug } });
  if (!course) return new Response(JSON.stringify({ error: "Course not found" }), { status: 404 });

  const enrollment = await prisma.enrollment.findUnique({
    where: { employeeId_courseId: { employeeId: employee.id, courseId: course.id } },
  });
  if (!enrollment || enrollment.status !== "completed" || enrollment.scorePercent !== 100) {
    return new Response(JSON.stringify({ error: "Сертифікат доступний лише при 100% проходженні курсу" }), {
      status: 403,
    });
  }

  const buffer = await buildCertificatePdf({
    employeeName: employee.name,
    courseTitle: course.title,
    completedAt: enrollment.completedAt,
  });

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="sertyfikat-${course.slug}.pdf"`,
    },
  });
}
