import { Component, lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useI18n } from "./i18n/I18nProvider.jsx";
import { loadProfilePage } from "./lib/load-profile-page.js";

const HomePage = lazy(() => import("./pages/HomePage.jsx"));
const BlogArticlePage = lazy(() => import("./pages/BlogArticlePage.jsx"));
const ProfilePage = lazy(loadProfilePage);
const CHUNK_RELOAD_STORAGE_KEY = "aaron_crm_chunk_reload_attempt";
const CHUNK_RELOAD_COOLDOWN_MS = 60000;

function isChunkLoadError(error) {
  const message = String(error?.message || error || "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk|Unable to preload CSS/i.test(message);
}

function scheduleChunkReload(error) {
  if (typeof window === "undefined" || !isChunkLoadError(error)) {
    return false;
  }

  const now = Date.now();
  const currentPath = `${window.location.pathname}${window.location.search}`;
  try {
    const previous = JSON.parse(window.sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY) || "null");
    if (
      previous
      && previous.path === currentPath
      && Number.isFinite(previous.at)
      && now - previous.at < CHUNK_RELOAD_COOLDOWN_MS
    ) {
      return false;
    }
    window.sessionStorage.setItem(CHUNK_RELOAD_STORAGE_KEY, JSON.stringify({ path: currentPath, at: now }));
  } catch {
    // If storage is blocked, a single normal reload is still the best recovery.
  }

  window.setTimeout(() => {
    window.location.reload();
  }, 50);
  return true;
}

class ChunkErrorBoundary extends Component {
  state = {
    error: null,
    reloadScheduled: false
  };

  componentDidMount() {
    window.setTimeout(() => {
      if (!this.state.error) {
        try {
          window.sessionStorage.removeItem(CHUNK_RELOAD_STORAGE_KEY);
        } catch {
          // Storage cleanup is optional.
        }
      }
    }, 4000);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    if (scheduleChunkReload(error)) {
      this.setState({ reloadScheduled: true });
      return;
    }
    console.error(error);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="home-main" aria-label="Application loading error">
        {this.state.reloadScheduled ? (
          <p>Обновляем страницу...</p>
        ) : (
          <>
            <p>Не удалось загрузить обновленную часть сайта.</p>
            <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
              Обновить
            </button>
          </>
        )}
      </main>
    );
  }
}

const PROFILE_VIEW_ROUTES = Object.freeze([
  { path: "/profile", forcedView: "none" },
  { path: "/users/allusers", forcedView: "all-users" },
  { path: "/users/create", forcedView: "create-user" },
  { path: "/clients/allclients", forcedView: "clients-all" },
  { path: "/crm", forcedView: "crm" },
  { path: "/services", forcedView: "services" },
  { path: "/finance/cashier", forcedView: "finance-cashier" },
  { path: "/finance/tickets", forcedView: "finance-tickets" },
  { path: "/finance/transactions", forcedView: "finance-transactions" },
  { path: "/finance/balances", forcedView: "finance-balances" },
  { path: "/finance/daily-cash", forcedView: "finance-daily-cash" },
  { path: "/finance/reports", forcedView: "finance-reports" },
  { path: "/finance/audit", forcedView: "finance-audit" },
  { path: "/finance/discounts", forcedView: "finance-discounts" },
  { path: "/appointments/planner", forcedView: "appointment" },
  { path: "/sms-xabarnoma", forcedView: "sms-notifications" },
  { path: "/settings/appointments", forcedView: "appointment-settings" },
  { path: "/settings/telegram-bot", forcedView: "telegram-bot-settings" },
  { path: "/admin-settings/organizations", forcedView: "settings-organizations" },
  { path: "/settings/roles", forcedView: "settings-roles" },
  { path: "/settings/positions", forcedView: "settings-positions" },
  { path: "/settings/services", forcedView: "settings-services" },
  { path: "/settings/finance", forcedView: "settings-finance" },
  { path: "/admin-settings/monitoring", forcedView: "settings-monitoring" },
  { path: "/site/content", forcedView: "site-content" }
]);

