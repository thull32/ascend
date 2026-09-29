import { Link } from "react-router";
import { PageTitle } from "../components/ui";
import { PRIVACY_UPDATED } from "./Privacy";

export default function Terms() {
  return (
    <article className="prose-ascend prose mx-auto max-w-3xl" data-testid="terms">
      <PageTitle title="Terms of use" subtitle={`Last updated ${PRIVACY_UPDATED}`} />
      <p>Ascend is free. By creating an account or using the site you agree to these terms.</p>

      <h2>Using Ascend</h2>
      <ul>
        <li>One account per person. Keep your password to yourself; you are responsible for what happens under your account.</li>
        <li>
          Do not attack or overload the service: no attempts to break out of the code sandbox, get around rate limits or the daily AI
          allowance, scrape at scale, or disrupt other learners.
        </li>
        <li>Comments are visible to other learners. Keep them on topic and civil; do not post anything you do not have the right to share.</li>
        <li>Accounts that break these rules may be limited or removed.</li>
      </ul>

      <h2>Your content</h2>
      <p>
        You keep the rights to the code, comments and messages you write. You allow Ascend to store and process them to provide the service
        (grading code, showing comments, answering you with AI features), as described in the <Link to="/privacy">privacy page</Link>.
      </p>

      <h2>Our content</h2>
      <p>
        The lessons, problems and code are published in the open{" "}
        <a href="https://github.com/thull32/ascend" target="_blank" rel="noreferrer">
          repository
        </a>{" "}
        under its licence.
      </p>

      <h2>No guarantees</h2>
      <p>
        Ascend is provided as it is, without warranty. Lessons and AI answers can contain mistakes: the AI coach and interviewer are language
        models and can be confidently wrong, so check what matters. The service may change, pause or end, and we are not liable for losses from
        using it, to the extent the law allows.
      </p>

      <h2>Changes</h2>
      <p>If these terms change, the date above changes with them. Continuing to use Ascend after a change means you accept the new terms.</p>
    </article>
  );
}
