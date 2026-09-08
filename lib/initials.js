// Портовано з legacy/js/helpers.js без изменений в логике.
export function initials(name) {
  if (!name) return "🙂";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s = (parts[0] ? parts[0][0] : "") + (parts[1] ? parts[1][0] : "");
  return s.toUpperCase() || "🙂";
}
