import { Link } from "react-router-dom";
import Header from "../../Components/Header/Header.jsx";
import styles from "./LegalPages.module.css";

const EFFECTIVE_DATE = "September 13, 2026";

function PageShell({ title, description, children, otherDocument }) {
  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <nav className={styles.breadcrumbs} aria-label="Legal page navigation">
          <Link to="/">Home</Link>
          <span aria-hidden="true">/</span>
          <Link to="/legal">Legal &amp; Privacy</Link>
        </nav>
        <header className={styles.hero}>
          <span className={styles.eyebrow}>SharpRunner legal information</span>
          <h1>{title}</h1>
          <p>{description}</p>
          <dl className={styles.dates}>
            <div><dt>Effective Date</dt><dd>{EFFECTIVE_DATE}</dd></div>
            <div><dt>Last Updated</dt><dd>{EFFECTIVE_DATE}</dd></div>
          </dl>
        </header>
        <article className={styles.document}>{children}</article>
        <nav className={styles.documentNav} aria-label="Other legal documents">
          <Link to={otherDocument.to}>{otherDocument.label}</Link>
          <Link to="/">Return to SharpRunner home</Link>
        </nav>
      </main>
    </div>
  );
}

const Section = ({ number, title, children }) => (
  <section>
    <h2>{number}. {title}</h2>
    {children}
  </section>
);

