export type ThemePreference = "system" | "light" | "dark";

const storageKey = "konogoro-theme";

export function getThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const value = window.localStorage.getItem(storageKey);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function setThemePreference(preference: ThemePreference) {
  try { window.localStorage.setItem(storageKey, preference); }
  catch { /* テーマ切替はストレージを利用できない環境でも現在の画面には反映する。 */ }

  if (preference === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = preference;

  const lightMeta = document.querySelector<HTMLMetaElement>('meta[data-theme-color="light"]');
  const darkMeta = document.querySelector<HTMLMetaElement>('meta[data-theme-color="dark"]');
  if (!lightMeta || !darkMeta) return;
  lightMeta.media = preference === "dark" ? "not all" : preference === "light" ? "all" : "(prefers-color-scheme: light)";
  darkMeta.media = preference === "light" ? "not all" : preference === "dark" ? "all" : "(prefers-color-scheme: dark)";
}

export function initializeTheme() {
  setThemePreference(getThemePreference());
}
