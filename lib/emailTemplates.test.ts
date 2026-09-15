import { describe, it, expect } from "vitest";
import { buildLoginPinEmail, escapeHtml } from "@/lib/emailTemplates";

const base = { employeeName: "Технік HoReCa", externalCode: "TECH0072", pin: "4821" };

describe("buildLoginPinEmail", () => {
  it("лист співробітнику: PIN, код і введене ім'я є і в text, і в html", () => {
    const mail = buildLoginPinEmail({ ...base, enteredName: "Олена Коваль", isSelf: true });
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain("4821");
      expect(body).toContain("TECH0072");
      expect(body).toContain("Олена Коваль");
    }
    expect(mail.subject).toContain("Ваш PIN");
  });

  it("лист керівнику: є ім'я з бази та прохання передати особисто", () => {
    const mail = buildLoginPinEmail({ ...base, isSelf: false });
    expect(mail.subject).toContain("Технік HoReCa");
    expect(mail.text).toContain("Передайте цей код співробітнику особисто");
    expect(mail.html).toContain("Технік HoReCa");
  });

  // enteredName — довільний текст від незалогіненої людини: у HTML він
  // мусить бути екранований, інакше це XSS у поштовому клієнті керівника.
  it("введене ім'я екранується в html", () => {
    const mail = buildLoginPinEmail({ ...base, enteredName: `<img src=x onerror="alert(1)">`, isSelf: false });
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;img src=x");
  });

  it("порожнє введене ім'я не лишає порожнього рядка «Введене ім'я:»", () => {
    const mail = buildLoginPinEmail({ ...base, enteredName: "   ", isSelf: true });
    expect(mail.text).not.toContain("Введене ім'я");
    expect(mail.html).not.toContain("Введене ім'я");
  });

  it("логотип підвантажується з public/ і прив'язаний до cid у html", () => {
    const mail = buildLoginPinEmail({ ...base, isSelf: true });
    expect(mail.logo).not.toBeNull();
    expect(mail.logo!.content.length).toBeGreaterThan(0);
    expect(mail.html).toContain(`cid:${mail.logo!.cid}`);
  });
});

describe("escapeHtml", () => {
  it("екранує всі п'ять спецсимволів", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });
});
