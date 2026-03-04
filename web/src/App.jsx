import { Navigate, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";

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
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/profile" element={<ProfilePage forcedView="none" />} />
      <Route path="/users/allusers" element={<ProfilePage forcedView="all-users" />} />
      <Route path="/users/create" element={<ProfilePage forcedView="create-user" />} />
      <Route path="/clients/allclients" element={<ProfilePage forcedView="clients-all" />} />
      <Route path="/clients/create" element={<Navigate to="/clients/allclients" replace />} />
      <Route path="/clients" element={<Navigate to="/clients/allclients" replace />} />
      <Route path="/appointments" element={<Navigate to="/appointments/planner" replace />} />
      <Route path="/appointments/planner" element={<ProfilePage forcedView="appointment" />} />
      <Route path="/appointments/breaks" element={<ProfilePage forcedView="appointment-breaks" />} />
      <Route path="/vip-clients/my-class" element={<ProfilePage forcedView="appointment-vip-schedule" />} />
      <Route path="/vip-clients/attendance" element={<ProfilePage forcedView="appointment-vip-attendance" />} />
      <Route path="/vip-clients/my-children" element={<ProfilePage forcedView="appointment-vip-my-children" />} />
      <Route path="/vip-clients/daily-routines" element={<ProfilePage forcedView="appointment-vip-daily-routines" />} />
      <Route path="/appointments/vip-schedule" element={<Navigate to="/vip-clients/my-class" replace />} />
      <Route path="/appointments/vip-attendance" element={<Navigate to="/vip-clients/attendance" replace />} />
      <Route path="/appointments/vip-my-children" element={<Navigate to="/vip-clients/my-children" replace />} />
      <Route path="/appointments/vip-daily-routines" element={<Navigate to="/vip-clients/daily-routines" replace />} />
      <Route path="/assignments" element={<Navigate to="/assignments/class" replace />} />
      <Route path="/assignments/class" element={<ProfilePage forcedView="appointment-vip-assignments" />} />
      <Route path="/assignments/tutor" element={<ProfilePage forcedView="appointment-vip-tutor-assignments" />} />
      <Route path="/appointments/vip-assignments" element={<Navigate to="/assignments/class" replace />} />
      <Route path="/appointments/vip-tutor-assignments" element={<Navigate to="/assignments/tutor" replace />} />
      <Route path="/settings/appointments" element={<ProfilePage forcedView="appointment-settings" />} />
      <Route path="/statistics" element={<Navigate to="/statistics/vip-class-attendance-report" replace />} />
      <Route path="/statistics/vip-class-attendance-report" element={<ProfilePage forcedView="statistics-class" />} />
      <Route path="/statistics/planner-report" element={<ProfilePage forcedView="statistics-planner-report" />} />
      <Route path="/statistics/class" element={<Navigate to="/statistics/vip-class-attendance-report" replace />} />
      <Route path="/admin-settings/organizations" element={<ProfilePage forcedView="settings-organizations" />} />
      <Route path="/settings/roles" element={<ProfilePage forcedView="settings-roles" />} />
      <Route path="/settings/positions" element={<ProfilePage forcedView="settings-positions" />} />
      <Route path="/settings/admin-options" element={<ProfilePage forcedView="settings-admin-options" />} />
      <Route path="/settings/attendance-admin" element={<ProfilePage forcedView="staff-attendance-admin" />} />
      <Route path="/settings/notifications" element={<ProfilePage forcedView="settings-notifications" />} />
      <Route path="/admin-settings/monitoring" element={<ProfilePage forcedView="settings-monitoring" />} />
      <Route path="/settings/organizations" element={<Navigate to="/admin-settings/organizations" replace />} />
      <Route path="/settings/monitoring" element={<Navigate to="/admin-settings/monitoring" replace />} />
      <Route path="/profile/my-profile" element={<Navigate to="/profile" replace />} />
      <Route path="/profile/users" element={<Navigate to="/profile" replace />} />
      <Route path="/profile/users/allusers" element={<Navigate to="/users/allusers" replace />} />
      <Route path="/profile/users/create" element={<Navigate to="/users/create" replace />} />
      <Route path="/profile/clients" element={<Navigate to="/clients/allclients" replace />} />
      <Route path="/profile/clients/allclients" element={<Navigate to="/clients/allclients" replace />} />
      <Route path="/profile/clients/create" element={<Navigate to="/clients/allclients" replace />} />
      <Route path="/profile/vip-clients" element={<Navigate to="/vip-clients/my-class" replace />} />
      <Route path="/profile/vip-clients/my-class" element={<Navigate to="/vip-clients/my-class" replace />} />
      <Route path="/profile/vip-clients/attendance" element={<Navigate to="/vip-clients/attendance" replace />} />
      <Route path="/profile/vip-clients/my-children" element={<Navigate to="/vip-clients/my-children" replace />} />
      <Route path="/profile/vip-clients/daily-routines" element={<Navigate to="/vip-clients/daily-routines" replace />} />
      <Route path="/profile/appointments" element={<Navigate to="/appointments/planner" replace />} />
      <Route path="/profile/appointments/planner" element={<Navigate to="/appointments/planner" replace />} />
      <Route path="/profile/appointments/breaks" element={<Navigate to="/appointments/breaks" replace />} />
      <Route path="/profile/appointments/vip-schedule" element={<Navigate to="/vip-clients/my-class" replace />} />
      <Route path="/profile/appointments/vip-attendance" element={<Navigate to="/vip-clients/attendance" replace />} />
      <Route path="/profile/appointments/vip-my-children" element={<Navigate to="/vip-clients/my-children" replace />} />
      <Route path="/profile/appointments/vip-daily-routines" element={<Navigate to="/vip-clients/daily-routines" replace />} />
      <Route path="/profile/assignments" element={<Navigate to="/assignments/class" replace />} />
      <Route path="/profile/assignments/class" element={<Navigate to="/assignments/class" replace />} />
      <Route path="/profile/assignments/tutor" element={<Navigate to="/assignments/tutor" replace />} />
      <Route path="/profile/appointments/vip-assignments" element={<Navigate to="/assignments/class" replace />} />
      <Route path="/profile/appointments/vip-tutor-assignments" element={<Navigate to="/assignments/tutor" replace />} />
      <Route path="/profile/appointments/settings" element={<Navigate to="/settings/appointments" replace />} />
      <Route path="/profile/statistics" element={<Navigate to="/statistics/vip-class-attendance-report" replace />} />
      <Route path="/profile/statistics/vip-class-attendance-report" element={<Navigate to="/statistics/vip-class-attendance-report" replace />} />
      <Route path="/profile/statistics/class" element={<Navigate to="/statistics/vip-class-attendance-report" replace />} />
      <Route path="/profile/statistics/planner-report" element={<Navigate to="/statistics/planner-report" replace />} />
      <Route path="/profile/admin-settings/organizations" element={<Navigate to="/admin-settings/organizations" replace />} />
      <Route path="/profile/admin-settings/monitoring" element={<Navigate to="/admin-settings/monitoring" replace />} />
      <Route path="/appointments/settings" element={<Navigate to="/settings/appointments" replace />} />
      <Route path="/profile/settings/organizations" element={<Navigate to="/admin-settings/organizations" replace />} />
      <Route path="/profile/settings/appointments" element={<Navigate to="/settings/appointments" replace />} />
      <Route path="/profile/settings/roles" element={<Navigate to="/settings/roles" replace />} />
      <Route path="/profile/settings/positions" element={<Navigate to="/settings/positions" replace />} />
      <Route path="/profile/settings/admin-options" element={<Navigate to="/settings/admin-options" replace />} />
      <Route path="/profile/settings/admin" element={<Navigate to="/settings/attendance-admin" replace />} />
      <Route path="/profile/settings/attendance-admin" element={<Navigate to="/settings/attendance-admin" replace />} />
      <Route path="/profile/settings/notifications" element={<Navigate to="/settings/notifications" replace />} />
      <Route path="/profile/settings/monitoring" element={<Navigate to="/admin-settings/monitoring" replace />} />
      <Route path="/staff-attendance" element={<ProfilePage forcedView="staff-attendance" />} />
      <Route path="/settings/admin" element={<Navigate to="/settings/attendance-admin" replace />} />
      <Route path="/staff-attendance/admin" element={<Navigate to="/settings/attendance-admin" replace />} />
      <Route path="/home" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
