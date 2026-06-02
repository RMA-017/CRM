import { formatDateYMD } from "../../../lib/formatters.js";

function AllUsersPanel({
  isCreateUserView,
  canCreateUsers,
  openUserCreateModal,
  closeCreateUserPanel,
  closeAllUsersPanel,
  allUsersSearch,
  setAllUsersSearch,
  loadAllUsers,
  allUsersLoading,
  allUsers,
  canUpdateUsers,
  canDeleteUsers,
  openAllUsersEditModal,
  openAllUsersDeleteModal,
  allUsersPage,
  allUsersTotalPages
}) {
  return (
    <section id="allUsersPanel" className="all-users-panel">
      <div className="all-users-head">
        <h3>All Users</h3>
        <div className="all-users-head-actions">
          <button
            id="openUsersCreateModalBtn"
            type="button"
            className="header-btn appointment-breaks-add-icon-btn"
            aria-label="Add user"
            title="Add user"
            hidden={!canCreateUsers}
            onClick={openUserCreateModal}
          >
            +
          </button>
          <button
            id="closeAllUsersBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close all users panel"
            onClick={isCreateUserView ? closeCreateUserPanel : closeAllUsersPanel}
          >
            ×
          </button>
        </div>
      </div>

      <form
        className="panel-search-bar"
        onSubmit={(event) => {
          event.preventDefault();
          void loadAllUsers(1);
        }}
      >
        <input
          type="search"
          className="panel-search-input"
          placeholder="Search by ID, name, username, email, phone..."
          value={allUsersSearch}
          onChange={(event) => setAllUsersSearch(event.currentTarget.value)}
        />
        <button type="submit" className="btn panel-search-btn" disabled={allUsersLoading}>
          Search
        </button>
      </form>

      <div className="table-outer-scroll-wrap">
      <div id="allUsersTableWrap" className="all-users-table-wrap">
        <table className="all-users-table" aria-label="All users table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Organization</th>
              <th>Username</th>
              <th>Email</th>
              <th>Full Name</th>
              <th>Birthday</th>
              <th>Phone</th>
              <th>Position</th>
              <th>Role</th>
              <th>Created At</th>
              <th aria-label="Edit">✎</th>
              <th aria-label="Delete">
                <span className="table-trash-icon" aria-hidden="true" />
              </th>
            </tr>
          </thead>
          <tbody id="allUsersTableBody">
            {allUsersLoading ? (
              [0, 1, 2, 3, 4].map((index) => (
                <tr key={index} aria-hidden="true">
                  <td colSpan="12" className="skel" />
                </tr>
              ))
            ) : allUsers.map((user) => (
              <tr key={String(user.id)}>
                <td>{user.id || "-"}</td>
                <td>
                  {user.organizationName && user.organizationCode
                    ? `${user.organizationName} (${user.organizationCode})`
                    : (user.organizationCode || "-")}
                </td>
                <td>{user.username || "-"}</td>
                <td>{user.email || "-"}</td>
                <td>{user.fullName || "-"}</td>
                <td>{formatDateYMD(user.birthday)}</td>
                <td>{user.phone || "-"}</td>
                <td>{user.position || "-"}</td>
                <td>{user.role || "-"}</td>
                <td>{formatDateYMD(user.createdAt)}</td>
                <td>
                  <button
                    type="button"
                    className="table-action-btn profile-table-icon-btn"
                    aria-label="Edit"
                    title="Edit"
                    disabled={!canUpdateUsers}
                    onClick={() => openAllUsersEditModal(user.id)}
                  >
                    ✎
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    className="table-action-btn table-action-btn-danger profile-table-icon-btn"
                    aria-label="Delete"
                    title="Delete"
                    disabled={!canDeleteUsers}
                    onClick={() => openAllUsersDeleteModal(user.id)}
                  >
                    <span className="table-trash-icon" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>

      <div id="allUsersPagination" className="all-users-pagination" hidden={allUsersLoading || allUsers.length === 0}>
        <button
          id="allUsersPrevBtn"
          type="button"
          className="header-btn"
          disabled={allUsersPage <= 1}
          onClick={() => loadAllUsers(allUsersPage - 1)}
        >
          Previous
        </button>
        <span id="allUsersPageInfo" className="all-users-page-info">
          Page {allUsersPage} of {allUsersTotalPages}
        </span>
        <button
          id="allUsersNextBtn"
          type="button"
          className="header-btn"
          disabled={allUsersPage >= allUsersTotalPages}
          onClick={() => loadAllUsers(allUsersPage + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}

export default AllUsersPanel;
