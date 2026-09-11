// Раніше сертифікат був звичайним <a href="/api/.../certificate">
// (Content-Disposition: attachment мав примусити браузер завантажити
// файл) — на практиці мобільні браузери/PWA-контекст це ігнорують і
// відкривають PDF ПРЯМО В ПОТОЧНІЙ ВКЛАДЦІ, замінюючи весь застосунок
// голим переглядачем PDF без жодної навігації назад (реальна скарга
// користувача: "нема кнопок зберегти/вийти/закрити"). Тягнемо файл через
// fetch як blob і зберігаємо через тимчасове посилання-клік — сторінка
// взагалі нікуди не переходить, користувач лишається там, де й був.
export async function downloadCertificate(slug, localName) {
  const url = `/api/courses/${slug}/certificate${localName ? `?name=${encodeURIComponent(localName)}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) {
    let message = "Не вдалося завантажити сертифікат.";
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // Відповідь не JSON (напр. 500 без тіла) - лишаємо дефолтне повідомлення.
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `sertyfikat-${slug}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
