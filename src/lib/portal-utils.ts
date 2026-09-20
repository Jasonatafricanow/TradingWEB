"use client";

/**
 * Radix Portal 容器策略。
 *
 * 历史：早期为了规避 Radix Portal 卸载时偶发的 removeChild NotFoundError，
 * 这里手动 createElement 了一个 `#radix-portal-container`，并设了
 * `position: relative; z-index: 9999`，让所有 Radix overlay portal 进它。
 *
 * 问题：这个容器和 navbar 的 sticky + backdrop-blur 创建的 stacking
 * context 配合不好，会让 dropdown / popover / select 等下拉在 navbar
 * 里的触发器点击后毫无反应（z-index / stacking 错位）。
 *
 * 现在：让 Radix 用默认的 body portal。removeChild 的 race 由
 * `components/client-providers.tsx` 里的全局 ErrorEvent handler 兜底，
 * 已经够用。这两个导出保留，但 getPortalContainer 永远返回 null
 * （Radix 收到 null 时默认走 document.body），保持向后兼容。
 */

export function getPortalContainer(): HTMLElement | null {
  return null;
}

/** 历史 API，保留导出以兼容 client-providers 引用，但不再有副作用 */
export function PortalContainerInit() {
  return null;
}
