export const THEME_COOKIE = "origami_theme";
export const DEFAULT_THEME_ID = "workshop";

export const THEME_IDS = ["workshop", "helix", "ion", "opal"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export type ThemeSwatches = {
  canvas: string;
  raised: string;
  overlay: string;
  line: string;
  ink: string;
  muted: string;
  accent: string;
  accentDim: string;
  planned: string;
  active: string;
  hold: string;
  done: string;
  archived: string;
};

export type ThemeDefinition = {
  id: ThemeId;
  name: string;
  description: string;
  wallpaper: string;
  swatches: ThemeSwatches;
};

export const THEMES: readonly ThemeDefinition[] = [
  {
    id: "workshop",
    name: "Workshop",
    description: "Warm charcoal and copper — the original Origami look.",
    wallpaper: "/themes/workshop.jpg",
    swatches: {
      canvas: "#101214",
      raised: "#171a1d",
      overlay: "#1e2226",
      line: "#2c3238",
      ink: "#f3efe6",
      muted: "#9a9388",
      accent: "#e08a4a",
      accentDim: "#b56c36",
      planned: "#8ea0b5",
      active: "#e08a4a",
      hold: "#d4a24a",
      done: "#7ea77a",
      archived: "#6d6860",
    },
  },
  {
    id: "helix",
    name: "Helix",
    description: "Void navy and electric cyan. Same structure, colder light.",
    wallpaper: "/themes/helix.jpg",
    swatches: {
      canvas: "#07090f",
      raised: "#0c111a",
      overlay: "#131a26",
      line: "#1e2a3c",
      ink: "#e8f0ff",
      muted: "#7e8da3",
      accent: "#3de0c7",
      accentDim: "#21b5a0",
      planned: "#6d8cff",
      active: "#3de0c7",
      hold: "#e0b84a",
      done: "#5dcc8a",
      archived: "#5a6573",
    },
  },
  {
    id: "ion",
    name: "Ion",
    description: "Deep violet with a magenta signal. Same panels, different glow.",
    wallpaper: "/themes/ion.jpg",
    swatches: {
      canvas: "#0b0710",
      raised: "#140c1a",
      overlay: "#1c1326",
      line: "#322445",
      ink: "#f3eaff",
      muted: "#9b8aaf",
      accent: "#d24dff",
      accentDim: "#a338cc",
      planned: "#7b8cff",
      active: "#d24dff",
      hold: "#e0a84a",
      done: "#5dcc8a",
      archived: "#6a5d78",
    },
  },
  {
    id: "opal",
    name: "Opal",
    description: "Paper white with grey, copper, and sky-blue accents.",
    wallpaper: "/themes/opal.avif",
    swatches: {
      canvas: "#f3f5f7",
      raised: "#ffffff",
      overlay: "#e8ecf0",
      line: "#d0d6dd",
      ink: "#1a2028",
      muted: "#6b7380",
      accent: "#e07a3a",
      accentDim: "#c4632e",
      planned: "#6ba3c7",
      active: "#e07a3a",
      hold: "#d4a24a",
      done: "#5f9a6e",
      archived: "#8a9199",
    },
  },
];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_IDS.includes(value as ThemeId);
}

export function parseThemeId(value: unknown): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME_ID;
}

export function themeById(id: ThemeId): ThemeDefinition {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

/** Opal is the only light theme; all others are dark. */
export function isLightTheme(id: string | null | undefined): boolean {
  return id === "opal";
}
