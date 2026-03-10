import AppointmentSettingsPanel from "../AppointmentSettingsPanel.jsx";

function AppointmentSettingsShellPanel({
  canUpdateAppointments,
  canUpdateSettingsAppointments,
  organizations,
  profile,
  onClose
}) {
  return (
    <section id="appointmentSettingsPanel" className="all-users-panel settings-panel">
      <div className="all-users-head">
        <h3>Appointment Settings</h3>
        <button
          id="closeAppointmentSettingsBtn"
          type="button"
          className="header-btn panel-close-btn"
          aria-label="Close appointment settings panel"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <AppointmentSettingsPanel
        canUpdateAppointments={canUpdateAppointments}
        canUpdateSettingsAppointments={canUpdateSettingsAppointments}
        panelMode="settings"
        organizations={organizations}
        profile={profile}
      />
    </section>
  );
}

export default AppointmentSettingsShellPanel;
