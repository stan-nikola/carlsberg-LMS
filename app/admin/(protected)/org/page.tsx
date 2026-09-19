import { EmployeeTree } from "@/components/EmployeeTree";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

// /admin/org — дерево підпорядкування окремою сторінкою. Раніше було
// вкладкою «Дерево» на /admin/employees; переприв'язка керівників — рідка й
// відповідальна операція, їй не місце в перемикачі поруч зі списком.
export default function AdminOrgRoute() {
  return (
    <div className="admin-page">
      <div className="adm-page-head">
        <div>
          <h1>Оргструктура</h1>
          <p className="admin-subtitle">
            Дерево підпорядкування. Перетягніть людину на іншого керівника, щоб переприв&apos;язати; клік по
            імені відкриває картку.
          </p>
        </div>
      </div>
      <EmployeeTree />
    </div>
  );
}
