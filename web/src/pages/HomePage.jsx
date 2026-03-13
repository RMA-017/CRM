import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch, getApiErrorMessage, readApiResponseData } from "../lib/api.js";
import { LOGOUT_FLAG_KEY } from "../lib/auth-flags.js";
import { normalizeProfile } from "../lib/formatters.js";
import { loadProfilePage } from "../lib/load-profile-page.js";
import "../css/layout/profile-layout.css";
import ProfileSideMenu from "./profile/ProfileSideMenu.jsx";
import { useProfileAccess } from "./profile/useProfileAccess.js";

const HOME_FEATURES = [
  {
    key: "clients",
    label: "Clients",
    title: "Client Management",
    text: "Attendance, VIP status, class history, and parent-facing notes in one place.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    )
  },
  {
    key: "schedule",
    label: "Scheduling",
    title: "Smart Scheduling",
    text: "Specialist work hours, breaks, VIP daily plans, and weekly views stay synced.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <circle cx="8" cy="15" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="15" r="1" fill="currentColor" stroke="none" />
        <circle cx="16" cy="15" r="1" fill="currentColor" stroke="none" />
      </svg>
    )
  },
  {
    key: "access",
    label: "Access Control",
    title: "Permission Layers",
    text: "Admin controls stay strict while everyday teams only see the surfaces they use.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    )
  },
  {
    key: "reports",
    label: "Reporting",
    title: "Live Reporting",
    text: "Statistics, no-show checks, and operational summaries close to the live data.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
        <line x1="2" y1="20" x2="22" y2="20" />
      </svg>
    )
  }
];

const HOME_SLIDES = [
  {
    src: "/images/3.svg",
    eyebrow: "Platform Overview",
    title: "Move through the full CRM from one clean workspace.",
    text: "Clients, schedules, VIP activity, and reporting stay connected without switching tools."
  },
  {
    src: "/images/4.svg",
    eyebrow: "Daily Control",
    title: "Keep every working day visible and controlled.",
    text: "Specialist hours, planner flow, and operational checks stay in one responsive surface."
  },
  {
    src: "/images/5.svg",
    eyebrow: "Team Access",
    title: "Give each team only the screens they need.",
    text: "Features, permissions, and organization-level settings stay strict without slowing work."
  },
  {
    src: "/images/bg.svg",
    eyebrow: "Operations View",
    title: "Use one system for planning, monitoring, and reporting.",
    text: "Daily operations stay fast while admin control remains structured."
  },
  {
    src: "/images/bg2.svg",
    eyebrow: "Attendance Flow",
    title: "Track attendance and class movement with less friction.",
    text: "VIP flows, class history, and parent-facing details stay close to live activity."
  },
  {
    src: "/images/bg3.svg",
    eyebrow: "Reporting Surface",
    title: "Move from schedule to report without context loss.",
    text: "Statistics, no-show checks, and operational summaries stay close to the live data."
  },
  {
    src: "/images/bg8.svg",
    eyebrow: "Planner Rhythm",
    title: "See specialist time the moment it opens.",
    text: "Weekly hours, breaks, VIP schedules, and daily planning stay in one operational view."
  },
  {
    src: "/images/bg10.svg",
    eyebrow: "Appointment Planner",
    title: "Keep appointment settings close to the planner itself.",
    text: "Intervals, reminders, breaks, and default working time stay aligned."
  },
  {
    src: "/images/bg12.svg",
    eyebrow: "VIP Operations",
    title: "Track VIP classes without leaving the CRM.",
    text: "Attendance, tutor assignments, class routines, and parent-facing flow stay connected."
  },
  {
    src: "/images/bg13.svg",
    eyebrow: "Workspace Control",
    title: "Keep the whole CRM in motion without losing structure.",
    text: "A single workspace for schedules, settings, VIP processes, and team operations."
  }
];

