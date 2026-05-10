import { useI18n } from "../../../i18n/I18nProvider.jsx";
import AppointmentScheduler from "../AppointmentScheduler.jsx";

function AppointmentPlannerPanel({
  canReadAppointments,
  canReadAppointmentBreaks,
  canViewAppointmentSpecialistAbsenceBlocks,
  canReadStatisticsPlannerReport,
  canCreateAppointments,
  canUpdateAppointments,
  canDeleteAppointments,
  canUpdateAppointmentBreaks,
  canCreateAppointmentWorkSchedule,
  canUpdateAppointmentWorkSchedule,
  canDeleteAppointmentWorkSchedule,
  currentUserId,
  restrictCreateToOwnSpecialist,
  specialistLimitedEdit,
  onNotification,
  onClose
}) {
  const { translate } = useI18n();

  return (
    <section id="appointmentPanel" className="all-users-panel">
      <div className="all-users-head">
        <h3>{translate("Appointment planner")}</h3>
        <button
          id="closeAppointmentBtn"
          type="button"
          className="header-btn panel-close-btn"
          aria-label={translate("Close appointment panel")}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <AppointmentScheduler
        canReadAppointments={canReadAppointments}
        canReadAppointmentBreaks={canReadAppointmentBreaks}
        canViewAppointmentSpecialistAbsenceBlocks={canViewAppointmentSpecialistAbsenceBlocks}
        canReadStatisticsPlannerReport={canReadStatisticsPlannerReport}
        canCreateAppointments={canCreateAppointments}
        canUpdateAppointments={canUpdateAppointments}
        canDeleteAppointments={canDeleteAppointments}
        canUpdateAppointmentBreaks={canUpdateAppointmentBreaks}
        canCreateAppointmentWorkSchedule={canCreateAppointmentWorkSchedule}
        canUpdateAppointmentWorkSchedule={canUpdateAppointmentWorkSchedule}
        canDeleteAppointmentWorkSchedule={canDeleteAppointmentWorkSchedule}
        currentUserId={currentUserId}
        restrictCreateToOwnSpecialist={restrictCreateToOwnSpecialist}
        specialistLimitedEdit={specialistLimitedEdit}
        onNotification={onNotification}
      />
    </section>
  );
}

export default AppointmentPlannerPanel;
