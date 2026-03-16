import CustomSelect from "../../../components/CustomSelect.jsx";

function NotificationSendPanel({
  closeNotificationsSendPanel,
  notificationSendForm,
  setNotificationSendForm,
  sendManualNotification,
  notificationSendSubmitting,
  roleOptions
}) {
  return (
    <section id="notificationsSendPanel" className="all-users-panel settings-panel">
      <div className="all-users-head">
        <h3>Notification</h3>
        <button
          id="closeNotificationsSendBtn"
          type="button"
          className="header-btn panel-close-btn"
          aria-label="Close notification panel"
          onClick={closeNotificationsSendPanel}
        >
          ×
        </button>
      </div>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void sendManualNotification();
        }}
      >
        <div className="settings-form-grid settings-form-grid-notify">
          <div className="field">
            <label htmlFor="notificationTargetRole">Recipients</label>
            <CustomSelect
              id="notificationTargetRole"
              value={String(notificationSendForm?.targetRole || "all")}
              options={[
                { value: "all", label: "All Users" },
                ...(Array.isArray(roleOptions) ? roleOptions : [])
                  .map((role) => ({
                    value: String(role?.value || "").trim().toLowerCase(),
                    label: String(role?.label || "").trim()
                  }))
                  .filter((role) => role.value && role.label)
              ]}
              onChange={(nextValue) => {
                setNotificationSendForm((prev) => ({ ...prev, targetRole: nextValue }));
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="notificationMessageInput">Message</label>
            <textarea
              id="notificationMessageInput"
              name="message"
              maxLength={255}
              placeholder="Write notification message"
              className="notify-textarea"
              rows={1}
              value={String(notificationSendForm?.message || "")}
              onInput={(event) => {
                const element = event.currentTarget;
                element.style.height = "auto";
                element.style.height = `${element.scrollHeight}px`;
                const nextValue = element.value;
                setNotificationSendForm((prev) => ({ ...prev, message: nextValue }));
              }}
            />
          </div>
          <div className="field settings-inline-control settings-action-field">
            <label aria-hidden="true">&nbsp;</label>
            <button className="btn settings-add-btn" type="submit" disabled={notificationSendSubmitting}>
              {notificationSendSubmitting ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

export default NotificationSendPanel;
