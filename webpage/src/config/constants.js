export const SEV_COLORS = {
  critical: "#E8393A",
  high: "#EF9F27",
  medium: "#378ADD",
  low: "#1D9E75",
};

export const SEVERITIES = ["critical", "high", "medium", "low"];

export const CATEGORIES = [
  "all",
  "War",
  "Armed Conflict",
  "Terrorism",
  "Political Unrest",
  "Civil War",
  "Political",
  "Civil Unrest",
  "Insurgency",
  "Other",
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
export const COUNTRY_SUMMARY_LAMBDA_URL = import.meta.env.VITE_COUNTRY_SUMMARY_LAMBDA_URL || "";
export const COUNTRY_SUMMARY_PATH = import.meta.env.VITE_COUNTRY_SUMMARY_PATH || "/country-summary";
export const COUNTRY_OVERVIEW_PATH =
  import.meta.env.VITE_COUNTRY_OVERVIEW_PATH ||
  "/country-overview";
export const COUNTRY_NEWS_PATH =
  import.meta.env.VITE_COUNTRY_NEWS_PATH ||
  "/country-news";

export const COUNTRY_REFRESH_MS = 15 * 60 * 1000;