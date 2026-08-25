# Panel System Recommendations Traceability

Last updated: 2026-08-22

This document covers system recommendations only. XP is motivational and remains separate from academic score and grade.

| Panel Recommendation | SharpRunner Implementation | Relevant System Area | Status |
| --- | --- | --- | --- |
| Relate subject modules, lessons, and activities | Teacher classwork supports modules, module-associated lessons/assignments, instructions, schedules, links, and attachments. Predefined game activities remain linked through centralized curriculum metadata. | `ClassroomLessons`, classwork UI, `curriculumMetadata.js` | Implemented |
| Identify appropriate levels for students | Curriculum metadata labels conceptual difficulty as Beginner, Intermediate, or Advanced. Classroom sequence, availability, and schedules control assigned access. | Curriculum metadata, level settings | Implemented |
| Consider teacher modules | Teachers can create published/draft modules, associate lessons and assignments, attach learning resources, and set availability/due dates. | Teacher classroom Classwork | Implemented |
| Automatically record student scores | The backend records completion, failed attempts, time, completion time, final score, and derived grade. | `UserProgress`, progress API | Implemented |
| Consider self-paced learning | Students may revisit available modules/lessons, retry incomplete levels, replay completed levels, and review unlocked hints. Replays preserve the original recorded grade and cannot farm XP. | Lesson pages, map/game routes, progress API | Implemented |
| Three attempts before hints | The default is three failed attempts. The free basic hint unlocks immediately; students may then optionally purchase a protected, level-specific detailed hint for 15 XP. Both remain subject to the teacher master switch and configurable 1–10 threshold. | Game page, progress API, challenge settings | Implemented |
| Gamification based on interest | Students choose Challenges, Exploration, Competition, or Rewards; a secondary dashboard card presents matching real progress data. | Student dashboard/preferences | Implemented |
| Gamification based on motivation | Students choose Progress, Competition, Achievement/Rewards, or Story/Exploration; a prominent primary dashboard card changes immediately after a successful save. | Student dashboard/preferences | Implemented |
| Game type based on interest | SharpRunner remains one 2D coding adventure. Interest personalizes emphasis and is available to teachers only as aggregate counts. | Student/teacher dashboards | Implemented within intended scope |
| Basis for game levels | Central metadata traces every playable config to CodeChum curriculum source, module, lesson, topic, objective, difficulty, and SharpRunner level. | `curriculumMetadata.js` | Implemented |
| Data references for different challenges | CodeChum is recorded as a restricted source; URLs remain nullable and are never fabricated. | Curriculum metadata | Implemented |
| Mechanics linking games and learning | Existing validators evaluate C# submissions and shared events drive Phaser feedback without changing validator answers. | Level configs, validators, shared game events | Existing and verified |
| Scoring mechanism | Academic score is backend-calculated from challenge conditions. XP is awarded separately once per first completion. | Progress and gamification services | Implemented |
| Difficulty/challenge conditions controlled by instructor | Teachers control availability, order, unlock/due dates, hint threshold, hint master switch, and scoring deductions. They cannot edit validators or maps. | Teacher Challenge Settings | Implemented |
| Attempts | Failed attempts persist for incomplete levels, drive scoring and hint access, and are visible in progress reporting. Completed-level replay does not corrupt the original record. | Progress API and teacher grades | Implemented |
| Filipino cultural influence in the game environment | The Arrays, Functions, combined, and final curriculum scenes use Filipino settings and mythology including barangay environments, diwata, aswang, tikbalang, kapre, anting-anting, and Bakunawa. | Existing Phaser scenes/story | Existing |
| Various multimedia elements for sustained game learning | Phaser graphics, sprites and animation, interactive Monaco coding, dialogue, visual feedback, sound effects where applicable, and quiet chapter-mapped background music with separate live volume/mute controls are supported. Classroom resources support PDFs/images/Office/text/audio/small-video files and external video links. | Game shell, centralized BGM system, and classroom resources | Implemented/existing |

## Architectural Scope

### Instructor responsibilities

Teachers manage classrooms, instructional modules, lessons, assignments, learning resources, publication/availability, deadlines, classroom challenge conditions, hints, and academic scoring configuration.

### Developer/system responsibilities

SharpRunner developers maintain Phaser maps, game physics, collision configuration, C# validators, character logic, game events, and challenge implementations.

The teacher module is an instructional-content and configuration tool. It is not a Phaser scene editor, validator builder, collision editor, or game-authoring tool.

## XP policy

- First successful completion: 20 base XP.
- Zero failed attempts: 10 first-attempt bonus XP.
- No hint used: 5 no-hint bonus XP.
- Reward values are centralized in `backend/src/constants/gamificationConfig.js`.
- A unique XP ledger entry and a locked user balance prevent refresh, replay, and concurrent duplicate rewards.
- The free basic hint does not cost XP, so low XP never blocks essential guidance.
- A detailed hint costs 15 XP and is optional. The backend checks access, threshold, teacher controls, balance, and prior purchase inside the purchase flow.
- Detailed-hint deductions use the XP ledger and a locked user/progress transaction. XP spending never directly reduces the academic grade.
- When a teacher disables hints, the API hides both Basic and Detailed Hint content, including previously purchased detailed hints, and rejects new hint use or purchases. Existing purchases remain recorded and no XP is refunded automatically.

## Student preference card mapping

| Saved choice | Visible dashboard focus |
| --- | --- |
| Motivation: Progress | Completed levels, overall journey percentage, and next level |
| Motivation: Competition | Classroom rank, class size when available, and XP; an honest join-the-ranking empty state otherwise |
| Motivation: Rewards | Total XP, latest recorded level XP when available, and XP progress |
| Motivation: Story | Current named region, topic, next level, and accessible-level count |
| Interest: Challenges | First-attempt completions and completed-level count, with a first-challenge empty state |
| Interest: Exploration | Story/exploration data unless the primary choice is Story |
| Interest: Competition or Rewards | The matching rank or XP data unless it duplicates the primary choice |

When both choices resolve to the same focus (Competition + Competition, Rewards + Rewards, or Story + Exploration), the secondary card becomes the student's next learning goal. Profiles without saved values use Progress + Challenges. The cards read the saved user profile, so changing a select does not falsely imply persistence; they update after the API confirms the save and are restored from `/api/auth/me` on reload.
