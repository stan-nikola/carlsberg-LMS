import { initials } from "@/lib/initials";

/**
 * Аватар людини: фото (Employee.avatarUrl), а без нього — ініціали на
 * золотому кружку, як було завжди. Один компонент для картки профілю,
 * лідерборду і дерева команди — розмір задає модифікатор .avatar-sm/-md.
 */
export function Avatar({
  name,
  src,
  size = "md",
  className = "",
}: {
  name?: string | null;
  src?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span className={`avatar avatar-${size}${className ? ` ${className}` : ""}`} aria-hidden={src ? undefined : true}>
      {/* Файл уже 256×256 WebP з нашого ж Blob — next/image лише додав би
          зайвий прохід через оптимізатор. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt={name || ""} /> : initials(name || "")}
    </span>
  );
}
