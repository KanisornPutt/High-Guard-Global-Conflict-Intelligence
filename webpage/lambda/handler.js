import {
  MOCK_ARTICLES,
  MOCK_COUNTRIES,
  MOCK_COUNTRY_SUMMARIES,
} from "../src/data/mockData.js";

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: DEFAULT_HEADERS,
    body: JSON.stringify(body),
  };
}

function getPath(event) {
  return event?.rawPath || event?.path || "/";
}

function getCountry(event) {
  const queryCountry = event?.queryStringParameters?.country;
  if (!queryCountry) return null;

  const lower = queryCountry.trim().toLowerCase();

  const countryFromCountries = MOCK_COUNTRIES.find(
    (c) => c.name.toLowerCase() === lower
  )?.name;

  if (countryFromCountries) return countryFromCountries;

  const summaryKey = Object.keys(MOCK_COUNTRY_SUMMARIES).find(
    (name) => name.toLowerCase() === lower
  );
  if (summaryKey) return summaryKey;

  const articleKey = Object.keys(MOCK_ARTICLES).find(
    (name) => name.toLowerCase() === lower
  );
  if (articleKey) return articleKey;

  return queryCountry;
}

export const handler = async (event) => {
  if (event?.requestContext?.http?.method === "OPTIONS" || event?.httpMethod === "OPTIONS") {
    return json(204, {});
  }

  const path = getPath(event);

  if (path.endsWith("/countries")) {
    return json(200, MOCK_COUNTRIES);
  }

  if (path.endsWith("/events")) {
    const country = getCountry(event);

    if (!country) {
      return json(400, { message: "Missing query param: country" });
    }

    const events = MOCK_ARTICLES[country];
    if (!events) {
      return json(404, { message: `No events found for country: ${country}` });
    }

    return json(200, events);
  }

  if (path.endsWith("/summary/country")) {
    const country = getCountry(event);

    if (!country) {
      return json(400, { message: "Missing query param: country" });
    }

    const summary = MOCK_COUNTRY_SUMMARIES[country];
    if (!summary) {
      return json(404, { message: `No summary found for country: ${country}` });
    }

    return json(200, summary);
  }

  return json(404, { message: `Route not found: ${path}` });
};
