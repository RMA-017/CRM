import { useState } from "react";
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
  onClose
}) {
  const { translate } = useI18n();
  const [showBookedOnly, setShowBookedOnly] = useState(false);

  return (
    <section id="appointmentPanel" className="all-users-panel">
      <div className="all-users-head">
        <h3>{translate("Appointment planner")}</h3>
        <div className="all-users-head-actions appointment-planner-head-actions">
          <button
            id="appointmentBookedOnlyToggle"
            type="button"
            className={`header-btn appointment-booked-only-toggle${showBookedOnly ? " is-active" : ""}`}
            aria-label={translate(showBookedOnly ? "Show all planner slots" : "Show booked planner slots only")}
            title={translate(showBookedOnly ? "Show all planner slots" : "Show booked planner slots only")}
            aria-pressed={showBookedOnly ? "true" : "false"}
            onClick={() => setShowBookedOnly((current) => !current)}
          >
            <span aria-hidden="true">≡</span>
          </button>
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
        compactOccupiedOnly={showBookedOnly}
      />
    </section>
  );
}

export default AppointmentPlannerPanel;
