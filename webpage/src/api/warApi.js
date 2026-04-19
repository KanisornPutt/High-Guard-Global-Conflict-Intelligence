import {
  API_BASE,
  COUNTRY_SUMMARY_LAMBDA_URL,
  COUNTRY_SUMMARY_PATH,
  COUNTRY_OVERVIEW_PATH,
  COUNTRY_NEWS_PATH,
  SUBSCRIPTION_LAMBDA_URL,
  SUBSCRIPTION_PATH,
} from "../config/constants";
import { COUNTRY_COORDS } from "../data/countryCoords";

const CATEGORY_LABELS = {
  armed_conflict: "Armed Conflict",
  terrorism: "Terrorism",
  political_unrest: "Political Unrest",
  political: "Political",
  civil_war: "Civil War",
  civil_unrest: "Civil Unrest",
  insurgency: "Insurgency",
  war: "War",
  other: "Other",
};

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

function normalizeCount(...values) {
  for (const value of values) {
    if (value == null) continue;

    const numeric = Number(
      typeof value === "string" ? value.replace(/,/g, "").trim() : value
    );

    if (Number.isFinite(numeric)) {
      return Math.max(0, numeric);
    }
  }

  return 0;
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
    articleCount: normalizeCount(
      country.articleCount,
      country.total_events,
      country.high_priority_count,
      country.article_count,
      country.total,
      country.reports,
      country.reportCount
    ),
    topCategory: normalizeCategory(country.topCategory ?? country.dominant_category ?? country.category),
    trend: normalizeTrend(country.trend),
  };
}

function normalizeArticleRecord(article) {
  if (!article || typeof article !== "object") return null;

  const publishTimestamp = article.publishedAt || article.timestamp || article.timeStamp || article.fetchedAt;

  return {
    articleId: article.articleId || article.eventId || article.id || `${article.country || "event"}-${article.timeStamp || article.publishedAt || Date.now()}`,
    articleSummary: article.articleSummary || article.newSummarization || article.summary || article.description || "",
    category: normalizeCategory(article.category),
    severity: normalizeSeverity(article.severity),
    priority: String(article.priority || "").toLowerCase() || "medium",
    timestamp: publishTimestamp || new Date().toISOString(),
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
      topCategory: "Other",
      severity: "low",
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
    topCategory: normalizeCategory(summary.topCategory ?? summary.dominant_category ?? summary.category),
    severity: normalizeSeverity(summary.severity ?? summary.overallSeverity ?? summary.overall_severity),
    overallSituation: summary.overallSituation || summary.situation_summary || "",
    topEvents: summary.topEvents || summary.key_events || [],
    lastUpdated: formatSummaryTime(updatedAt) || timeAgoText(updatedAt),
    articleCount: normalizeCount(
      summary.articleCount,
      summary.total_events,
      summary.high_priority_count,
      summary.article_count,
      summary.total,
      summary.reports,
      summary.reportCount
    ),
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

  const data = (() => {
    if (typeof parsed?.body === "string") {
      try {
        return JSON.parse(parsed.body);
      } catch {
        return parsed;
      }
    }

    if (parsed?.body && typeof parsed.body === "object") {
      return parsed.body;
    }

    return parsed;
  })();

  return { ok: true, data, error: "" };
}

function extractMessage(payload, fallback = "Request failed") {
  if (!payload) return fallback;

  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed || fallback;
  }

  if (typeof payload?.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }

  if (typeof payload?.body === "string") {
    try {
      const parsedBody = JSON.parse(payload.body);
      if (typeof parsedBody?.message === "string" && parsedBody.message.trim()) {
        return parsedBody.message.trim();
      }
    } catch {
      return payload.body.trim() || fallback;
    }
  }

  return fallback;
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

async function fetchCountryNewsFromLambda(countryName) {
  if (!COUNTRY_SUMMARY_LAMBDA_URL) {
    return { ok: false, notFound: true, data: null, error: "Lambda base URL is not configured" };
  }

  try {
    const encodedCountry = encodeURIComponent(countryName);
    const path = `${COUNTRY_NEWS_PATH}?country=${encodedCountry}`;
    const res = await fetch(buildLambdaUrl(COUNTRY_SUMMARY_LAMBDA_URL, path), {
      method: "GET",
    });

    if (res.status === 404) {
      return { ok: false, notFound: true, data: null, error: "Country news endpoint was not found" };
    }

    if (!res.ok) {
      return { ok: false, notFound: false, data: null, error: `Country news request failed (${res.status})` };
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
        error: data?.message || `Country news returned statusCode ${bodyStatusCode}`,
      };
    }

    return { ok: hasData(data), notFound: !hasData(data), data };
  } catch {
    return { ok: false, notFound: false, data: null, error: "Country news request failed (network/CORS)" };
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
  const lambdaResult = await fetchCountryNewsFromLambda(countryName);

  if (lambdaResult.ok) {
    const rawEvents = ensureArray(lambdaResult.data, ["articles", "events", "items", "data"]);
    const normalized = rawEvents
      .map(normalizeArticleRecord)
      .filter(Boolean);

    if (normalized.length > 0) return normalized;
  }

  const encodedCountry = encodeURIComponent(countryName);
  const result = await fetchJson(`/events?country=${encodedCountry}`);

  if (result.ok) {
    const rawEvents = ensureArray(result.data, ["events", "items"]);
    const normalized = rawEvents
      .map(normalizeArticleRecord)
      .filter(Boolean);

    if (normalized.length > 0) return normalized;
  }
  return [];
}

export async function getCountrySummary(countryName) {
  let lambdaError = "";
  const lambdaEnabled = Boolean(COUNTRY_SUMMARY_LAMBDA_URL);

  const lambdaResult = await fetchCountrySummaryFromLambda(countryName);

  if (lambdaResult.ok) {
    const rawSummary = Array.isArray(lambdaResult.data)
      ? lambdaResult.data[0]
      : lambdaResult.data?.body?.result || lambdaResult.data?.body?.summary || lambdaResult.data?.body ||
        lambdaResult.data?.result || lambdaResult.data?.summary || lambdaResult.data;
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

  return null;
}

export async function subscribeToAlerts({ email, turnstileToken }) {
  if (!SUBSCRIPTION_LAMBDA_URL) {
    return {
      ok: false,
      message: "Subscription endpoint is not configured",
    };
  }

  try {
    const res = await fetch(buildLambdaUrl(SUBSCRIPTION_LAMBDA_URL, SUBSCRIPTION_PATH), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: String(email || "").trim(),
        turnstileToken: String(turnstileToken || "").trim(),
      }),
    });

    const rawText = await res.text();
    const parsed = parseLambdaPayload(rawText);

    if (!parsed.ok) {
      return {
        ok: false,
        message: "Subscription service returned invalid JSON",
      };
    }

    const data = parsed.data;
    const bodyStatusCode = Number(data?.statusCode);
    const effectiveStatus = Number.isFinite(bodyStatusCode) ? bodyStatusCode : res.status;
    const message = extractMessage(
      data,
      effectiveStatus >= 500
        ? "Failed to process subscription — please try again later"
        : "Failed to subscribe"
    );

    if (effectiveStatus >= 400 || !res.ok) {
      return { ok: false, message };
    }

    return { ok: true, message };
  } catch {
    return { ok: false, message: "Network error — please try again" };
  }
}
