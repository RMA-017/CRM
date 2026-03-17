import AppointmentScheduler from "../AppointmentScheduler.jsx";

function AppointmentPlannerPanel({
  canReadAppointments,
  canReadAppointmentBreaks,
  canReadStatisticsPlannerReport,
  canCreateAppointments,
  canUpdateAppointments,
  canDeleteAppointments,
  currentUserId,
  restrictCreateToOwnSpecialist,
  onNotification,
  onClose
}) {
  return (
    <section id="appointmentPanel" className="all-users-panel">
      <div className="all-users-head">
        <h3>Appointment Planner</h3>
        <button
          id="closeAppointmentBtn"
          type="button"
          className="header-btn panel-close-btn"
          aria-label="Close appointment panel"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <AppointmentScheduler
        canReadAppointments={canReadAppointments}
        canReadAppointmentBreaks={canReadAppointmentBreaks}
        canReadStatisticsPlannerReport={canReadStatisticsPlannerReport}
        canCreateAppointments={canCreateAppointments}
        canUpdateAppointments={canUpdateAppointments}
        canDeleteAppointments={canDeleteAppointments}
        currentUserId={currentUserId}
        restrictCreateToOwnSpecialist={restrictCreateToOwnSpecialist}
        onNotification={onNotification}
      />
    </section>
  );
}

export default AppointmentPlannerPanel;
