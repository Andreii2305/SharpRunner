# API Testing

Run the backend suite from the repository root:

```bash
npm --prefix backend test
```

The suite starts the real Express application on an ephemeral localhost port.
Persistence calls are replaced with isolated model fixtures, so it is safe to
run without PostgreSQL and never modifies development or production data.

## Covered HTTP flows

- Verified password login and JWT issuance
- Rejection of inactive accounts with otherwise-valid JWTs
- Classroom joining and membership creation
- Rejection of forged level completion
- Acceptance and backend scoring of valid level code
- Student rejection from teacher routes
- Teacher classroom creation and ownership
- Admin status changes and audit-log creation
- Developer login and one-time admin invite creation

Policy tests additionally cover lesson audiences, assignment due dates and
attempt limits, upload restrictions, RLS table coverage, all playable level
validators, and the legacy backend validator-configuration pass-through. That
configuration is not exposed as a teacher-editable control in the current UI.
Admin route coverage includes paginated users/logs, summary metrics, protected
role changes, audited deletion, and temporary-password email delivery without
returning credentials in API responses.

## Real database testing

Model fixtures cannot verify PostgreSQL constraints, migrations, transactions,
or driver behavior. That requires a separate disposable PostgreSQL database.
Use a dedicated `TEST_DATABASE_URL`; never reuse a development or production
connection string. Database-backed tests are intentionally not enabled until a
disposable database is provisioned for local development and CI.
