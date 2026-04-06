import { API_BASE } from "../config/constants";
import { MOCK_ARTICLES, MOCK_COUNTRIES, MOCK_COUNTRY_SUMMARIES } from "../data/mockData";

const DEFAULT_COUNTRY = "Ukraine";

function getCountryFallbackRecord(record, countryName) {
  return record[countryName] || record[DEFAULT_COUNTRY];
}

function hasData(payload) {
  if (payload == null) return false;
  if (Array.isArray(payload)) return payload.length > 0;
  if (typeof payload === "object") return Object.keys(payload).length > 0;
  return true;
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

export async function getCountries() {
  const result = await fetchJson("/countries");

  if (result.ok) return result.data;
  return MOCK_COUNTRIES;
}

export async function getCountryEvents(countryName) {
  const encodedCountry = encodeURIComponent(countryName);
  const result = await fetchJson(`/events?country=${encodedCountry}`);

  if (result.ok) return result.data;
  return getCountryFallbackRecord(MOCK_ARTICLES, countryName);
}

export async function getCountrySummary(countryName) {
  const encodedCountry = encodeURIComponent(countryName);
  const result = await fetchJson(`/summary/country?country=${encodedCountry}`);

  if (result.ok) return result.data;
  return getCountryFallbackRecord(MOCK_COUNTRY_SUMMARIES, countryName);
}
