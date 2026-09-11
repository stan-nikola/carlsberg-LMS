# Шрифти для PDF (сертифікат)

`CarlsbergSans-Light.ttf` / `CarlsbergSans-Bold.ttf` — ті самі гліфи, що
й `public/fonts/carlsberg/CarlsbergSans-{Light,Bold}.woff2` (офіційний
фірмовий шрифт, ліцензійний пакет "Carlsberg Sans v3100" — деталі
ліцензії там-таки, `public/fonts/carlsberg/README.md`), лише розпаковані
в сирий TTF (`wawoff2.decompress`, одноразово, скрипт не зберігався —
WOFF2 це просто стиснені SFNT-таблиці, розпакування не змінює самі
гліфи/метрики шрифту).

Навіщо окрема копія: `pdfkit`/`fontkit` не вміє коректно субсетувати
`.woff2` напряму (падає з `RangeError` при виклику `.end()`) — потрібен
звичайний `.ttf`/`.otf`. Стандартні base-шрифти PDF (`Helvetica` тощо) тут
не підходять узагалі — вони фізично не мають кириличних гліфів
(WinAnsiEncoding), а весь текст сертифіката українською
(`app/api/courses/[slug]/certificate/route.js`).
