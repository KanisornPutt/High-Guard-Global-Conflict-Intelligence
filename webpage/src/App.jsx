import { useState, useEffect, useRef, useCallback } from "react";
import Globe from "./components/Globe";
import CountryPanel from "./components/CountryPanel";
import StatsBar from "./components/StatsBar";
import FilterBar from "./components/FilterBar";
import { MOCK_COUNTRIES } from "./data/mockData";
import { COUNTRY_REFRESH_MS } from "./config/constants";
import { getCountries, getCountryEvents, getCountrySummary } from "./api/warApi";

export default function App() {
  const [countries, setCountries] = useState(MOCK_COUNTRIES);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [articles, setArticles] = useState([]);
  const [countrySummary, setCountrySummary] = useState(null);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [filters, setFilters] = useState({ severity: ["critical", "high", "medium"], category: "all" });
  const [panelOpen, setPanelOpen] = useState(false);

  const fetchCountries = useCallback(async () => {
    const data = await getCountries();
    setCountries(data);
  }, []);

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
      const [articleData, summaryData] = await Promise.all([
        getCountryEvents(country.name),
        getCountrySummary(country.name),
      ]);
      setArticles(articleData);
      setCountrySummary(summaryData);
    } finally {
      setLoadingArticles(false);
    }
  }, []);

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
