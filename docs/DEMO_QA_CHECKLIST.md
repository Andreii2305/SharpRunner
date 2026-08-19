# SharpRunner Manual and Demo QA Checklist

Use this checklist on the exact build and environment that will be presented. The automated preflight catches code regressions; the manual section checks browser behavior, real persistence, role permissions, email, and presentation quality.

## Test Record

- Date and time:
- Tester:
- Commit or release:
- Environment and URL:
- Browser and viewport:
- Result: PASS / FAIL
- Notes or issue links:

## 1. Safe Test Data

Prepare these before the demo. Use dedicated demo records, never real student data.

- [ ] One active, verified student account.
- [ ] One active, verified teacher account.
- [ ] One active admin account.
- [ ] One disposable student or teacher account that the admin may activate/deactivate.
- [ ] One demo classroom owned by the demo teacher, with its join code saved.
- [ ] The student starts outside that classroom if classroom joining will be demonstrated.
- [ ] The developer setup key is available only if the admin-invite flow is in the demo.
- [ ] Two browser profiles or one normal and one private window are ready for teacher/student switching.

## 2. Automated Preflight

From the repository root, run:

```bash
node scripts/demo-preflight.mjs
```

- [ ] Environment readiness prints no unexpected `WARN` entries.
- [ ] Backend API tests pass.
- [ ] Frontend lint passes.
- [ ] Validator, route, and asset audits pass.
- [ ] The production build succeeds.

Then start the API and frontend in separate terminals:

```bash
npm --prefix backend run dev
npm --prefix frontend run dev:local
```

- [ ] `http://localhost:5000/api/health` returns `status: ok` and `database: connected`.
- [ ] `http://localhost:5173` loads without a blank screen or visible console error.

For a deployed demo, perform the two checks above using the deployed API and frontend URLs as well.

## 3. Public and Authentication Smoke Test

- [ ] Landing-page navigation, primary call-to-action, and login link work.
- [ ] Refreshing a public page does not produce a 404.
- [ ] An invalid login shows a clear error and does not authenticate.
- [ ] Student login opens the student area; teacher login opens the teacher area; admin login opens the admin area.
- [ ] A signed-out visitor who opens `/dashboard`, `/teacher`, or `/admin` is denied or redirected.
- [ ] Logging out removes access, including after refreshing a protected URL.
- [ ] At a narrow mobile viewport, login and the main navigation remain usable without horizontal overflow.

Only when account registration is part of the demo:

- [ ] Student registration sends a verification message.
- [ ] The verification link/code works once and an expired or reused value is rejected.
- [ ] Resend shows its cooldown and sends a replacement message.

## 4. Student Journey

- [ ] The student dashboard loads saved data without error.
- [ ] An invalid classroom code shows an error and creates no membership.
- [ ] The saved demo code joins the classroom exactly once; retrying does not duplicate membership.
- [ ] The joined classroom, teacher content, and announcements are visible to the student.
- [ ] The lesson map opens the expected unlocked level and does not unlock later levels early.
- [ ] Submitting invalid C# keeps the level incomplete and shows useful feedback.
- [ ] Submitting valid C# completes the level and shows the backend-issued score and grade.
- [ ] Refreshing the game/map/dashboard preserves completion, score, attempts, and time.
- [ ] The leaderboard and classroom lesson/assignment pages load without errors.
- [ ] Assignment uploads show the server file-count and per-file size limits; selecting too many or an oversized file is rejected before submission.

## 5. Teacher Journey

- [ ] The teacher dashboard metrics load and match the demo classroom.
- [ ] The classroom list and classroom detail show the joined student once.
- [ ] Student progress displays the level completion, score, attempts, and time from the student journey.
- [ ] Creating a disposable classroom produces a usable join code; archive/delete it afterward only if the UI supports recovery or it is clearly test data.
- [ ] Posting a clearly labelled test announcement makes it visible to the student.
- [ ] Changing level availability, order, unlock/due dates, hints, or grading deductions affects only that classroom.
- [ ] Resetting classroom level settings restores the supported controls to their system defaults.
- [ ] Lesson attachments show the server upload limits; create, add, and replace actions reject too many or oversized files before uploading.
- [ ] Analytics and student pages handle an empty classroom without crashing.
- [ ] A teacher cannot open or edit another teacher's classroom by changing the URL identifier.

## 6. Admin Journey

Use disposable accounts for every mutating check.

- [ ] User search and role/status filters return the expected demo accounts.
- [ ] Creating a teacher requires valid input and produces the expected verification state.
- [ ] Deactivating the disposable account blocks its next login and current-session API access.
- [ ] Reactivating that account restores login.
- [ ] Admin activity logs record the create/status actions with the correct actor and target.
- [ ] User and activity-log pagination preserves the selected filters and displays accurate totals.
- [ ] Changing a disposable user between student and teacher is audited; admin role changes are rejected.
- [ ] Resetting a demo teacher password emails a temporary password and never displays it in the dashboard.
- [ ] The UI prevents deactivating an admin account.
- [ ] Student, teacher, and unauthenticated sessions cannot access admin APIs or pages.

## 7. Developer Invite Journey (Optional)

Skip this section unless it will be presented.

- [ ] An incorrect developer setup key is rejected.
- [ ] The correct key opens developer tools without granting a normal user session.
- [ ] A one-time admin invite can be generated, optionally restricted to a demo email.
- [ ] The invite registers one admin and cannot be reused.
- [ ] An expired, invalid, or email-mismatched invite is rejected.
- [ ] The new admin completes email verification before login, when verification is enabled.

## 8. Presentation Readiness

- [ ] No passwords, setup keys, connection strings, private email, or real student data are visible in tabs, terminals, autofill, or screenshots.
- [ ] Browser zoom is readable on the presentation display.
- [ ] Audio, animation, editor typing, dialogs, and scrolling behave acceptably on the presentation machine.
- [ ] The browser console has no new uncaught errors during the primary demo path.
- [ ] Refresh is tested on the deployed app's key routes to catch hosting rewrite problems.
- [ ] A backup recording or screenshots and a rehearsed offline explanation are available.
- [ ] Demo data is reset to its intended starting state.

## 9. Recommended 8-Minute Demo Path

1. Sign in as the teacher and show the classroom code and supported level settings.
2. Sign in as the student in the second browser profile and join the classroom.
3. Open a level, show an invalid submission, then complete it with valid C#.
4. Refresh the student dashboard to show the persisted backend score.
5. Return to the teacher profile and show the student's updated progress and analytics.
6. Briefly show admin user controls and activity logs using disposable records.
7. Show developer invites only if they are part of the presentation scope.

## Exit Criteria

The build is demo-ready when the automated preflight passes and every applicable manual item above passes. Record failures with the route, role, exact steps, expected result, actual result, screenshot, and relevant browser/API error. Block the demo for failed authentication, authorization, saving, scoring, or deployed-route refresh checks.
