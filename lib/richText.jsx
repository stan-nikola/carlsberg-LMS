/**
 * Мінімальний безпечний рендер тексту з **жирним** (без dangerouslySetInnerHTML
 * і без залежності від markdown-парсера) — легасі-контент курсів був з <b>,
 * тут той самий ефект через **подвійні зірочки**. Розбиває на параграфи по
 * порожньому рядку.
 */
export function renderRichText(text) {
  if (!text) return null;
  return text.split(/\n\n+/).map((paragraph, pIdx) => (
    <p key={pIdx}>
      {paragraph.split(/(\*\*[^*]+\*\*)/g).map((chunk, cIdx) => {
        const match = chunk.match(/^\*\*([^*]+)\*\*$/);
        return match ? <strong key={cIdx}>{match[1]}</strong> : chunk;
      })}
    </p>
  ));
}
