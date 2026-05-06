import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { loadProfilePage } from "./lib/load-profile-page.js";

const HomePage = lazy(() => import("./pages/HomePage.jsx"));
const ProfilePage = lazy(loadProfilePage);

const PROFILE_VIEW_ROUTES = Object.freeze([
  { path: "/profile", forcedView: "none" },
  { path: "/users/allusers", forcedView: "all-users" },
  { path: "/users/create", forcedView: "create-user" },
  { path: "/clients/allclients", forcedView: "clients-all" },
  { path: "/dashboard", forcedView: "dashboard" },
  { path: "/appointments/planner", forcedView: "appointment" },
  { path: "/settings/appointments", forcedView: "appointment-settings" },
  { path: "/statistics/planner-report", forcedView: "statistics-planner-report" },
  { path: "/admin-settings/organizations", forcedView: "settings-organizations" },
  { path: "/settings/roles", forcedView: "settings-roles" },
  { path: "/settings/positions", forcedView: "settings-positions" },
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
    to: "/dashboard",
    paths: ["/profile/dashboard"]
  },
  {
    to: "/appointments/planner",
    paths: ["/settings/work-schedule", "/profile/settings/work-schedule", "/profile/appointments/work-schedule"]
  },
  {
    to: "/statistics/planner-report",
    paths: ["/statistics", "/profile/statistics"]
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
  { to: "/users/create", paths: ["/profile/users/create"] },
  { to: "/appointments/planner", paths: ["/appointments/breaks", "/profile/appointments/breaks"] },
  { to: "/appointments/planner", paths: ["/appointments/specialist-absences", "/profile/appointments/specialist-absences"] },
  { to: "/appointments/planner", paths: ["/appointments/work-schedule"] },
  { to: "/settings/appointments", paths: ["/appointments/settings", "/profile/appointments/settings", "/profile/settings/appointments"] },
  { to: "/statistics/planner-report", paths: ["/profile/statistics/planner-report"] },
  { to: "/settings/roles", paths: ["/profile/settings/roles"] },
  { to: "/settings/positions", paths: ["/profile/settings/positions"] },
  { to: "/site/content", paths: ["/profile/site/content", "/site"] },
  { to: "/", paths: ["/home"] }
]);

function NotFoundPage() {
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
      <main className="home-main" aria-label="Main content">
        Not Found
      </main>
      <footer className="home-footer">
        <a className="footer-link" href="/">
          <span>Back to Home</span>
        </a>
      </footer>
    </div>
  );
}

function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<HomePage />} />
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
  );
}

export default App;
