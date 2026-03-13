import WorkSchedulePanel from "../WorkSchedulePanel.jsx";

function WorkScheduleShellPanel({
  canCreateAppointmentWorkSchedule,
  canUpdateAppointmentWorkSchedule,
  canDeleteAppointmentWorkSchedule,
  profile,
  workScheduleUserOverridesModalOpen,
  setWorkScheduleUserOverridesModalOpen,
  closeAppointmentWorkSchedulePanel
}) {
  return (
    <section id="appointmentWorkSchedulePanel" className="all-users-panel settings-panel">
      <div className="all-users-head">
        <h3>Work Schedule</h3>
        <div className="all-users-head-actions">
          <button
            id="openWorkScheduleUserOverridesModalBtn"
            type="button"
            className="header-btn appointment-breaks-add-icon-btn"
            aria-label="Open user weekly overrides modal"
            title="User weekly overrides"
            disabled={!canCreateAppointmentWorkSchedule}
            onClick={() => setWorkScheduleUserOverridesModalOpen(true)}
          >
            +
          </button>
          <button
            id="closeAppointmentWorkScheduleBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close work schedule panel"
            onClick={() => {
              setWorkScheduleUserOverridesModalOpen(false);
              closeAppointmentWorkSchedulePanel();
            }}
          >
            ×
          </button>
        </div>
      </div>
      <WorkSchedulePanel
        canCreateWorkSchedule={canCreateAppointmentWorkSchedule}
        canUpdateWorkSchedule={canUpdateAppointmentWorkSchedule}
        canDeleteWorkSchedule={canDeleteAppointmentWorkSchedule}
        profile={profile}
        showDefaultWeekly={false}
        showUserWeeklyOverrides
        showUserWeeklyOverridesLauncher={false}
        isUserWeeklyOverridesModalOpen={workScheduleUserOverridesModalOpen}
        onOpenUserWeeklyOverridesModal={() => setWorkScheduleUserOverridesModalOpen(true)}
        onCloseUserWeeklyOverridesModal={() => setWorkScheduleUserOverridesModalOpen(false)}
      />
    </section>
  );
}

export default WorkScheduleShellPanel;
