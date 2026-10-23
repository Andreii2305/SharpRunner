import { classroomOptionLabel } from "./adminStudentClassroomFilterState.js";
import styles from "./AdminDashboardPage.module.css";

export function AdminStudentClassroomFilterView({
  selectedClassroom,
  options,
  search,
  page,
  totalPages,
  total,
  status,
  error,
  onSearchChange,
  onSelect,
  onPageChange,
  onRetry,
}) {
  const selectedId = selectedClassroom ? String(selectedClassroom.id) : "";
  const selectedOnPage = selectedClassroom
    && options.some((classroom) => String(classroom.id) === selectedId);
  const paginationAvailable = Number.isInteger(total) && Number.isInteger(totalPages);

  return (
    <fieldset className={styles.classroomFilter}>
      <legend>Classroom</legend>
      <div className={styles.classroomFilterControls}>
        <label>
          Applied classroom
          <select value={selectedId} onChange={(event) => onSelect(event.target.value)}>
            <option value="">All classrooms</option>
            {selectedClassroom && !selectedOnPage && (
              <option value={selectedId}>{classroomOptionLabel(selectedClassroom)}</option>
            )}
            {options.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>{classroomOptionLabel(classroom)}</option>
            ))}
          </select>
        </label>
        <label>
          Find a classroom
          <input
            type="search"
            value={search}
            aria-label="Search classrooms for student filtering"
            placeholder="Classroom, teacher, or email"
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
      </div>

      <p className={styles.classroomFilterHelp}>Includes students with active classroom memberships. Account status is filtered separately.</p>
      {selectedClassroom && <p className={styles.appliedClassroom}>Applied classroom: <strong>{classroomOptionLabel(selectedClassroom)}</strong></p>}

      {status === "loading" && <p className={styles.classroomLookupState} role="status">Loading classrooms…</p>}
      {status === "error" && (
        <div className={`${styles.classroomLookupState} ${styles.classroomLookupError}`} role="alert">
          <span>{error || "Unable to load classrooms."}</span>
          <button type="button" onClick={onRetry}>Retry</button>
        </div>
      )}
      {status === "success" && options.length === 0 && (
        <p className={styles.classroomLookupState}>No classrooms match this search.</p>
      )}
      <nav className={styles.classroomLookupPagination} aria-label="Classroom search result pages">
          <span>{paginationAvailable ? `${total} classrooms · Classroom results page ${page} of ${totalPages}` : "Classroom results unavailable"}</span>
          <div>
            <button
              type="button"
              aria-label="Previous classroom results page"
              disabled={!paginationAvailable || page <= 1}
              onClick={() => onPageChange(page - 1)}
            >Previous</button>
            <button
              type="button"
              aria-label="Next classroom results page"
              disabled={!paginationAvailable || page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >Next</button>
          </div>
      </nav>
    </fieldset>
  );
}
