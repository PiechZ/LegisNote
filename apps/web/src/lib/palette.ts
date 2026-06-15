/**
 * Curated colour palettes for highlights and tags. We deliberately offer a small
 * fixed set instead of a full RGB picker so the reader stays visually consistent.
 */
export interface Swatch {
  name: string;
  value: string;
}

/** Pastel fills for highlights (rendered as a translucent background / left bar). */
export const HIGHLIGHT_COLORS: Swatch[] = [
  { name: "Žlutá", value: "#ffe066" },
  { name: "Zelená", value: "#b2f2bb" },
  { name: "Modrá", value: "#a5d8ff" },
  { name: "Růžová", value: "#fcc2d7" },
  { name: "Oranžová", value: "#ffd8a8" },
  { name: "Fialová", value: "#d0bfff" },
];

export const DEFAULT_HIGHLIGHT = "#ffe066";

/** Stronger colours for tags (rendered as an underline / chip border). */
export const TAG_COLORS: Swatch[] = [
  { name: "Červená", value: "#e03131" },
  { name: "Oranžová", value: "#e8590c" },
  { name: "Zelená", value: "#2f9e44" },
  { name: "Modrá", value: "#1971c2" },
  { name: "Fialová", value: "#9c36b5" },
  { name: "Šedá", value: "#495057" },
];

export const DEFAULT_TAG = "#1971c2";
