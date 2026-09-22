/**
 * "ДОБРОГО ВЕЧОРА!" на Home — та сама kicker-стилістика (.greeting), що й
 * заголовки решти вкладок хаба (НАВЧАННЯ / ВАШ ПРОГРЕС / ПРОФІЛЬ), одним
 * шрифтом (рішення користувача, 2026-09-22). Ім'я прибрано зовсім — воно
 * й так на зеленій картці нижче (ProfileCard), тут дублювало.
 */
export function GreetingHeading({ greet }) {
  return <h1 className="greeting hub-greeting-h1">{greet}!</h1>;
}
