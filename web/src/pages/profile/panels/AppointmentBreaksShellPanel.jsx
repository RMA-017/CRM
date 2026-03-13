import AppointmentSettingsPanel from "../AppointmentSettingsPanel.jsx";

function AppointmentBreaksShellPanel({
  canReadAppointmentBreaks,
  canCreateAppointmentBreaks,
  canUpdateAppointmentBreaks,
  canDeleteAppointmentBreaks,
  organizations,
  profile,
  closeAppointmentBreaksPanel
}) {
  return (
    <section id="appointmentBreaksPanel" className="all-users-panel settings-panel">
      <div className="all-users-head">
        <h3>Appointment Breaks</h3>
        <div className="all-users-head-actions">
          <button
            id="openAppointmentBreaksAddModalBtn"
          type="button"
          className="header-btn appointment-breaks-add-icon-btn"
          aria-label="Add break"
          title="Add break"
          disabled={!canCreateAppointmentBreaks}
          onClick={() => {
            if (typeof document === "undefined") {
              return;
            }
              const addBtn = document.getElementById("appointmentBreaksAddBtn");
              addBtn?.click();
            }}
          >
            +
          </button>
          <button
            id="closeAppointmentBreaksBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close appointment breaks panel"
            onClick={closeAppointmentBreaksPanel}
          >
            ×
          </button>
        </div>
      </div>
      <AppointmentSettingsPanel
        canReadAppointmentBreaks={canReadAppointmentBreaks}
        canCreateAppointmentBreaks={canCreateAppointmentBreaks}
        canUpdateAppointmentBreaks={canUpdateAppointmentBreaks}
        canDeleteAppointmentBreaks={canDeleteAppointmentBreaks}
        panelMode="breaks"
        organizations={organizations}
        profile={profile}
      />
    </section>
  );
}

export default AppointmentBreaksShellPanel;
