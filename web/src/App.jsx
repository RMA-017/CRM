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
      <Route path="/clients/create" element={<ProfilePage forcedView="clients-create" />} />
      <Route path="/clients" element={<Navigate to="/clients/allclients" replace />} />
      <Route path="/appointments" element={<ProfilePage forcedView="appointment" />} />
      <Route path="/appointments/vip-recurring" element={<ProfilePage forcedView="appointment-vip-recurring" />} />
      <Route path="/appointments/vip-clients" element={<ProfilePage forcedView="appointment-vip-clients" />} />
      <Route path="/appointments/vip/settings" element={<ProfilePage forcedView="appointment-vip-settings" />} />
      <Route path="/appointments/settings" element={<ProfilePage forcedView="appointment-settings" />} />
      <Route path="/settings/organizations" element={<ProfilePage forcedView="settings-organizations" />} />
      <Route path="/settings/roles" element={<ProfilePage forcedView="settings-roles" />} />
      <Route path="/settings/positions" element={<ProfilePage forcedView="settings-positions" />} />
      <Route path="/profile/my-profile" element={<Navigate to="/profile" replace />} />
      <Route path="/profile/users" element={<Navigate to="/profile" replace />} />
      <Route path="/profile/users/allusers" element={<Navigate to="/users/allusers" replace />} />
      <Route path="/profile/users/create" element={<Navigate to="/users/create" replace />} />
      <Route path="/profile/clients" element={<Navigate to="/clients/allclients" replace />} />
      <Route path="/profile/clients/allclients" element={<Navigate to="/clients/allclients" replace />} />
      <Route path="/profile/clients/create" element={<Navigate to="/clients/create" replace />} />
      <Route path="/profile/appointments" element={<Navigate to="/appointments" replace />} />
      <Route path="/profile/appointments/vip-recurring" element={<Navigate to="/appointments/vip-recurring" replace />} />
      <Route path="/profile/appointments/vip-clients" element={<Navigate to="/appointments/vip-clients" replace />} />
      <Route path="/profile/appointments/vip/settings" element={<Navigate to="/appointments/vip/settings" replace />} />
      <Route path="/profile/appointments/settings" element={<Navigate to="/appointments/settings" replace />} />
      <Route path="/profile/settings/organizations" element={<Navigate to="/settings/organizations" replace />} />
      <Route path="/profile/settings/roles" element={<Navigate to="/settings/roles" replace />} />
      <Route path="/profile/settings/positions" element={<Navigate to="/settings/positions" replace />} />
      <Route path="/home" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
