import AppointmentScheduler from "../AppointmentScheduler.jsx";

function VipSchedulePanel({
  canReadAppointments,
  canCreateAppointments,
  canUpdateAppointments,
  canDeleteAppointments,
  currentUserId,
  restrictCreateToOwnSpecialist,
  vipClassDailyRoutines,
  onNotification,
  onClose
}) {
  return (
    <section id="appointmentVipSchedulePanel" className="all-users-panel">
      <div className="all-users-head">
        <h3>My Class</h3>
        <button
          id="closeAppointmentVipScheduleBtn"
          type="button"
          className="header-btn panel-close-btn"
          aria-label="Close my class panel"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <AppointmentScheduler
        canReadAppointments={canReadAppointments}
        canCreateAppointments={canCreateAppointments}
        canUpdateAppointments={canUpdateAppointments}
        canDeleteAppointments={canDeleteAppointments}
        currentUserId={currentUserId}
        restrictCreateToOwnSpecialist={restrictCreateToOwnSpecialist}
        vipOnly
        vipClassDailyRoutines={vipClassDailyRoutines}
        onNotification={onNotification}
      />
    </section>
  );
}

export default VipSchedulePanel;