const REDIRECT_ROUTE_GROUPS = Object.freeze([
  {
    to: "/clients/allclients",
    paths: ["/clients/create", "/clients", "/profile/clients", "/profile/clients/allclients", "/profile/clients/create"]
  },
  {
    to: "/appointments/planner",
    paths: ["/appointments", "/profile/appointments", "/profile/appointments/planner"]
  },
  {
    to: "/appointments/planner",
    paths: ["/settings/work-schedule", "/profile/settings/work-schedule", "/profile/appointments/work-schedule"]
  },
  {
    to: "/admin-settings/organizations",
    paths: ["/settings/organizations", "/profile/admin-settings/organizations", "/profile/settings/organizations"]
  },
  {
    to: "/admin-settings/monitoring",
    paths: ["/settings/monitoring", "/profile/admin-settings/monitoring", "/profile/settings/monitoring"]
  },
  {
    to: "/profile",
    paths: ["/profile/my-profile", "/profile/users"]
  },
  { to: "/users/allusers", paths: ["/profile/users/allusers"] },
  { to: "/crm", paths: ["/profile/crm", "/crm/leads"] },
  { to: "/services", paths: ["/profile/services"] },
  { to: "/finance/cashier", paths: ["/finance", "/profile/finance", "/profile/finance/cashier"] },
  { to: "/finance/tickets", paths: ["/profile/finance/tickets"] },
  { to: "/finance/transactions", paths: ["/profile/finance/transactions"] },
  { to: "/finance/balances", paths: ["/profile/finance/balances"] },
  { to: "/finance/daily-cash", paths: ["/profile/finance/daily-cash"] },
  { to: "/finance/reports", paths: ["/profile/finance/reports"] },
  { to: "/finance/audit", paths: ["/profile/finance/audit"] },
  { to: "/finance/discounts", paths: ["/profile/finance/discounts"] },
  { to: "/users/create", paths: ["/profile/users/create"] },
  { to: "/appointments/planner", paths: ["/appointments/breaks", "/profile/appointments/breaks"] },
  { to: "/appointments/planner", paths: ["/appointments/specialist-absences", "/profile/appointments/specialist-absences"] },
  { to: "/appointments/planner", paths: ["/appointments/work-schedule"] },
  { to: "/settings/appointments", paths: ["/appointments/settings", "/profile/appointments/settings", "/profile/settings/appointments"] },
  { to: "/settings/telegram-bot", paths: ["/profile/settings/telegram-bot"] },
  { to: "/sms-xabarnoma", paths: ["/profile/sms-xabarnoma", "/sms-notifications"] },
  { to: "/settings/roles", paths: ["/profile/settings/roles"] },
  { to: "/settings/positions", paths: ["/profile/settings/positions"] },
  { to: "/settings/services", paths: ["/profile/settings/services"] },
  { to: "/settings/finance", paths: ["/profile/settings/finance"] },
  { to: "/site/content", paths: ["/profile/site/content", "/site"] },
  { to: "/", paths: ["/home"] }
]);

function NotFoundPage() {
  const { t } = useI18n();

  return (
    <div className="home-layout">
      <header className="home-header">
        <div className="brand-wrap">
          <a className="brand" href="/" aria-label="AARON CRM home">
            <img src="/crm.svg" alt="AARON CRM logo" className="brand-logo" />
            <span className="brand-text">AARON</span>
          </a>
        </div>
      </header>
      <main className="home-main" aria-label={t("app.mainContent")}>
        {t("app.notFound")}
      </main>
      <footer className="home-footer">
        <a className="footer-link" href="/">
          <span>{t("app.backHome")}</span>
        </a>
      </footer>
    </div>
  );
}

function App() {
  return (
    <ChunkErrorBoundary>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/blog/:slug" element={<BlogArticlePage />} />
          {PROFILE_VIEW_ROUTES.map(({ path, forcedView }) => (
            <Route
              key={path}
              path={path}
              element={<ProfilePage forcedView={forcedView} />}
            />
          ))}
          {REDIRECT_ROUTE_GROUPS.flatMap(({ to, paths }) => (
            paths.map((path) => (
              <Route
                key={path}
                path={path}
                element={<Navigate to={to} replace />}
              />
            ))
          ))}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ChunkErrorBoundary>
  );
}

export default App;
