import { useState, useEffect, useRef, useCallback } from "react";
import Globe from "./components/Globe";
import CountryPanel from "./components/CountryPanel";
import StatsBar from "./components/StatsBar";
import FilterBar from "./components/FilterBar";
import { COUNTRY_REFRESH_MS } from "./config/constants";
import { getCountries, getCountryEvents, getCountrySummary } from "./api/warApi";

export default function App() {
  const [countries, setCountries] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [articles, setArticles] = useState([]);
  const [countrySummary, setCountrySummary] = useState(null);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [panelError, setPanelError] = useState("");
  const [filters, setFilters] = useState({ severity: ["critical", "high", "medium", "low"], category: "all" });
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
    setPanelError("");
    setArticles([]);
    setCountrySummary(null);

    try {
      const [articleResult, summaryResult] = await Promise.allSettled([
        getCountryEvents(country.name),
        getCountrySummary(country.name),
      ]);

      const errors = [];

      if (articleResult.status === "fulfilled") {
        setArticles(articleResult.value || []);
      } else {
        setArticles([]);
        errors.push("Could not load recent reports.");
      }

      if (summaryResult.status === "fulfilled") {
        setCountrySummary(summaryResult.value || null);
      } else {
        setCountrySummary(null);
        errors.push(summaryResult.reason?.message || "Could not load country summary.");
      }

      if (errors.length) {
        setPanelError(errors.join(" "));
      }
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
          error={panelError}
          onClose={closePanel}
        />
      </main>
    </div>
  );
}
