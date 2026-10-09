"use client";

import { useEffect } from "react";
import { applyOverrides, readOverrides } from "@/lib/designTokens";

/**
 * Прев’ю дизайн-токенів з /admin/design на всьому застосунку в ЦЬОМУ
 * браузері (localStorage). Без збережених значень нічого не робить.
 */
export function DesignTokensOverride() {
  useEffect(() => {
    const v = readOverrides();
    if (Object.keys(v).length) applyOverrides(v);
  }, []);
  return null;
}
