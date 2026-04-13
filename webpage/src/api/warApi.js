import {
  API_BASE,
  COUNTRY_SUMMARY_LAMBDA_URL,
  COUNTRY_SUMMARY_PATH,
  COUNTRY_OVERVIEW_PATH,
} from "../config/constants";
import { MOCK_ARTICLES, MOCK_COUNTRIES, MOCK_COUNTRY_SUMMARIES } from "../data/mockData";
import { COUNTRY_COORDS } from "../data/countryCoords";

const DEFAULT_COUNTRY = "Ukraine";

const CATEGORY_LABELS = {
  armed_conflict: "Armed Conflict",
  terrorism: "Terrorism",
  political_unrest: "Political Unrest",
  political: "Political",
  civil_war: "Civil War",
  civil_unrest: "Civil Unrest",
  insurgency: "Insurgency",
  other: "Other",
};

function getCountryFallbackRecord(record, countryName) {
  return record[countryName] || record[DEFAULT_COUNTRY];
}

function hasData(payload) {
  if (payload == null) return false;
  if (Array.isArray(payload)) return payload.length > 0;
  if (typeof payload === "object") return Object.keys(payload).length > 0;
  return true;
}

function formatTitleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (s) => s.toUpperCase());
}

function normalizeSeverity(value) {
  if (typeof value === "number") {
    if (value >= 5) return "critical";
    if (value >= 4) return "high";
    if (value >= 3) return "medium";
    return "low";
  }

  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "medium";
  if (["critical", "5"].includes(normalized)) return "critical";
  if (["high", "4"].includes(normalized)) return "high";
  if (["medium", "moderate", "3"].includes(normalized)) return "medium";
  if (["low", "1", "2"].includes(normalized)) return "low";
  return "medium";
}

function normalizeTrend(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/_/g, "-");
  if (["escalating", "stable", "de-escalating"].includes(normalized)) return normalized;
  return "stable";
}

function normalizeCategory(value) {
  if (!value) return "Other";
  const key = String(value).trim().toLowerCase();
  return CATEGORY_LABELS[key] || formatTitleCase(key);
}

