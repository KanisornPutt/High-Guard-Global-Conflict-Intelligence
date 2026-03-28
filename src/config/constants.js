export const SEV_COLORS = {
  critical: "#E8393A",
  high: "#EF9F27",
  medium: "#378ADD",
};

export const SEVERITIES = ["critical", "high", "medium"];

export const CATEGORIES = [
  "all",
  "Armed Conflict",
  "Civil War",
  "Political",
  "Civil Unrest",
  "Insurgency",
];

export const TREND_ICON = {
  escalating: "↑",
  stable: "→",
  "de-escalating": "↓",
};

export const TREND_COLOR = {
  escalating: "#E8393A",
  stable: "#888780",
  "de-escalating": "#1D9E75",
};

export const TEX_SETS = {
  night: [
    "https://unpkg.com/three-globe/example/img/earth-night.jpg",
    "https://unpkg.com/three-globe/example/img/earth-dark.jpg",
  ],
};

export const API_BASE = import.meta.env.VITE_API_BASE || "";

export const COUNTRY_REFRESH_MS = 15 * 60 * 1000;