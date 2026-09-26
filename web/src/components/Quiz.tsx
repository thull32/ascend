import { useMemo, useState } from "react";
import { Link } from "react-router";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useInvalidateProgress, useCoachStatus } from "../lib/queries";
import type { GeneratedQuiz, GradeResult, QuizPublicQuestion } from "../lib/types";
import { cn } from "../lib/utils";
import { Button, ErrorBox } from "./ui";
import { CheckCircle2, Sparkles, XCircle } from "lucide-react";

interface Props {
  source: string;
  lessonSlug?: string;
}

/** Authored quiz: answers are graded server-side. */
export default function QuizBlock({ source, lessonSlug }: Props) {
  const questions = useMemo<QuizPublicQuestion[]>(() => {
    try {
      return JSON.parse(source) as QuizPublicQuestion[];
    } catch {
      return [];
    }
  }, [source]);
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const [result, setResult] = useState<GradeResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState<GeneratedQuiz | null>(null);
  const { user } = useAuth();
  const invalidate = useInvalidateProgress();
  const coach = useCoachStatus();

  if (questions.length === 0) return null;

  const submit = async () => {
    if (!lessonSlug) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<GradeResult>(`/quizzes/${lessonSlug}/grade`, { answers });
      setResult(r);
      invalidate();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    if (!lessonSlug) return;
    setBusy(true);
    setError(null);
    try {
      setGenerated(await api.post<GeneratedQuiz>(`/coach/quiz/${lessonSlug}`, { count: 5 }));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const complete = answers.every((a) => a !== null);

  return (
    <section className="not-prose my-8 rounded-xl border border-line bg-elev p-4 sm:p-5" data-testid="quiz">
      <ol className="space-y-5">
        {questions.map((q, qi) => {
          const graded = result?.questions[qi];
          return (
            <li key={qi}>
              <p className="mb-2 font-medium">
                {qi + 1}. {q.q}
              </p>
              <div className="space-y-1.5">
                {q.options.map((opt, oi) => {
                  const chosen = answers[qi] === oi;
                  let tone = "";
                  if (graded) {
                    if (oi === graded.answer) tone = "border-success bg-success/10";
                    else if (chosen && !graded.correct) tone = "border-danger bg-danger/10";
                  } else if (chosen) tone = "border-accent bg-accent/10";
                  return (
                    <label key={oi} className={cn("flex cursor-pointer items-start gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-elev-2", tone)}>
                      <input
                        type="radio"
                        name={`q-${lessonSlug}-${qi}`}
                        className="mt-1"
                        checked={chosen}
                        disabled={!!result}
                        onChange={() => setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)))}
                      />
                      <span>{opt}</span>
                    </label>
                  );
                })}
              </div>
              {graded && (
                <p className={cn("mt-2 flex items-start gap-2 text-sm", graded.correct ? "text-success" : "text-danger")}>
                  {graded.correct ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                  <span className="text-fg">{graded.explanation}</span>
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {error ? <ErrorBox error={error} className="mt-4" /> : null}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {!user ? (
          <p className="text-sm text-muted">
            <Link to="/login" className="text-accent">
              Sign in
            </Link>{" "}
            to grade your answers and track progress.
          </p>
        ) : result ? (
          <>
            <p className={cn("text-sm font-medium", result.passed ? "text-success" : "text-warn")}>
              {result.score} / {result.total} correct {result.passed ? "— passed" : "— review the explanations and try again"}
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                setResult(null);
                setAnswers(questions.map(() => null));
              }}
            >
              Retry
            </Button>
          </>
        ) : (
          <Button onClick={submit} disabled={!complete || busy}>
            Check answers
          </Button>
        )}
        {user && coach.data?.enabled && !generated && (
          <Button variant="ghost" onClick={generate} disabled={busy} title="Generate a fresh quiz with the AI coach">
            <Sparkles className="h-4 w-4" /> Fresh questions
          </Button>
        )}
      </div>
      {generated && lessonSlug && <GeneratedQuizView quiz={generated} lessonSlug={lessonSlug} onClose={() => setGenerated(null)} />}
    </section>
  );
}

/** AI-generated quiz: answers are known client-side; the attempt is recorded. */
function GeneratedQuizView({ quiz, lessonSlug, onClose }: { quiz: GeneratedQuiz; lessonSlug: string; onClose: () => void }) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => quiz.questions.map(() => null));
  const [checked, setChecked] = useState(false);
  const invalidate = useInvalidateProgress();
  const score = quiz.questions.filter((q, i) => answers[i] === q.answer).length;

  const check = async () => {
    setChecked(true);
    try {
      await api.post(`/quizzes/${lessonSlug}/generated`, { score, total: quiz.questions.length, answers });
      invalidate();
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
    }
  };

  return (
    <div className="mt-6 rounded-lg border border-accent/40 bg-accent/5 p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-accent" /> Fresh questions from the coach
      </p>
      <ol className="space-y-4">
        {quiz.questions.map((q, qi) => (
          <li key={qi}>
            <p className="mb-2 text-sm font-medium">
              {qi + 1}. {q.q}
            </p>
            <div className="space-y-1.5">
              {q.options.map((opt, oi) => {
                const chosen = answers[qi] === oi;
                let tone = chosen ? "border-accent bg-accent/10" : "";
                if (checked) {
                  if (oi === q.answer) tone = "border-success bg-success/10";
                  else if (chosen) tone = "border-danger bg-danger/10";
                }
                return (
                  <label key={oi} className={cn("flex cursor-pointer items-start gap-2 rounded-lg border border-line px-3 py-2 text-sm", tone)}>
                    <input type="radio" className="mt-1" checked={chosen} disabled={checked} onChange={() => setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)))} />
                    <span>{opt}</span>
                  </label>
                );
              })}
            </div>
            {checked && <p className="mt-2 text-sm text-muted">{q.explanation}</p>}
          </li>
        ))}
      </ol>
      <div className="mt-4 flex items-center gap-3">
        {checked ? (
          <p className="text-sm font-medium">
            {score} / {quiz.questions.length}
          </p>
        ) : (
          <Button onClick={check} disabled={answers.some((a) => a === null)}>
            Check
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