export function PrivacyPolicyPage() {
  return (
    <PageShell
      title="SharpRunner Privacy Policy"
      description="How SharpRunner handles account, classroom, and learning information."
      otherDocument={{ to: "/terms", label: "Read the Terms & Conditions" }}
    >
      <Section number="1" title="Introduction">
        <p>SharpRunner is a gamified web-based educational platform designed to teach C# programming fundamentals. This Policy explains what information the platform processes, why it is used, who may access it, and the choices available to users.</p>
        <p>SharpRunner aims to process personal information responsibly, securely, and transparently and to follow applicable Philippine data-protection requirements, particularly Republic Act No. 10173, the Data Privacy Act of 2012. This statement describes the platform&apos;s practices and does not claim a certification or an absolute guarantee of compliance or security.</p>
      </Section>

      <Section number="2" title="Information We Collect">
        <h3>Account Information</h3>
        <p>SharpRunner processes the name, username, email address, user role, account and verification status, authentication provider, and profile or preference information a user supplies. Passwords for password-based accounts are hashed and are not intended to be stored as readable plain text. When Google Sign-In is used, SharpRunner may receive a verified email address, name, and Google account identifier made available through authentication.</p>
        <h3>Academic and Learning Information</h3>
        <p>The platform records lesson and level progress, completion state and time, challenge attempts, elapsed learning time, final scores, XP awards and transactions, hint eligibility and use, and classroom lesson or assignment submissions, grades, rubric results, feedback, and attachments where those features are used.</p>
        <h3>Learning Preferences</h3>
        <p>Students may provide optional motivation and learning-game preferences, such as an interest in progress, competition, rewards, story, challenges, or exploration. These inputs support interface and gamification choices. They should not be used to unfairly determine academic grades.</p>
        <h3>Classroom Information</h3>
        <p>SharpRunner processes classroom membership and status, class identifiers and codes, teacher-student associations, announcements and view state, lessons, modules, assignments, instructional files, schedules, deadlines, submissions, classroom progress, and teacher-configured learning settings.</p>
        <h3>Teacher Information and Content</h3>
        <p>The platform stores teacher-created classrooms, announcements, lesson and assignment content, resources, rubrics, feedback, content versions, and related classroom-management records.</p>
        <h3>Technical, Security, and Administrative Information</h3>
        <p>SharpRunner processes authentication and session-version information, password-reset and email-verification records, account status, administrative actions, classroom-content audit records, application errors, and other information reasonably necessary to operate and protect the service. Rate limits may use request information temporarily to control abusive traffic.</p>
      </Section>

      <Section number="3" title="How We Use Information">
        <p>Information may be used to maintain and authenticate accounts; verify email addresses; provide lessons, coding activities, modules, and classrooms; save progress; calculate attempts, scores, grades, XP, and hint state; let authorized teachers review classroom progress; provide password recovery; deliver account and classroom functions; maintain security; troubleshoot errors; improve educational functionality; and support appropriately authorized academic or system evaluation.</p>
        <p><strong>SharpRunner does not intend to sell users&apos; personal information.</strong></p>
      </Section>

      <Section number="4" title="Student Performance Data">
        <p>Teachers may view relevant progress, attempts, time, scores, hint use, submissions, grades, and other learning records for students actively enrolled in classrooms they manage. Administrators may access limited records for legitimate system administration. Academic information should not be disclosed to unrelated or unauthorized users.</p>
      </Section>

      <Section number="5" title="Motivation and Learning Preference Data">
        <p>Optional preference inputs may help SharpRunner tailor presentation and gamification features. When this information is used for research or evaluation, aggregated or de-identified information should be used whenever reasonably possible.</p>
      </Section>

      <Section number="6" title="Coding and Practice Data">
        <p>Code entered in the practice environment is sent to SharpRunner&apos;s restricted compiler service so it can be compiled or executed and return educational output. Normal level validation records the resulting progress, attempts, scores, timing, and hint state rather than the practice source itself. Code or files submitted as classroom assignments may be retained with the assignment record under the teacher&apos;s configured submission process.</p>
        <p>Do not paste passwords, API keys, private keys, confidential personal information, or another person&apos;s sensitive data into coding exercises or submissions. Execution output and operational error information may be processed as needed to return results, diagnose failures, and protect the service.</p>
      </Section>

      <Section number="7" title="Who May Access Information">
        <ul>
          <li><strong>Students</strong> may access their own account, learning, classroom, and submission information and classroom information made available to them.</li>
          <li><strong>Teachers</strong> may access the classrooms they manage and relevant information about enrolled students and their work.</li>
          <li><strong>Administrators</strong> may access information needed for account, classroom, content, security, and service administration.</li>
          <li><strong>Authorized technical personnel</strong> may access information when reasonably needed to maintain, secure, or troubleshoot the platform.</li>
        </ul>
        <p>Access should be role-based and limited to a legitimate educational, administrative, or technical need.</p>
      </Section>

      <Section number="8" title="Service Providers">
        <p>SharpRunner may rely on third-party infrastructure for hosting, databases, authentication, email delivery, file storage, and related technical operations. Those providers may process information only as needed to deliver their services and subject to their applicable terms, safeguards, and legal obligations. Providers are not named here because deployment services may differ by environment.</p>
      </Section>

      <Section number="9" title="Data Sharing and Disclosure">
        <p>Information may be shared when authorized by the user; necessary to provide the service; required for legitimate classroom or institutional management; required by law or lawful process; reasonably needed to investigate security, fraud, abuse, or service incidents; or appropriately aggregated or de-identified for legitimate evaluation or research. SharpRunner should disclose only what is reasonably necessary for the applicable purpose.</p>
      </Section>

      <Section number="10" title="Data Retention">
        <p>Personal information is kept only as long as reasonably necessary for the purpose for which it was collected, legitimate educational or administrative needs, security and audit needs, dispute handling, or applicable law. Retention may differ by record type and classroom or institutional requirements.</p>
      </Section>

      <Section number="11" title="Account Archival and Deletion">
        <p>Authorized administrators can make accounts inactive, archive and later restore eligible accounts, revoke sessions, and permanently delete eligible non-administrator accounts after an archive-and-confirmation process. Classroom records can also be archived. Deletion may remove associated records through database relationships, but SharpRunner does not promise immediate or complete deletion where limited records must legitimately be retained for security, audit, backup, legal, or academic-record purposes.</p>
      </Section>

      <Section number="12" title="Data Security">
        <p>SharpRunner uses reasonable administrative and technical safeguards supported by the application, including password hashing, verified-email flows, role-based authorization, account-status and session controls, single-use password-reset records, request rate limits, upload checks, database access restrictions, administrative audit records, and restrictions around code execution. No online service is completely secure, and users should report suspected incidents promptly.</p>
      </Section>

      <Section number="13" title="User Responsibilities">
        <p>Users must protect their credentials, use only accounts they are authorized to access, sign out from shared devices, report suspected account compromise, avoid uploading unnecessary personal information, and keep secrets or confidential information out of code and assignment submissions.</p>
      </Section>

      <Section number="14" title="Rights of Data Subjects">
        <p>Subject to applicable law and any valid exceptions, data subjects in the Philippines may have rights to be informed; access personal information; correct inaccurate information; object to certain processing; request erasure or blocking; withdraw consent where consent is the basis for processing; obtain data portability where applicable; seek damages; and file a complaint with the National Privacy Commission. Identity or authority may need to be verified before a request is completed.</p>
      </Section>

      <Section number="15" title="Research and Statistical Use">
        <p>SharpRunner may support academic, capstone, or system evaluation. Optional research consent is separate from the required Terms acceptance and Privacy Policy acknowledgement. Declining or withdrawing optional research participation does not reduce normal platform functionality. Research outputs should use aggregated or de-identified information whenever reasonably possible, and identifiable student information should not appear in public research outputs without an appropriate legal basis or authorization.</p>
        <p>Withdrawal applies to future research use where consent is the basis. It may not be possible to remove information that was already irreversibly anonymized and can no longer reasonably be linked to the user.</p>
      </Section>

      <Section number="16" title="Children's and Student Privacy">
        <p>SharpRunner is designed for educational use. When a user is a minor, applicable parental or guardian, institutional, and legal requirements should be followed. Teachers, administrators, institutions, and operators should limit access to legitimate educational purposes and use age-appropriate notices and processes where required.</p>
      </Section>

      <Section number="17" title="Changes to This Privacy Policy">
        <p>This Policy may be revised as SharpRunner&apos;s features, practices, or legal obligations change. The updated date will be revised, and a material change may require users to acknowledge a new policy version before continuing to use authenticated features.</p>
      </Section>

      <Section number="18" title="Contact and Privacy Requests">
        <p>Questions and privacy requests should be sent to the official SharpRunner privacy contact once designated:</p>
        <address>
          <strong>Privacy Contact:</strong> [Insert official email address]<br />
          <strong>Institution:</strong> [Insert operating institution]
        </address>
        <p>No Data Protection Officer name or institutional operator is stated here until officially confirmed.</p>
      </Section>
    </PageShell>
  );
}