function HomePage() {
  const navigate = useNavigate();
  const menuRef = useRef(null);
  const sideMenuRef = useRef(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profile, setProfile] = useState(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [form, setForm] = useState({ username: "", password: "" });
  const [errors, setErrors] = useState({ username: "", password: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);

  const {
    hasClientsMenuAccess,
    canReadClients,
    canReadClientMedicalHistory,
    hasAppointmentsMenuAccess,
    canOpenAppointmentSchedule,
    canOpenAppointmentVipMyClass,
    canOpenAppointmentBreaks,
    canOpenAppointmentWorkSchedule,
    canOpenAppointmentVipClients,
    canOpenMyChildren,
    canOpenAppointmentVipDailyRoutines,
    canOpenAppointmentVipClassAssignments,
    canOpenAppointmentVipTutorAssignments,
    canOpenAppointmentVipAssignments,
    canOpenAppointmentStatistics,
    canOpenStatisticsClassAttendance,
    canOpenStatisticsPlannerReport,
    canOpenAppointmentSettings,
    canOpenSettingsOrganizations,
    canOpenSettingsRoles,
    canOpenSettingsPositions,
    canOpenSettingsNorms,
    hasUsersMenuAccess,
    canReadUsers,
    hasSettingsMenuAccess,
    hasAdminSettingsAccess,
    canSendNotifications
  } = useProfileAccess(profile, "none");

  const canSubmit = useMemo(
    () => (
      form.username.trim().length > 0
      && form.password.length > 0
      && !isSubmitting
    ),
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
            setProfile(null);
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

        if (!response.ok || !data?.username) {
          setIsAuthenticated(false);
          setProfile(null);
          return;
        }

        setIsAuthenticated(true);
        setProfile(normalizeProfile(data));
      } catch {
        if (active) {
          setIsAuthenticated(false);
          setProfile(null);
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

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % HOME_SLIDES.length);
    }, 5200);

    return () => {
      window.clearInterval(timerId);
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

  function prefetchProfilePage() {
    void loadProfilePage();
  }

  const preloadSideMenu = useCallback(() => {
    if (!isAuthenticated) {
      return;
    }
  }, [isAuthenticated]);

  const bindSideMenuRef = useCallback((instance) => {
    sideMenuRef.current = instance;
  }, []);

  const closeMenu = useCallback(() => {
    setIsSideMenuOpen(false);
    sideMenuRef.current?.close();
  }, []);

  const navigateFromMenu = useCallback((path) => {
    closeMenu();
    navigate(path);
  }, [closeMenu, navigate]);

  const openSideMenu = useCallback(() => {
    if (!isAuthenticated) {
      return;
    }

    setIsSideMenuOpen(true);
    sideMenuRef.current?.open();
  }, [isAuthenticated]);

  const openHeaderMenu = useCallback(() => {
    if (!isAuthenticated) {
      prefetchProfilePage();
      setIsLoginOpen(true);
      return;
    }

    if (isSideMenuOpen) {
      closeMenu();
      return;
    }

    openSideMenu();
  }, [closeMenu, isAuthenticated, isSideMenuOpen, openSideMenu]);

  function openPrimaryAction() {
    prefetchProfilePage();
    if (isAuthenticated) {
      navigate("/profile");
      return;
    }
    setIsLoginOpen(true);
  }

  function goToSlide(nextIndex) {
    const slideCount = HOME_SLIDES.length;
    setActiveSlide((nextIndex + slideCount) % slideCount);
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
      const profilePagePromise = loadProfilePage();

      const response = await apiFetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (data?.field === "username" || data?.field === "password") {
          setErrors((prev) => ({ ...prev, [data.field]: data.message || "Invalid value." }));
          return;
        }

        setErrors({
          username: "Username is incorrect.",
          password: getApiErrorMessage(response, data, "Invalid username or password.")
        });
        return;
      }

      await profilePagePromise;
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
            <button
              type="button"
              className="menu-toggle"
              aria-label={isAuthenticated ? "Open workspace" : "Open login"}
              aria-controls="mainMenu"
              aria-expanded={isSideMenuOpen ? "true" : "false"}
              onMouseEnter={isAuthenticated ? preloadSideMenu : prefetchProfilePage}
              onFocus={isAuthenticated ? preloadSideMenu : prefetchProfilePage}
              onClick={openHeaderMenu}
            >
              <span />
              <span />
              <span />
            </button>
            <Link className="brand" to="/" aria-label="AARON CRM home">
              <img src="/crm.svg" alt="AARON CRM logo" className="brand-logo" />
              <span className="brand-text">AARON</span>
            </Link>
          </div>

          <nav className="header-actions" aria-label="Header actions">
            {!isAuthenticated ? (
              <button
                type="button"
                className="header-btn profile-link"
                onMouseEnter={prefetchProfilePage}
                onFocus={prefetchProfilePage}
                onClick={() => {
                  prefetchProfilePage();
                  setIsLoginOpen(true);
                }}
              >
                Login
              </button>
            ) : (
              <button
                type="button"
                className="header-btn profile-link"
                onMouseEnter={prefetchProfilePage}
                onFocus={prefetchProfilePage}
                onClick={() => {
                  prefetchProfilePage();
                  navigate("/profile");
                }}
              >
                My Profile
              </button>
            )}
          </nav>
        </header>

        <main className="home-main" aria-label="Main content">
          <section className="home-hero" aria-labelledby="homeHeroTitle">
            <div className="home-hero-copy">
              <div className="home-hero-badge" aria-hidden="true">
                <span className="home-hero-badge-dot" />
                Live Platform
              </div>
              <h1 id="homeHeroTitle" className="home-hero-title">
                Operational control for schedules, VIP classes, and staff access.
              </h1>
              <p className="home-hero-text">
                One surface for appointment planning, class attendance, specialist hours, and
                organization-level control. Built for teams that need speed without losing structure.
              </p>

              <div className="home-hero-actions">
                <button
                  type="button"
                  className="btn home-hero-primary"
                  onMouseEnter={prefetchProfilePage}
                  onFocus={prefetchProfilePage}
                  onClick={openPrimaryAction}
                >
                  {isAuthenticated ? "Open Workspace" : "Open CRM"}
                </button>
                <a className="home-hero-secondary" href="tel:+998954550033">
                  Call Center
                </a>
              </div>
            </div>

              <div
                className="home-stage"
                role="region"
                aria-label="AARON CRM showcase"
                aria-roledescription="carousel"
            >
              <div className="home-stage-frame">
                {HOME_SLIDES.map((slide, index) => (
                  <article
                    key={slide.src}
                    className={`home-stage-slide${index === activeSlide ? " is-active" : ""}`}
                    style={{ backgroundImage: `url(${slide.src})` }}
                    aria-hidden={index === activeSlide ? "false" : "true"}
                  >
                    <div className="home-stage-shade" />
                    <div className="home-stage-copy">
                      <p className="home-stage-eyebrow">{slide.eyebrow}</p>
                      <h2 className="home-stage-title">{slide.title}</h2>
                      <p className="home-stage-text">{slide.text}</p>
                    </div>
                  </article>
                ))}

                <div className="home-stage-nav">
                  <button
                    type="button"
                    className="home-stage-arrow"
                    onClick={() => goToSlide(activeSlide - 1)}
                    aria-label="Previous slide"
                  >
                    ‹
                  </button>
                  <div className="home-stage-dots" aria-label="Slide navigation">
                    {HOME_SLIDES.map((slide, index) => (
                      <button
                        key={slide.src}
                        type="button"
                        className={`home-stage-dot${index === activeSlide ? " is-active" : ""}`}
                        aria-label={`Show slide ${index + 1}`}
                        aria-pressed={index === activeSlide}
                        onClick={() => goToSlide(index)}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    className="home-stage-arrow"
                    onClick={() => goToSlide(activeSlide + 1)}
                    aria-label="Next slide"
                  >
                    ›
                  </button>
                  </div>
                </div>
              </div>

              <div
                className="home-stage-thumbs"
                aria-label="Slide previews"
                style={{ "--home-thumbs-columns": Math.ceil(HOME_SLIDES.length / 2) }}
              >
                {HOME_SLIDES.map((slide, index) => (
                  <button
                    key={`${slide.src}-thumb`}
                    type="button"
                    className={`home-stage-thumb${index === activeSlide ? " is-active" : ""}`}
                    onClick={() => goToSlide(index)}
                  >
                    <span
                      className="home-stage-thumb-image"
                      style={{ backgroundImage: `url(${slide.src})` }}
                      aria-hidden="true"
                    />
                    <span className="home-stage-thumb-copy">
                      <span className="home-stage-thumb-label">{slide.eyebrow}</span>
                      <span className="home-stage-thumb-title">{slide.title}</span>
                    </span>
                  </button>
                ))}
              </div>
          </section>

          <section className="home-features" aria-label="Platform features">
            <div className="home-features-header">
              <h2 className="home-features-title">Everything in one platform</h2>
            </div>
            <div className="home-features-grid">
              {HOME_FEATURES.map((feature) => (
                <article key={feature.key} className="home-feature-card">
                  <span className="home-feature-icon-wrap" aria-hidden="true">
                    {feature.icon}
                  </span>
                  <div className="home-feature-body">
                    <p className="home-feature-eyebrow">{feature.label}</p>
                    <h3 className="home-feature-name">{feature.title}</h3>
                    <p className="home-feature-text">{feature.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </main>

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

      {isAuthenticated ? (
        <ProfileSideMenu
          ref={bindSideMenuRef}
          menuRef={menuRef}
          isPlatformAdmin={Boolean(profile?.isPlatformAdmin)}
          hasClientsMenuAccess={hasClientsMenuAccess}
          canReadClients={canReadClients}
          canReadClientMedicalHistory={canReadClientMedicalHistory}
          openAllClientsPanel={() => navigateFromMenu("/clients/allclients")}
          openClientMedicalHistoryPanel={() => navigateFromMenu("/clients/medical-history")}
          hasAppointmentsMenuAccess={hasAppointmentsMenuAccess}
          canOpenAppointmentSchedule={canOpenAppointmentSchedule}
          canOpenAppointmentVipMyClass={canOpenAppointmentVipMyClass}
          canOpenAppointmentBreaks={canOpenAppointmentBreaks}
          canOpenAppointmentWorkSchedule={canOpenAppointmentWorkSchedule}
          canOpenAppointmentVipClients={canOpenAppointmentVipClients}
          canOpenMyChildren={canOpenMyChildren}
          canOpenAppointmentVipDailyRoutines={canOpenAppointmentVipDailyRoutines}
          canOpenAppointmentVipClassAssignments={canOpenAppointmentVipClassAssignments}
          canOpenAppointmentVipTutorAssignments={canOpenAppointmentVipTutorAssignments}
          canOpenAppointmentVipAssignments={canOpenAppointmentVipAssignments}
          canOpenAppointmentStatistics={canOpenAppointmentStatistics}
          canOpenStatisticsClassAttendance={canOpenStatisticsClassAttendance}
          canOpenStatisticsPlannerReport={canOpenStatisticsPlannerReport}
          canOpenAppointmentSettings={canOpenAppointmentSettings}
          canOpenSettingsOrganizations={canOpenSettingsOrganizations}
          canOpenSettingsRoles={canOpenSettingsRoles}
          canOpenSettingsPositions={canOpenSettingsPositions}
          canOpenSettingsNorms={canOpenSettingsNorms}
          openAppointmentPanel={() => navigateFromMenu("/appointments/planner")}
          openAppointmentBreaksPanel={() => navigateFromMenu("/appointments/breaks")}
          openAppointmentWorkSchedulePanel={() => navigateFromMenu("/appointments/work-schedule")}
          openAppointmentVipSchedulePanel={() => navigateFromMenu("/vip-clients/my-class")}
          openAppointmentVipAttendancePanel={() => navigateFromMenu("/vip-clients/attendance")}
          openAppointmentVipMyChildrenPanel={() => navigateFromMenu("/vip-clients/my-children")}
          openAppointmentVipDailyRoutinesPanel={() => navigateFromMenu("/vip-clients/daily-routines")}
          openAppointmentVipAssignmentsPanel={() => navigateFromMenu("/assignments/class")}
          openAppointmentVipTutorAssignmentsPanel={() => navigateFromMenu("/assignments/tutor")}
          openAppointmentSettingsPanel={() => navigateFromMenu("/settings/appointments")}
          openStatisticsClassPanel={() => navigateFromMenu("/statistics/vip-class-attendance-report")}
          openStatisticsPlannerReportPanel={() => navigateFromMenu("/statistics/planner-report")}
          hasUsersMenuAccess={hasUsersMenuAccess}
          canReadUsers={canReadUsers}
          closeMenu={closeMenu}
          navigate={navigate}
          hasSettingsMenuAccess={hasSettingsMenuAccess}
          hasAdminSettingsAccess={hasAdminSettingsAccess}
          canSendNotifications={canSendNotifications}
          openOrganizationsPanel={() => navigateFromMenu("/admin-settings/organizations")}
          openRolesPanel={() => navigateFromMenu("/settings/roles")}
          openPositionsPanel={() => navigateFromMenu("/settings/positions")}
          openNormsPanel={() => navigateFromMenu("/settings/appointment-norms")}
          openNotificationsSendPanel={() => navigateFromMenu("/notifications")}
          openMonitoringPanel={() => navigateFromMenu("/admin-settings/monitoring")}
        />
      ) : null}

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
