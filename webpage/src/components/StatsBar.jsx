import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SEV_COLORS, SEVERITIES } from "../config/constants";
import { subscribeToAlerts } from "../api/warApi";

export default function StatsBar({ countries }) {
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const turnstileRef = useRef(null);
  const turnstileWidgetIdRef = useRef(null);

  const critical = countries.filter((c) => c.severity === "critical").length;
  const high = countries.filter((c) => c.severity === "high").length;
  const total = countries.reduce((s, c) => {
    const count = Number(
      typeof c.articleCount === "string" ? c.articleCount.replace(/,/g, "").trim() : c.articleCount
    );
    return s + (Number.isFinite(count) ? count : 0);
  }, 0);

  useEffect(() => {
    window.onTurnstileSuccess = (token) => {
      setTurnstileToken(token || "");
    };

    window.onTurnstileExpired = () => {
      setTurnstileToken("");
    };

    return () => {
      delete window.onTurnstileSuccess;
      delete window.onTurnstileExpired;
    };
  }, []);

  useEffect(() => {
    if (!showSubscribeModal || !turnstileRef.current || !window.turnstile || !turnstileSiteKey) return;

    if (turnstileRef.current.childElementCount > 0) return;

    turnstileWidgetIdRef.current = window.turnstile.render(turnstileRef.current, {
      sitekey: turnstileSiteKey,
      callback: (token) => setTurnstileToken(token || ""),
      "expired-callback": () => setTurnstileToken(""),
      theme: "dark",
    });
  }, [showSubscribeModal, turnstileSiteKey]);

  const closeSubscribeModal = () => {
    if (window.turnstile && turnstileWidgetIdRef.current != null) {
      window.turnstile.reset(turnstileWidgetIdRef.current);
    }
    setShowSubscribeModal(false);
    setEmail("");
    setTurnstileToken("");
    setIsSubmitting(false);
  };

  const submitSubscription = async ({ emailAddress, captchaToken }) => {
    return subscribeToAlerts({
      email: emailAddress,
      turnstileToken: captchaToken,
    });
  };

  const handleSubscribe = async (e) => {
    e.preventDefault();
    if (!turnstileToken || !email.trim()) return;

    setIsSubmitting(true);
    try {
      const result = await submitSubscription({
        emailAddress: email.trim(),
        captchaToken: turnstileToken,
      });

      if (!result.ok) {
        throw new Error(result.message || "Failed to subscribe");
      }

      window.alert(result.message);
      closeSubscribeModal();
    } catch (error) {
      window.alert(`Error: ${error?.message || "Network error — please try again"}`);

      if (window.turnstile) {
        if (turnstileWidgetIdRef.current != null) {
          window.turnstile.reset(turnstileWidgetIdRef.current);
        } else {
          window.turnstile.reset();
        }
      }

      setTurnstileToken("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
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
        <button className="subscribe-btn" onClick={() => setShowSubscribeModal(true)}>
          Subscribe
        </button>
      </div>

      {showSubscribeModal && typeof document !== "undefined" &&
        createPortal(
          <div className="subscription-modal-overlay" onClick={closeSubscribeModal}>
            <div className="subscription-modal" onClick={(e) => e.stopPropagation()}>
              <div className="subscription-modal-header">
                <h2>Subscribe to updates</h2>
                <button className="subscription-close-btn" onClick={closeSubscribeModal} aria-label="Close">
                  ×
                </button>
              </div>

              <form id="subscribe-form" onSubmit={handleSubscribe}>
                <input
                  type="email"
                  id="email-input"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />

                <div
                  ref={turnstileRef}
                  className="cf-turnstile"
                  data-sitekey={turnstileSiteKey}
                  data-callback="onTurnstileSuccess"
                  data-expired-callback="onTurnstileExpired"
                  data-theme="dark"
                />

                <button
                  type="submit"
                  id="submit-btn"
                  disabled={!turnstileToken || isSubmitting || !turnstileSiteKey}
                >
                  {isSubmitting ? "Subscribing..." : "Subscribe"}
                </button>
              </form>
            </div>
          </div>,
          document.body
        )}
    </>
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
    </div>
  );
}
