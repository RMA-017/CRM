import { useMemo, useState } from "react";

const WEEKDAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SPECIALISTS = [
  { id: "sarah", name: "Dr. Sarah Lee", role: "Dermatology" },
  { id: "umar", name: "Dr. Umar Karimov", role: "Therapy" },
  { id: "amal", name: "Dr. Amal Johnson", role: "Dentistry" }
];

const APPOINTMENTS = {
  sarah: {
    monday: [
      { time: "09:00", client: "John Smith", service: "Skin Check", status: "confirmed" },
      { time: "13:00", client: "Marta Aliyeva", service: "Consultation", status: "pending" }
    ],
    tuesday: [
      { time: "10:00", client: "Nozima Rahimova", service: "Follow-up", status: "confirmed" }
    ],
    thursday: [
      { time: "15:00", client: "Daniel Kim", service: "Treatment", status: "no-show" }
    ]
  },
  umar: {
    monday: [
      { time: "11:00", client: "Akmal Usmonov", service: "Initial Consult", status: "confirmed" }
    ],
    wednesday: [
      { time: "14:00", client: "Laylo Nur", service: "Therapy Session", status: "confirmed" }
    ],
    friday: [
      { time: "16:00", client: "Dina Murod", service: "Review", status: "cancelled" }
    ]
  },
  amal: {
    tuesday: [
      { time: "09:00", client: "Azizbek Qodirov", service: "Dental Cleaning", status: "confirmed" }
    ],
    thursday: [
      { time: "12:00", client: "Sabina Lee", service: "Whitening", status: "pending" }
    ],
    saturday: [
      { time: "10:00", client: "Farhod Karim", service: "Consultation", status: "confirmed" }
    ]
  }
};

function getStartOfWeek(baseDate) {
  const date = new Date(baseDate);
  const currentDay = date.getDay();
  const diffToMonday = (currentDay + 6) % 7;
  date.setDate(date.getDate() - diffToMonday);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatHeaderDate(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatWeekRange(days) {
  const first = days[0]?.date;
  const last = days[days.length - 1]?.date;
  if (!(first instanceof Date) || !(last instanceof Date)) {
    return "";
  }
  return `${first.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${last.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function getTimeSlots() {
  return Array.from({ length: 11 }, (_, index) => `${String(index + 8).padStart(2, "0")}:00`);
}

function toDayKey(label) {
  return String(label || "").trim().toLowerCase();
}

function AppointmentScheduler() {
  const [selectedSpecialistId, setSelectedSpecialistId] = useState(SPECIALISTS[0].id);
  const [weekOffset, setWeekOffset] = useState(0);
  const timeSlots = useMemo(() => getTimeSlots(), []);

  const weekDays = useMemo(() => {
    const baseStart = getStartOfWeek(new Date());
    const targetStart = addDays(baseStart, weekOffset * 7);
    return WEEKDAY_LABELS.map((label, index) => ({
      key: toDayKey(label),
      label,
      date: addDays(targetStart, index)
    }));
  }, [weekOffset]);

  const appointmentsByDay = APPOINTMENTS[selectedSpecialistId] || {};
  const selectedSpecialist = SPECIALISTS.find((item) => item.id === selectedSpecialistId) || SPECIALISTS[0];

  return (
    <section className="appointment-scheduler" aria-label="Appointment scheduler">
      <div className="appointment-toolbar">
        <div className="appointment-toolbar-block">
          <span className="appointment-toolbar-label">Specialist</span>
          <div className="appointment-specialist-list" role="tablist" aria-label="Specialists">
            {SPECIALISTS.map((specialist) => (
              <button
                key={specialist.id}
                type="button"
                role="tab"
                aria-selected={selectedSpecialistId === specialist.id}
                className={`appointment-specialist-btn${selectedSpecialistId === specialist.id ? " is-active" : ""}`}
                onClick={() => setSelectedSpecialistId(specialist.id)}
              >
                <span>{specialist.name}</span>
                <small>{specialist.role}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="appointment-toolbar-block appointment-week-switcher">
          <button type="button" className="header-btn" onClick={() => setWeekOffset((prev) => prev - 1)}>
            Previous Week
          </button>
          <p className="appointment-week-range">{formatWeekRange(weekDays)}</p>
          <button type="button" className="header-btn" onClick={() => setWeekOffset((prev) => prev + 1)}>
            Next Week
          </button>
        </div>
      </div>

      <p className="appointment-selected-specialist">
        Schedule for <strong>{selectedSpecialist.name}</strong>
      </p>

      <div className="appointment-grid-wrap">
        <table className="appointment-grid" aria-label="Appointment week table">
          <thead>
            <tr>
              <th className="appointment-time-col">Time</th>
              {weekDays.map((day) => (
                <th key={day.key}>
                  <div className="appointment-day-head">
                    <span>{day.label}</span>
                    <small>{formatHeaderDate(day.date)}</small>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeSlots.map((slot) => (
              <tr key={slot}>
                <th className="appointment-time-col" scope="row">{slot}</th>
                {weekDays.map((day) => {
                  const item = (appointmentsByDay[day.key] || []).find((event) => event.time === slot);
                  return (
                    <td key={`${day.key}-${slot}`}>
                      {item ? (
                        <article className={`appointment-card appointment-status-${item.status}`}>
                          <p className="appointment-client">{item.client}</p>
                          <p className="appointment-service">{item.service}</p>
                          <span className="appointment-status">{item.status}</span>
                        </article>
                      ) : (
                        <span className="appointment-free-slot">Free</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default AppointmentScheduler;
