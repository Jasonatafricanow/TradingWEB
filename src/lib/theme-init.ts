/** 色彩模式（浅色 / 深色 / 跟随系统）共享常量与初始化脚本。
 *  独立于客户端组件模块，服务端布局可安全内联该脚本。
 *  暗类同时作用于 html 与 body：主题变量定义在 body.theme-* 上，
 *  仅 html 挂 .dark 会被 body 自身的浅色变量覆盖。 */

export type ColorMode = "light" | "dark" | "system";

export const COLOR_MODE_STORAGE_KEY = "gt-color-mode";

/** 在 hydration 前恢复用户选择的色彩模式，避免闪烁 */
export const themeInitScript = `(function(){try{var m=localStorage.getItem("${COLOR_MODE_STORAGE_KEY}")||"system";var d=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);var b=document.body;if(b){b.classList.toggle("dark",d);}else{document.addEventListener("DOMContentLoaded",function(){document.body.classList.toggle("dark",d);});}}catch(e){}})();`;

export function applyColorMode(mode: ColorMode) {
  const dark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.body.classList.toggle("dark", dark);
}