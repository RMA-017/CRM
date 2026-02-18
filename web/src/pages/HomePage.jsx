import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api.js";

const LOGOUT_FLAG_KEY = "crm_just_logged_out";
const MAIN_VIEW_KEY = "crm_profile_main_view";

function HomePage() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [form, setForm] = useState({ username: "", password: "" });
  const [errors, setErrors] = useState({ username: "", password: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(
    () => form.username.trim().length > 0 && form.password.length > 0 && !isSubmitting,
    [form.password.length, form.username, isSubmitting]
  );

  useEffect(() => {
    let active = true;

    async function loadCurrentUser() {
      const justLoggedOut = sessionStorage.getItem(LOGOUT_FLAG_KEY) === "1";
      if (justLoggedOut) {
        sessionStorage.removeItem(LOGOUT_FLAG_KEY);
        if (active) {
          setIsAuthenticated(false);
        }
        return;
      }

      try {
        const response = await apiFetch("/api/profile", {
          method: "GET",
          cache: "no-store"
        });
        const data = await response.json().catch(() => null);

        if (!active) {
          return;
        }

        setIsAuthenticated(Boolean(response.ok && data?.username));
      } catch {
        if (active) {
          setIsAuthenticated(false);
        }
      }
    }

    loadCurrentUser();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") {
        setIsLoginOpen(false);
        setErrors({ username: "", password: "" });
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  function resetFormErrors() {
    setErrors({ username: "", password: "" });
  }

  function closeLogin() {
    setIsLoginOpen(false);
    setForm({ username: "", password: "" });
    resetFormErrors();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const payload = {
      username: form.username.trim(),
      password: form.password
    };

    const nextErrors = { username: "", password: "" };
    if (!payload.username) {
      nextErrors.username = "Username is required.";
    }
    if (!payload.password) {
      nextErrors.password = "Password is required.";
    }

    if (nextErrors.username || nextErrors.password) {
      setErrors(nextErrors);
      return;
    }

    try {
      setIsSubmitting(true);
      resetFormErrors();

      const response = await apiFetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (data?.field === "username" || data?.field === "password") {
          setErrors((prev) => ({ ...prev, [data.field]: data.message || "Invalid value." }));
          return;
        }

        setErrors({
          username: "Username is incorrect.",
          password: data?.message || "Invalid username or password."
        });
        return;
      }

      sessionStorage.removeItem(MAIN_VIEW_KEY);
      navigate("/profile", { replace: true });
    } catch {
      setErrors((prev) => ({ ...prev, password: "Unexpected error. Please try again." }));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div className="home-layout">
        <header className="home-header">
          <div className="brand-wrap">
            <Link className="brand" to="/" aria-label="AARON CRM home">
              <img src="/crm.svg" alt="AARON CRM logo" className="brand-logo" />
              <span className="brand-text">AARON</span>
            </Link>
          </div>

          <nav className="header-actions" aria-label="Header actions">
            {!isAuthenticated ? (
              <button type="button" className="header-btn profile-link" onClick={() => setIsLoginOpen(true)}>
                Login
              </button>
            ) : (
              <button
                type="button"
                className="header-btn profile-link"
                onClick={() => navigate("/profile")}
              >
                My Profile
              </button>
            )}
          </nav>
        </header>

        <main className="home-main" aria-label="Main content" />

        <footer className="home-footer">
          <a
            className="footer-link"
            href="https://www.instagram.com/aaron_uzb?igsh=MWxod2Q1eDV6NGowZw=="
            target="_blank"
            rel="noreferrer"
          >
            <img src="/icon/instagram.svg" alt="" aria-hidden="true" className="footer-link-icon" />
            <span>Instagram</span>
          </a>
          <a className="footer-link" href="https://t.me/aaron_uz" target="_blank" rel="noreferrer">
            <img src="/icon/telegram.svg" alt="" aria-hidden="true" className="footer-link-icon" />
            <span>Telegram</span>
          </a>
          <a className="footer-link" href="tel:+998954550033">
            <img src="/icon/call-center.svg" alt="" aria-hidden="true" className="footer-link-icon" />
            <span>Call Center</span>
          </a>
        </footer>
      </div>

      <section className="home-login-panel" hidden={!isLoginOpen}>
        <div className="home-login-head">
          <h2>Welcome Back</h2>
        </div>

        <form className="home-login-form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="homeUsername">Username</label>
            <input
              id="homeUsername"
              name="username"
              type="text"
              placeholder="Username"
              autoComplete="username"
              required
              className={errors.username ? "input-error" : ""}
              value={form.username}
              onInput={(event) => {
                const nextValue = event.currentTarget.value;
                setForm((prev) => ({ ...prev, username: nextValue }));
                if (errors.username) {
                  setErrors((prev) => ({ ...prev, username: "" }));
                }
              }}
            />
            <small className="field-error">{errors.username}</small>
          </div>

          <div className="field">
            <label htmlFor="homePassword">Password</label>
            <input
              id="homePassword"
              name="password"
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              required
              className={errors.password ? "input-error" : ""}
              value={form.password}
              onInput={(event) => {
                const nextValue = event.currentTarget.value;
                setForm((prev) => ({ ...prev, password: nextValue }));
                if (errors.password) {
                  setErrors((prev) => ({ ...prev, password: "" }));
                }
              }}
            />
            <small className="field-error">{errors.password}</small>
          </div>

          <button className="btn" type="submit" disabled={!canSubmit}>
            Login
          </button>
        </form>
      </section>

      <div className="login-overlay" hidden={!isLoginOpen} onClick={closeLogin} />
    </>
  );
}

export default HomePage;
