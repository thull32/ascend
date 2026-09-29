import { Link } from "react-router";
import { PageTitle } from "../components/ui";
import { useFeatures } from "../lib/queries";

// Plain-language description of what the software does with data. Every
// statement here is checked against the code: when the code changes (a new
// third party, a new table, a retention period), change this page with it.
// Retention periods are enforced by crates/core/src/services/retention.rs.
export const PRIVACY_UPDATED = "29 September 2026";

export default function Privacy() {
  const features = useFeatures();
  return (
    <article className="prose-ascend prose mx-auto max-w-3xl" data-testid="privacy">
      <PageTitle title="Privacy" subtitle={`Last updated ${PRIVACY_UPDATED}`} />
      <p>
        Ascend is a free learning platform. This page says what it stores, why, who else sees it, and for how long. The code that does all of
        this is public:{" "}
        <a href="https://github.com/thull32/ascend" target="_blank" rel="noreferrer">
          github.com/thull32/ascend
        </a>
        .
      </p>

      <h2>What we store and why</h2>
      <ul>
        <li>
          <strong>Your account:</strong> email address, display name, optional target company, level and weekly hours, preferred language and
          time zone. The password is stored only as an Argon2id hash; we never see it.
        </li>
        <li>
          <strong>Your learning:</strong> lessons you complete, quiz answers, code you submit for grading and the result, activity days (for
          your streak), comments you post, conversations with the AI coach, and mock interview transcripts and grades.
        </li>
        <li>
          <strong>Security records:</strong> sign-in sessions and recognised browsers (only as hashes of random tokens), single-use email
          links (as hashes), and short-lived rate-limit counters keyed by IP address, account or session.
        </li>
        <li>
          <strong>AI usage counters:</strong> how many AI requests and tokens you used each day, to enforce the free daily allowance.
        </li>
        <li>
          <strong>Server logs and metrics:</strong> request paths, status codes, timings and request IDs, used to run and debug the service.
          Metrics and traces are aggregate timings and counts; they do not contain your email, code or messages.
        </li>
      </ul>
      <p>There is no advertising, no analytics or tracking script, and no data is sold.</p>

      <h2>Who else processes it</h2>
      <ul>
        <li>
          <a href="https://railway.com/legal/privacy" target="_blank" rel="noreferrer">
            Railway
          </a>{" "}
          hosts the application and its database in the United States.
        </li>
        <li>
          <a href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noreferrer">
            Anthropic
          </a>{" "}
          receives what an AI feature needs to answer: your message, the lesson or problem, and the code in your editor for the coach; the
          transcript for mock interviews; your goals and progress for roadmap suggestions. Nothing is sent to Anthropic unless you use an AI
          feature.
        </li>
        <li>
          <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noreferrer">
            Resend
          </a>{" "}
          delivers password-reset and address-confirmation emails, so it receives your email address and the message.
        </li>
        <li>
          <a href="https://haveibeenpwned.com/Privacy" target="_blank" rel="noreferrer">
            Have I Been Pwned
          </a>{" "}
          is asked whether a new password has appeared in a data breach. Only the first five characters of the password's SHA-1 hash are sent,
          which cannot identify the password or you.
        </li>
        <li>
          <a href="https://www.jsdelivr.com/terms/privacy-policy-jsdelivr-net" target="_blank" rel="noreferrer">
            jsDelivr
          </a>{" "}
          serves the Python runtime your browser downloads the first time you run Python (and PyPI serves any package your code imports), so
          they see your IP address when that happens.
        </li>
      </ul>

      <h2>How long we keep it</h2>
      <ul>
        <li>Code submissions: 180 days, except that your latest attempt and your latest passing attempt at each exercise and problem are kept.</li>
        <li>AI coach conversations: deleted a year after their last message.</li>
        <li>Mock interviews: deleted a year after they took place.</li>
        <li>AI usage counters: 90 days. Activity days: 400 days (streaks look back that far).</li>
        <li>Sessions: signed out after 14 days unused, and after 30 days in any case. Recognised browsers: forgotten after a year unused.</li>
        <li>Email links: expire after one hour (password reset) or seven days (address confirmation), and are deleted when used or expired.</li>
        <li>Everything else, such as your profile, progress and quiz answers: until you delete your account.</li>
      </ul>

      <h2>Your choices</h2>
      <p>
        You can change your profile at any time on the <Link to="/profile">profile page</Link>, sign out every device there, and delete your
        account. Deleting it removes your progress, submissions, coach conversations, interviews and sessions immediately. Comments you posted
        stay so that replies keep their context, shown as written by a deleted user.
      </p>

      <h2>Cookies and browser storage</h2>
      <p>
        Two cookies, both required and neither used for tracking: <code>ascend_session</code> keeps you signed in, and <code>ascend_device</code>{" "}
        remembers that this browser has signed in before, so that someone guessing your password cannot lock you out. The browser also stores
        your colour theme and drafts of the code you write, locally, on your device.
      </p>

      <h2>Questions</h2>
      <p>
        {features.data?.contact ? (
          <>
            Email <a href={`mailto:${features.data.contact}`}>{features.data.contact}</a>, or open an issue on{" "}
          </>
        ) : (
          <>Open an issue on </>
        )}
        <a href="https://github.com/thull32/ascend/issues" target="_blank" rel="noreferrer">
          GitHub
        </a>
        . See also the <Link to="/terms">terms of use</Link>.
      </p>
    </article>
  );
}
