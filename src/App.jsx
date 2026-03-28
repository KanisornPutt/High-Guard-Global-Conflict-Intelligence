import { useState, useEffect, useRef, useCallback } from "react";
import Globe from "./components/Globe";
import CountryPanel from "./components/CountryPanel";
import StatsBar from "./components/StatsBar";
import FilterBar from "./components/FilterBar";
import { MOCK_COUNTRIES, MOCK_ARTICLES, MOCK_COUNTRY_SUMMARIES } from "./data/mockData";
import { API_BASE, COUNTRY_REFRESH_MS } from "./config/constants";

export default function App() {
  const [countries, setCountries] = useState(MOCK_COUNTRIES);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [articles, setArticles] = useState([]);
  const [countrySummary, setCountrySummary] = useState(null);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [filters, setFilters] = useState({ severity: ["critical", "high", "medium"], category: "all" });
  const [panelOpen, setPanelOpen] = useState(false);

  const fetchCountries = useCallback(async () => {
    try {
      if (API_BASE) {
        const res = await fetch(`${API_BASE}/countries`);
        const data = await res.json();
        setCountries(data);
      }
    } catch {
      setCountries(MOCK_COUNTRIES);
    }
  }, [API_BASE]);

  useEffect(() => {
    fetchCountries();
    const interval = setInterval(fetchCountries, COUNTRY_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchCountries]);

  const handleCountryClick = useCallback(async (country) => {
    setSelectedCountry(country);
    setPanelOpen(true);
    setLoadingArticles(true);
    setArticles([]);
    setCountrySummary(null);

    try {
      if (API_BASE) {
        const [artRes, sumRes] = await Promise.all([
          fetch(`${API_BASE}/events?country=${encodeURIComponent(country.name)}`),
          fetch(`${API_BASE}/summary/country?country=${encodeURIComponent(country.name)}`),
        ]);
        const artData = await artRes.json();
        const sumData = await sumRes.json();
        setArticles(artData);
        setCountrySummary(sumData);
      } else {
        await new Promise((r) => setTimeout(r, 600));
        setArticles(MOCK_ARTICLES[country.name] || MOCK_ARTICLES["Ukraine"]);
        setCountrySummary(MOCK_COUNTRY_SUMMARIES[country.name] || MOCK_COUNTRY_SUMMARIES["Ukraine"]);
      }
    } catch {
      setArticles(MOCK_ARTICLES["Ukraine"]);
      setCountrySummary(MOCK_COUNTRY_SUMMARIES["Ukraine"]);
    } finally {
      setLoadingArticles(false);
    }
  }, [API_BASE]);

  const closePanel = () => {
    setPanelOpen(false);
    setTimeout(() => setSelectedCountry(null), 350);
  };

  const filteredCountries = countries.filter((c) =>
    filters.severity.includes(c.severity) &&
    (filters.category === "all" || c.topCategory === filters.category)
  );

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <div className="logo-mark" />
          <div>
            <h1 className="app-title">HIGH GUARD</h1>
            <p className="app-subtitle">Global Conflict Intelligence</p>
          </div>
        </div>
        <StatsBar countries={filteredCountries} />
      </header>

      <FilterBar filters={filters} onChange={setFilters} />

      <main className="app-main">
        <Globe
          countries={filteredCountries}
          selectedCountry={selectedCountry}
          onCountryClick={handleCountryClick}
        />

        <CountryPanel
          open={panelOpen}
          country={selectedCountry}
          summary={countrySummary}
          articles={articles}
          loading={loadingArticles}
          onClose={closePanel}
        />
      </main>
    </div>
  );
}
