// Mirrors the JSON shapes produced by crates/api. Keep in sync with the Rust
// `Serialize` structs; the API is the source of truth.

export type Difficulty = "intro" | "easy" | "medium" | "hard" | "expert";

export interface User {
  id: string;
  email: string;
  display_name: string;
  role: string;
  target_company: string | null;
  target_level: string | null;
  weekly_hours: number;
  preferred_language: "python" | "javascript" | "typescript";
  onboarded: boolean;
  created_at: string;
}

export interface ModuleOverview {
  slug: string;
  title: string;
  description: string;
  lesson_count: number;
  estimated_hours: number;
  prerequisites: string[];
}

export interface TrackOverview {
  slug: string;
  title: string;
  description: string;
  icon: string;
  phase: number;
  lesson_count: number;
  estimated_hours: number;
  modules: ModuleOverview[];
}

export interface Pattern {
  slug: string;
  title: string;
  lesson: string | null;
  problem_count: number;
}

export interface Curriculum {
  version: string;
  tracks: TrackOverview[];
  patterns: Pattern[];
  lesson_count: number;
  problem_count: number;
}

export interface LessonSummary {
  slug: string;
  title: string;
  description: string;
  minutes: number;
  difficulty: Difficulty;
  tags: string[];
  has_exercise: boolean;
  has_quiz: boolean;
  has_viz: boolean;
  order: number;
}

export interface Module {
  slug: string;
  track_slug: string;
  track_title?: string;
  title: string;
  description: string;
  order: number;
  prerequisites: string[];
  intro: string;
  lessons: LessonSummary[];
  estimated_hours: number;
}

export interface Track extends Omit<TrackOverview, "modules"> {
  intro: string;
  modules: Module[];
}

export interface TestCase {
  args: unknown[];
  expected: unknown;
  hidden?: boolean;
  any_order?: boolean;
  label?: string | null;
}

export interface ExerciseSpec {
  id: string;
  title: string;
  prompt: string;
  languages: string[];
  entry: string;
  starter: Record<string, string>;
  tests: TestCase[];
  hints: string[];
  time_limit_ms: number;
}

export interface Heading {
  level: number;
  text: string;
  id: string;
}

export interface LessonRef {
  slug: string;
  title: string;
}

export interface Lesson {
  summary: LessonSummary;
  track_slug: string;
  track_title: string;
  module_slug: string;
  module_title: string;
  body: string;
  toc: Heading[];
  exercises: ExerciseSpec[];
  quiz_question_count: number;
  problems: ProblemSummary[];
  prev: LessonRef | null;
  next: LessonRef | null;
  siblings: LessonSummary[];
}

export interface Signature {
  name: string;
  starter: string;
}

export interface ProblemSummary {
  slug: string;
  title: string;
  difficulty: Difficulty;
  patterns: string[];
  lists: string[];
  order: number;
  lesson: string | null;
}

export interface Problem extends ProblemSummary {
  companies: string[];
  statement: string;
  hints: string[];
  signatures: Record<string, Signature>;
  tests: TestCase[];
  time_limit_ms: number;
  visible_tests: number;
}

export interface SearchHit {
  kind: "lesson" | "problem";
  slug: string;
  title: string;
  description: string;
  score: number;
}

export type ModulePreference = "normal" | "confident" | "priority";

export interface ProgressSummary {
  lessons_completed: number;
  lessons_total: number;
  lessons_in_progress: number;
  problems_solved: number;
  problems_total: number;
  quizzes_passed: number;
  streak_days: number;
  xp: number;
  completed_slugs: string[];
  in_progress_slugs: string[];
  solved_problem_slugs: string[];
  module_preferences: Record<string, ModulePreference>;
  last_lesson: string | null;
  per_track: { track_slug: string; completed: number; total: number }[];
}

export interface RoadmapModule {
  slug: string;
  title: string;
  track_slug: string;
  track_title: string;
  description: string;
  estimated_hours: number;
  lesson_count: number;
  completed: number;
  preference: ModulePreference;
  locked_by: string[];
  first_incomplete_lesson: string | null;
}

export interface Roadmap {
  phases: { phase: number; title: string; modules: RoadmapModule[] }[];
  remaining_hours: number;
  weeks_at_current_pace: number;
  next_lesson: { slug: string; title: string; module_title: string } | null;
}

export interface QuizPublicQuestion {
  q: string;
  options: string[];
}

export interface GradeResult {
  score: number;
  total: number;
  passed: boolean;
  questions: { correct: boolean; chosen: number; answer: number; explanation: string }[];
}

export interface GeneratedQuiz {
  questions: { q: string; options: string[]; answer: number; explanation: string }[];
}

export interface Submission {
  id: string;
  target_kind: string;
  target_slug: string;
  language: string;
  code: string;
  passed: boolean;
  passed_count: number;
  total_count: number;
  runtime_ms: number | null;
  results: unknown;
  created_at: string;
}

export interface CommentView {
  id: string;
  parent_id: string | null;
  body: string;
  author_name: string;
  /** Null when the author has deleted their account. */
  author_id: string | null;
  deleted: boolean;
  created_at: string;
  replies: CommentView[];
}

export interface CoachStatus {
  enabled: boolean;
  model: string;
  budget: {
    requests_used: number;
    requests_limit: number;
    input_tokens_used: number;
    input_tokens_limit: number;
    output_tokens_used: number;
    output_tokens_limit: number;
    cache_read_tokens: number;
  } | null;
}

export interface Conversation {
  id: string;
  title: string;
  context: CoachContext;
  created_at: string;
  updated_at: string;
}

export interface CoachContext {
  kind?: "lesson" | "problem" | "roadmap" | "general";
  slug?: string;
  code?: string;
  language?: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export type InterviewKind = "coding" | "system_design" | "behavioral";
export type AssistantMode = "solo" | "assisted";

export interface TranscriptEntry {
  role: "interviewer" | "candidate" | "assistant" | "candidate_to_assistant" | "system";
  content: string;
  at: string;
}

export interface Evaluation {
  overall_score: number;
  verdict: string;
  summary: string;
  strengths: string[];
  improvements: string[];
  dimensions: { name: string; score: number; notes: string }[];
  next_steps: string[];
}

export interface Interview {
  id: string;
  kind: InterviewKind;
  assistant_mode: AssistantMode;
  problem_slug: string | null;
  prompt: string;
  duration_minutes: number;
  status: "active" | "grading" | "completed" | "abandoned";
  transcript: TranscriptEntry[];
  final_code: string | null;
  language: string | null;
  evaluation: Evaluation | { summary: string } | null;
  score: number | null;
  started_at: string;
  ended_at: string | null;
  /** Last change; while grading, when grading began. */
  updated_at: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
}
