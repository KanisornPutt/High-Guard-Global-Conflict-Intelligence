import { CATEGORIES, SEV_COLORS, SEVERITIES } from "../config/constants";

export default function StatsBar({ countries }) {
  const critical = countries.filter((c) => c.severity === "critical").length;
  const high = countries.filter((c) => c.severity === "high").length;
  const total = countries.reduce((s, c) => s + (c.articleCount || 0), 0);

  return (
    <div className="stats-bar">
      <div className="stat-item">
        <span className="stat-val critical">{critical}</span>
        <span className="stat-label">Critical</span>
      </div>
      <div className="stat-divider" />
      <div className="stat-item">
        <span className="stat-val high">{high}</span>
        <span className="stat-label">High</span>
      </div>
      <div className="stat-divider" />
      <div className="stat-item">
        <span className="stat-val">{countries.length}</span>
        <span className="stat-label">Countries</span>
      </div>
      <div className="stat-divider" />
      <div className="stat-item">
        <span className="stat-val">{total}</span>
        <span className="stat-label">Reports today</span>
      </div>
    </div>
  );
}

// FilterBar.jsx
export function FilterBar({ filters, onChange }) {
  const toggleSev = (s) => {
    const next = filters.severity.includes(s)
      ? filters.severity.filter((x) => x !== s)
      : [...filters.severity, s];
    if (next.length > 0) onChange({ ...filters, severity: next });
  };

  return (
    <div className="filter-bar">
      <span className="filter-label">Severity</span>
      {SEVERITIES.map((s) => (
        <button
          key={s}
          className={`filter-chip sev-chip ${filters.severity.includes(s) ? "active" : ""}`}
          style={filters.severity.includes(s) ? { borderColor: SEV_COLORS[s], color: SEV_COLORS[s], background: SEV_COLORS[s] + "18" } : {}}
          onClick={() => toggleSev(s)}
        >
          <span className="chip-dot" style={{ background: filters.severity.includes(s) ? SEV_COLORS[s] : "#444" }} />
          {s}
        </button>
      ))}
      {/* <span className="filter-divider" /> */}
      {/* <span className="filter-label">Category</span>
      <div className="cat-select-wrap">
        <select
          className="cat-select"
          value={filters.category}
          onChange={(e) => onChange({ ...filters, category: e.target.value })}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c === "all" ? "All categories" : c}</option>
          ))}
        </select>
      </div> */}
    </div>
  );
}
