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
  { path: "/clients/medical-history", forcedView: "clients-medical-history" },
  { path: "/appointments/planner", forcedView: "appointment" },
  { path: "/appointments/breaks", forcedView: "appointment-breaks" },
  { path: "/appointments/specialist-absences", forcedView: "appointment-specialist-absences" },
  { path: "/appointments/work-schedule", forcedView: "appointment-work-schedule" },
  { path: "/vip-clients/my-class", forcedView: "appointment-vip-schedule" },
  { path: "/vip-clients/attendance", forcedView: "appointment-vip-attendance" },
  { path: "/vip-clients/norm-monitoring", forcedView: "appointment-vip-norm-monitoring" },
  { path: "/vip-clients/my-children", forcedView: "appointment-vip-my-children" },
  { path: "/vip-clients/daily-routines", forcedView: "appointment-vip-daily-routines" },
  { path: "/assignments/class", forcedView: "appointment-vip-assignments" },
  { path: "/assignments/tutor", forcedView: "appointment-vip-tutor-assignments" },
  { path: "/settings/appointments", forcedView: "appointment-settings" },
  { path: "/statistics/vip-class-attendance-report", forcedView: "statistics-class" },
  { path: "/statistics/planner-report", forcedView: "statistics-planner-report" },
  { path: "/admin-settings/organizations", forcedView: "settings-organizations" },
  { path: "/settings/roles", forcedView: "settings-roles" },
  { path: "/settings/positions", forcedView: "settings-positions" },
  { path: "/settings/appointment-norms", forcedView: "settings-appointment-norms" },
  { path: "/notifications", forcedView: "notifications-send" },
  { path: "/admin-settings/monitoring", forcedView: "settings-monitoring" }
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
    to: "/vip-clients/my-class",
    paths: ["/appointments/vip-schedule", "/profile/vip-clients", "/profile/vip-clients/my-class", "/profile/appointments/vip-schedule"]
  },
  {
    to: "/vip-clients/attendance",
    paths: ["/appointments/vip-attendance", "/profile/vip-clients/attendance", "/profile/appointments/vip-attendance"]
  },
  {
    to: "/vip-clients/norm-monitoring",
    paths: ["/appointments/vip-norm-monitoring", "/profile/vip-clients/norm-monitoring", "/profile/appointments/vip-norm-monitoring"]
  },
  {
    to: "/vip-clients/my-children",
    paths: ["/appointments/vip-my-children", "/profile/vip-clients/my-children", "/profile/appointments/vip-my-children"]
  },
  {
    to: "/vip-clients/daily-routines",
    paths: ["/appointments/vip-daily-routines", "/profile/vip-clients/daily-routines", "/profile/appointments/vip-daily-routines"]
  },
  {
    to: "/assignments/class",
    paths: ["/assignments", "/appointments/vip-assignments", "/profile/assignments", "/profile/assignments/class", "/profile/appointments/vip-assignments"]
  },
  {
    to: "/assignments/tutor",
    paths: ["/appointments/vip-tutor-assignments", "/profile/assignments/tutor", "/profile/appointments/vip-tutor-assignments"]
  },
  {
    to: "/appointments/work-schedule",
    paths: ["/settings/work-schedule", "/profile/settings/work-schedule", "/profile/appointments/work-schedule"]
  },
  {
    to: "/statistics/vip-class-attendance-report",
    paths: ["/statistics", "/statistics/class", "/profile/statistics", "/profile/statistics/vip-class-attendance-report", "/profile/statistics/class"]
  },
  {
    to: "/notifications",
    paths: [
      "/settings/notification",
      "/settings/notification-settings",
      "/settings/notifications",
      "/profile/settings/notification",
      "/profile/settings/notification-settings",
      "/profile/settings/notifications",
      "/profile/notifications"
    ]
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
  { to: "/clients/medical-history", paths: ["/profile/clients/medical-history"] },
  { to: "/appointments/breaks", paths: ["/profile/appointments/breaks"] },
  { to: "/appointments/specialist-absences", paths: ["/profile/appointments/specialist-absences"] },
  { to: "/settings/appointments", paths: ["/appointments/settings", "/profile/appointments/settings", "/profile/settings/appointments"] },
  { to: "/statistics/planner-report", paths: ["/profile/statistics/planner-report"] },
  { to: "/settings/roles", paths: ["/profile/settings/roles"] },
  { to: "/settings/positions", paths: ["/profile/settings/positions"] },
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
