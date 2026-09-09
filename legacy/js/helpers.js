// Small stateless utilities shared across modules.

export function initials(name) {
  if (!name) return '🙂';
  var parts = name.trim().split(/\s+/).filter(Boolean);
  var s = (parts[0] ? parts[0][0] : '') + (parts[1] ? parts[1][0] : '');
  return s.toUpperCase() || '🙂';
}
