import { useEffect, useRef } from "react";
import { SEV_COLORS, TREND_COLOR, TREND_ICON } from "../config/constants";

function timeAgo(isoString) {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000);
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
}

function ArticleCard({ article }) {
  return (
    <div className="article-card">
      <div className="article-card-top">
        <span className="sev-bar" style={{ background: SEV_COLORS[article.severity] }} />
        <div className="article-meta">
          <span className="cat-badge" style={{ color: SEV_COLORS[article.severity], borderColor: SEV_COLORS[article.severity] + "40", background: SEV_COLORS[article.severity] + "12" }}>
            {article.category}
          </span>
          <span className="article-time">{timeAgo(article.timestamp)}</span>
          {article.priority === "high" && <span className="priority-badge">HIGH PRIORITY</span>}
        </div>
      </div>
      <p className="article-summary">{article.articleSummary}</p>
      <a href={article.sourceURL} target="_blank" rel="noopener noreferrer" className="source-link">
        {article.sourceName} →
      </a>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="article-card skeleton">
      <div className="skel-line" style={{ width: "40%", height: 12 }} />
      <div className="skel-line" style={{ width: "100%", height: 10, marginTop: 12 }} />
      <div className="skel-line" style={{ width: "95%", height: 10, marginTop: 6 }} />
      <div className="skel-line" style={{ width: "80%", height: 10, marginTop: 6 }} />
    </div>
  );
}

export default function CountryPanel({ open, country, summary, articles, loading, onClose }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (open && panelRef.current) panelRef.current.scrollTop = 0;
  }, [country?.name, open]);

  return (
    <aside className={`country-panel ${open ? "open" : ""}`} ref={panelRef} aria-hidden={!open}>
      {/* Header */}
      <div className="panel-header">
        <div className="panel-header-left">
          {country && (
            <>
              <span className="panel-sev-dot" style={{ background: SEV_COLORS[country.severity] }} />
              <div>
                <h2 className="panel-country-name">{country.name}</h2>
                <div className="panel-meta-row">
                  <span className="panel-top-cat">{country.topCategory}</span>
                  {country.trend && (
                    <span className="panel-trend" style={{ color: TREND_COLOR[country.trend] }}>
                      {TREND_ICON[country.trend]} {country.trend}
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        <button className="panel-close" onClick={onClose} aria-label="Close panel">✕</button>
      </div>

      {/* Country summary (O2) */}
      {loading ? (
        <div className="country-summary-box skeleton">
          <div className="skel-line" style={{ width: "50%", height: 12 }} />
          <div className="skel-line" style={{ width: "100%", height: 10, marginTop: 12 }} />
          <div className="skel-line" style={{ width: "90%", height: 10, marginTop: 6 }} />
          <div className="skel-line" style={{ width: "75%", height: 10, marginTop: 6 }} />
        </div>
      ) : summary ? (
        <div className="country-summary-box">
          <div className="summary-label">
            <span className="summary-label-icon" />
            Situation overview
            <span className="summary-updated">{summary.lastUpdated}</span>
          </div>
          <p className="summary-text">{summary.overallSituation}</p>
          {summary.topEvents && (
            <ul className="top-events">
              {summary.topEvents.map((ev, i) => (
                <li key={i}>{ev}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {/* Articles (O1) */}
      <div className="articles-section">
        <div className="articles-header">
          <span className="articles-label">Recent reports</span>
          {!loading && <span className="articles-count">{articles.length} articles</span>}
        </div>

        <div className="articles-list">
          {loading ? (
            [1, 2, 3].map((i) => <SkeletonCard key={i} />)
          ) : articles.length === 0 ? (
            <div className="empty-state">No recent articles found.</div>
          ) : (
            articles.map((a) => <ArticleCard key={a.articleId} article={a} />)
          )}
        </div>
      </div>
    </aside>
  );
}