function timeAgoText(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return String(isoString);
  const diffMin = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)} h ago`;
  return `${Math.floor(diffMin / 1440)} d ago`;
}

function formatSummaryTime(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return String(isoString);

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeCountryRecord(country) {
  if (!country || typeof country !== "object") return null;

  const name = country.name || country.country;
  if (!name) return null;

  const coords = COUNTRY_COORDS[name] || [];
  const lat = Number.isFinite(country.lat) ? country.lat : coords[0];
  const lon = Number.isFinite(country.lon)
    ? country.lon
    : Number.isFinite(country.long)
      ? country.long
      : coords[1];

  return {
    name,
    lat,
    lon,
    severity: normalizeSeverity(country.severity ?? country.overall_severity),
    articleCount: country.articleCount ?? country.total_events ?? country.high_priority_count ?? 0,
    topCategory: normalizeCategory(country.topCategory ?? country.dominant_category ?? country.category),
    trend: normalizeTrend(country.trend),
  };
}

function normalizeArticleRecord(article) {
  if (!article || typeof article !== "object") return null;

  return {
    articleId: article.articleId || article.eventId || article.id || `${article.country || "event"}-${article.timeStamp || article.publishedAt || Date.now()}`,
    articleSummary: article.articleSummary || article.newSummarization || article.summary || article.description || "",
    category: normalizeCategory(article.category),
    severity: normalizeSeverity(article.severity),
    priority: String(article.priority || "").toLowerCase() || "medium",
    timestamp: article.timestamp || article.timeStamp || article.publishedAt || article.fetchedAt || new Date().toISOString(),
    sourceURL: article.sourceURL || article.articleURL || article.url || "#",
    sourceName: article.sourceName || article.source || "Unknown source",
  };
}

function normalizeCountrySummary(summary, countryName) {
  if (!summary || typeof summary !== "object") return null;

  // Lambda no-news case:
  // { country: "Yemen", message: "No news found in last 24h for Yemen" }
  if (summary.message && !summary.result && !summary.situation_summary && !summary.overallSituation) {
    return {
      country: summary.country || countryName,
      trend: "stable",
      overallSituation: String(summary.message),
      topEvents: [],
      lastUpdated: "",
      articleCount: 0,
    };
  }

  const updatedAt = summary.lastUpdated || summary.lastChecked;

  return {
    country: summary.country || countryName,
    trend: normalizeTrend(summary.trend),
    overallSituation: summary.overallSituation || summary.situation_summary || "",
    topEvents: summary.topEvents || summary.key_events || [],
    lastUpdated: formatSummaryTime(updatedAt) || timeAgoText(updatedAt),
    articleCount: summary.articleCount ?? summary.total_events ?? summary.high_priority_count ?? 0,
  };
}

function ensureArray(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    for (const key of keys) {
      if (Array.isArray(payload[key])) return payload[key];
    }
  }
  return [];
}

function buildLambdaUrl(baseUrl, path) {
  const safeBase = String(baseUrl || "").trim().replace(/\/+$/, "");
  const safePath = `/${String(path || "").trim().replace(/^\/+/, "")}`;
  return `${safeBase}${safePath}`;
}

function parseLambdaPayload(rawText) {
  let parsed = null;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    return { ok: false, data: null, error: "Lambda response is not valid JSON" };
  }

  const data = typeof parsed?.body === "string"
    ? (() => {
        try {
          return JSON.parse(parsed.body);
        } catch {
          return parsed;
        }
      })()
    : parsed;

  return { ok: true, data, error: "" };
}

async function fetchJson(path) {
  if (!API_BASE) return { ok: false, notFound: true, data: null };

  try {
    const res = await fetch(`${API_BASE}${path}`);

    if (res.status === 404) {
      return { ok: false, notFound: true, data: null };
    }

    if (!res.ok) {
      return { ok: false, notFound: false, data: null };
    }

    const data = await res.json();
    return { ok: hasData(data), notFound: !hasData(data), data };
  } catch {
    return { ok: false, notFound: false, data: null };
  }
}

async function fetchCountrySummaryFromLambda(countryName) {
  if (!COUNTRY_SUMMARY_LAMBDA_URL) {
    return { ok: false, notFound: true, data: null };
  }

  try {
    const res = await fetch(buildLambdaUrl(COUNTRY_SUMMARY_LAMBDA_URL, COUNTRY_SUMMARY_PATH), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country: countryName }),
    });

    if (res.status === 404) {
      return { ok: false, notFound: true, data: null };
    }

    if (!res.ok) {
      return { ok: false, notFound: false, data: null, error: `Lambda request failed (${res.status})` };
    }

    const rawText = await res.text();
    const parsed = parseLambdaPayload(rawText);
    if (!parsed.ok) {
      return { ok: false, notFound: false, data: null, error: parsed.error };
    }

    const data = parsed.data;

    const bodyStatusCode = Number(data?.statusCode);
    if (Number.isFinite(bodyStatusCode) && bodyStatusCode >= 400) {
      return {
        ok: false,
        notFound: bodyStatusCode === 404,
        data: null,
        error: data?.message || `Lambda returned statusCode ${bodyStatusCode}`,
      };
    }

    return { ok: hasData(data), notFound: !hasData(data), data };
  } catch {
    return { ok: false, notFound: false, data: null, error: "Lambda request failed (network/CORS)" };
  }
}

async function fetchCountryOverviewFromLambda() {
  if (!COUNTRY_SUMMARY_LAMBDA_URL) {
    return { ok: false, notFound: true, data: null, error: "Lambda base URL is not configured" };
  }

  try {
    const res = await fetch(buildLambdaUrl(COUNTRY_SUMMARY_LAMBDA_URL, COUNTRY_OVERVIEW_PATH), {
      method: "GET",
    });

    if (res.status === 404) {
      return { ok: false, notFound: true, data: null, error: "Country overview endpoint was not found" };
    }

    if (!res.ok) {
      return { ok: false, notFound: false, data: null, error: `Country overview request failed (${res.status})` };
    }

    const rawText = await res.text();
    const parsed = parseLambdaPayload(rawText);
    if (!parsed.ok) {
      return { ok: false, notFound: false, data: null, error: parsed.error };
    }

    const data = parsed.data;
    const bodyStatusCode = Number(data?.statusCode);
    if (Number.isFinite(bodyStatusCode) && bodyStatusCode >= 400) {
      return {
        ok: false,
        notFound: bodyStatusCode === 404,
        data: null,
        error: data?.message || `Country overview returned statusCode ${bodyStatusCode}`,
      };
    }

    return { ok: hasData(data), notFound: !hasData(data), data };
  } catch {
    return { ok: false, notFound: false, data: null, error: "Country overview request failed (network/CORS)" };
  }
}

export async function getCountries() {
  const overviewResult = await fetchCountryOverviewFromLambda();
  if (overviewResult.ok) {
    const rawCountries = ensureArray(overviewResult.data, ["countries", "items", "data"]);
    const normalized = rawCountries
      .map(normalizeCountryRecord)
      .filter(Boolean);

    if (normalized.length > 0) return normalized;
  }

  const fallbackResult = await fetchJson("/countries");
  if (fallbackResult.ok) {
    const rawCountries = ensureArray(fallbackResult.data, ["countries", "items"]);
    const normalized = rawCountries
      .map(normalizeCountryRecord)
      .filter(Boolean);

    if (normalized.length > 0) return normalized;
  }

  return [];
}

export async function getCountryEvents(countryName) {
  const encodedCountry = encodeURIComponent(countryName);
  const result = await fetchJson(`/events?country=${encodedCountry}`);

  if (result.ok) {
    const rawEvents = ensureArray(result.data, ["events", "items"]);
    const normalized = rawEvents
      .map(normalizeArticleRecord)
      .filter(Boolean);

    if (normalized.length > 0) return normalized;
  }
  return getCountryFallbackRecord(MOCK_ARTICLES, countryName);
}

export async function getCountrySummary(countryName) {
  let lambdaError = "";
  const lambdaEnabled = Boolean(COUNTRY_SUMMARY_LAMBDA_URL);

  const lambdaResult = await fetchCountrySummaryFromLambda(countryName);

  if (lambdaResult.ok) {
    const rawSummary = Array.isArray(lambdaResult.data)
      ? lambdaResult.data[0]
      : lambdaResult.data?.result || lambdaResult.data?.summary || lambdaResult.data;
    const normalized = normalizeCountrySummary(rawSummary, countryName);
    if (normalized) return normalized;
    lambdaError = "Lambda responded, but summary payload was empty";
  } else if (lambdaEnabled) {
    lambdaError = lambdaResult.error || "Lambda request failed";
  }

  const encodedCountry = encodeURIComponent(countryName);
  const result = await fetchJson(`/summary/country?country=${encodedCountry}`);

  if (result.ok) {
    const rawSummary = Array.isArray(result.data)
      ? result.data[0]
      : result.data?.summary || result.data;
    const normalized = normalizeCountrySummary(rawSummary, countryName);
    if (normalized) return normalized;
  }

  if (lambdaEnabled || API_BASE) {
    throw new Error(lambdaError || "Unable to load country summary from live endpoints");
  }

  return getCountryFallbackRecord(MOCK_COUNTRY_SUMMARIES, countryName);
}
