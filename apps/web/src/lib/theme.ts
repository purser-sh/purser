export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "purser-theme";

export function readThemePreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "light";
}

export function applyThemePreference(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "light") {
    root.dataset.theme = "light";
  } else if (preference === "dark") {
    root.dataset.theme = "dark";
  } else {
    delete root.dataset.theme;
  }
  localStorage.setItem(STORAGE_KEY, preference);
}

export function initTheme(): ThemePreference {
  const preference = readThemePreference();
  applyThemePreference(preference);
  return preference;
}

export function cycleTheme(preference: ThemePreference): ThemePreference {
  const next: ThemePreference =
    preference === "system" ? "light" : preference === "light" ? "dark" : "system";
  applyThemePreference(next);
  return next;
}

export function themeLabel(preference: ThemePreference): string {
  if (preference === "light") {
    return "Light theme";
  }
  if (preference === "dark") {
    return "Dark theme";
  }
  return "System theme";
}