export function TermsPage() {
  return (
    <PageShell
      title="SharpRunner Terms & Conditions"
      description="The rules that apply when accessing or using SharpRunner."
      otherDocument={{ to: "/privacy-policy", label: "Read the Privacy Policy" }}
    >
      <Section number="1" title="Acceptance of Terms">
        <p>These Terms govern access to and use of SharpRunner. By creating an account or accepting an updated version, a user confirms that they have read and agree to these Terms and acknowledge the Privacy Policy. A person who does not accept may choose not to create an account or may log out and stop using authenticated features.</p>
      </Section>
      <Section number="2" title="Purpose of SharpRunner">
        <p>SharpRunner is an educational and capstone platform for learning C# fundamentals through modules, coding activities, classroom lessons and assignments, progress records, grading, XP, hints, rewards, and game-based challenges. Features may vary by role, classroom configuration, and deployment.</p>
      </Section>
      <Section number="3" title="User Accounts">
        <p>Users must provide appropriate account information, keep it reasonably accurate, protect credentials, avoid sharing accounts, and use only accounts they are authorized to access. Users are responsible for activity performed through their accounts to the extent permitted by applicable law.</p>
      </Section>
      <Section number="4" title="User Roles">
        <ul>
          <li><strong>Students</strong> complete lessons and assignments, join classrooms using authorized class codes, and view their learning progress and rewards.</li>
          <li><strong>Teachers</strong> manage their classrooms, students, announcements, learning content, schedules, submissions, grades, and classroom analytics.</li>
          <li><strong>Administrators</strong> manage accounts, roles, status, classrooms, content oversight, invitations, security operations, and administrative audit information.</li>
        </ul>
        <p>Role permissions do not authorize access beyond a legitimate educational or administrative need.</p>
      </Section>
      <Section number="5" title="Acceptable Use">
        <p>Users must not attempt unauthorized account access or credential theft; bypass access controls; manipulate scores, grades, attempts, XP, rewards, or progress; exploit bugs; introduce malicious code; attack or disrupt the service; access databases or servers without authorization; collect another user&apos;s information without authority; harass or impersonate others; or upload or distribute unlawful, harmful, or unauthorized content.</p>
      </Section>
      <Section number="6" title="Coding Environment">
        <p>Submitted code may be compiled, validated, or executed for educational purposes. Users must not intentionally submit code designed to attack system resources or external systems, steal secrets, run malware, bypass sandbox or validation restrictions, or consume unreasonable computing resources. SharpRunner may impose execution time, memory, API, network, and other safeguards or limits.</p>
      </Section>
      <Section number="7" title="Academic Integrity">
        <p>Users must not falsify progress, manipulate scores, exploit level unlocking, share accounts to complete work, submit another student&apos;s work as their own, or bypass grading and validation. Teachers and institutions may apply their own academic-integrity rules in addition to these Terms.</p>
      </Section>
      <Section number="8" title="Scores, Grades, XP, and Hints">
        <p>SharpRunner may automatically record attempts, timing, completion, scores, XP awards or deductions, and hint use. Teachers may configure classroom learning and grading settings and grade assignments. Automated results may contain errors and should be reviewed through appropriate classroom processes when they affect official assessment. XP and in-platform rewards have no monetary value and cannot be exchanged for money.</p>
      </Section>
      <Section number="9" title="Teacher-Created Content">
        <p>Teachers must upload or link only appropriate educational content they are authorized to use. They are responsible for classroom instructions, grading criteria, external resources, and respecting privacy, intellectual-property, and institutional requirements.</p>
      </Section>
      <Section number="10" title="Student Data and Privacy">
        <p>Personal and learning information is handled as described in the <Link to="/privacy-policy">SharpRunner Privacy Policy</Link>. Users must respect other users&apos; privacy and may access student information only when authorized.</p>
      </Section>
      <Section number="11" title="Classroom Access">
        <p>Students join a classroom using an active class code supplied by an authorized teacher or institution. Codes must not be used to enter an unrelated classroom. Teachers can rotate codes, remove memberships, and archive or reactivate classrooms. Access may be limited by classroom capacity, membership state, schedules, or deadlines.</p>
      </Section>
      <Section number="12" title="Leaderboards">
        <p>Classroom leaderboards may display rank and learning-performance information for active classroom participants. Leaderboards are educational gamification features, are limited by classroom and role access, and should not be used to harass, shame, or misrepresent another student.</p>
      </Section>
      <Section number="13" title="System Availability">
        <p>Maintenance, updates, hosting or database issues, network conditions, email delivery, compiler availability, and third-party outages may temporarily affect SharpRunner. The platform does not guarantee uninterrupted or error-free service or 100% uptime.</p>
      </Section>
      <Section number="14" title="Account Suspension, Deactivation, and Archival">
        <p>Authorized administrators may deactivate or archive accounts, restore eligible accounts, or revoke sessions for security, administration, rule enforcement, or legitimate institutional needs. Teachers may remove classroom memberships but cannot thereby delete the underlying account.</p>
      </Section>
      <Section number="15" title="Account Deletion">
        <p>Eligible non-administrator accounts may be permanently deleted by an authorized administrator after they have first been archived and the deletion is expressly confirmed. Some limited records may be retained where reasonably required for legal, security, audit, backup, dispute, or legitimate academic-record purposes.</p>
      </Section>
      <Section number="16" title="Intellectual Property">
        <p>SharpRunner&apos;s original application code, branding, lessons, game design, and materials remain the property of their respective creators or authorized operators, subject to any applicable repository license. Third-party libraries, assets, linked resources, and contributed content remain subject to their respective owners&apos; licenses and rights. These Terms do not transfer ownership to users.</p>
      </Section>
      <Section number="17" title="External Links and Third-Party Services">
        <p>SharpRunner may use or link to third-party authentication, email, hosting, storage, documentation, or educational resources. Those services have their own terms and privacy practices. SharpRunner is not responsible for third-party content or availability beyond what applicable law requires.</p>
      </Section>
      <Section number="18" title="Security">
        <p>Users must promptly report suspected vulnerabilities, compromised accounts, or security incidents through the official project contact. Do not publicly disclose or exploit a vulnerability in a way that risks users, data, or service availability.</p>
      </Section>
      <Section number="19" title="Disclaimer">
        <p>SharpRunner is an educational and capstone platform and may occasionally contain technical, compiler, scoring, availability, or educational errors. Content is provided for learning support and is not a substitute for official institutional policy or independent professional advice. Teachers and institutions retain responsibility for official academic decisions and policies.</p>
      </Section>
      <Section number="20" title="Limitation of Responsibility">
        <p>To the extent permitted by applicable law, SharpRunner&apos;s creators and operators are responsible only for losses directly attributable to obligations that cannot lawfully be excluded. Users should keep appropriate copies of important work and verify results used for official decisions. Nothing in these Terms removes consumer, privacy, student, or other legal rights that cannot validly be waived.</p>
      </Section>
      <Section number="21" title="Changes to Terms">
        <p>These Terms may change as SharpRunner&apos;s features, practices, or obligations evolve. Material changes may require acceptance of a new version before authenticated use can continue. Continued access after valid acceptance is governed by the accepted current version.</p>
      </Section>
      <Section number="22" title="Governing Law">
        <p>These Terms are governed by the laws of the Republic of the Philippines, without limiting rights or remedies that apply under mandatory law.</p>
      </Section>
      <Section number="23" title="Contact">
        <p>Questions about these Terms should be sent to the official SharpRunner contact once designated:</p>
        <address><strong>Project Contact:</strong> [Insert official email address]<br /><strong>Institution:</strong> [Insert operating institution]</address>
      </Section>
    </PageShell>
  );
}
