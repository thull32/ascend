import { ArrowRight, BookOpen, Code2, Eye, MessageSquare, Mic, Sparkles } from "lucide-react";
import { Link, Navigate } from "react-router";
import { useAuth } from "../lib/auth";
import { useCurriculum } from "../lib/queries";
import { VizFromSpec } from "../viz/VizBlock";

export default function Landing() {
  const { user } = useAuth();
  const curriculum = useCurriculum();
  if (user) return <Navigate to="/dashboard" replace />;
  const lessons = curriculum.data?.lesson_count ?? 0;
  const problems = curriculum.data?.problem_count ?? 0;
  return (
    <div className="mx-auto max-w-5xl">
      <section className="py-10 text-center sm:py-16">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-muted">
          <Sparkles className="h-3.5 w-3.5 text-accent" /> Free, open source, no upsell
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
          From mid-level to <span className="text-accent">senior</span>.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted sm:text-lg">
          The complete, in-depth path for a working software engineer who wants a senior role at a top-tier company. Structured curriculum, live step-by-step visualisations, code in the browser, an AI coach, and mock interviews with and without an AI pair-programmer.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/register" className="inline-flex items-center gap-2 rounded-lg bg-accent-strong px-5 py-2.5 font-medium text-white hover:bg-accent">
            Start the roadmap <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/learn" className="inline-flex items-center gap-2 rounded-lg border border-line px-5 py-2.5 font-medium hover:bg-elev-2">
            Browse the curriculum
          </Link>
        </div>
        {lessons > 0 && (
          <p className="mt-6 text-sm text-muted" data-testid="landing-stats">
            {lessons} lessons · {problems} practice problems · {curriculum.data?.tracks.length} tracks
          </p>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { icon: BookOpen, title: "A real curriculum", body: "Complexity, data structures, algorithms, systems, networking, databases, system design, big data, AI. Every lesson goes one level deeper than the usual explainer." },
          { icon: Eye, title: "Watch it run", body: "Every algorithm, protocol and distributed pattern is a steppable animation with a sentence per step. Scrub backwards. Change the input." },
          { icon: Code2, title: "Code in the browser", body: "Implement each structure in Python or JavaScript against hidden tests. Then apply the pattern on 150 curated problems." },
          { icon: MessageSquare, title: "An AI coach that hints", body: "Grounded in the lesson you are reading and the code you are writing. It asks the next question; it does not hand you the answer." },
          { icon: Mic, title: "Mock interviews", body: "Coding, system design and behavioural rounds with a rigorous grader. Solo mode, or AI-assisted mode that grades how you direct an assistant." },
          { icon: Sparkles, title: "The code is the lesson", body: "Rust, Axum, SeaORM, React. The repository is written to be read as a production reference, and the curriculum ends by walking through it." },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border border-line bg-elev p-5">
            <f.icon className="mb-3 h-5 w-5 text-accent" />
            <h2 className="font-medium">{f.title}</h2>
            <p className="mt-1 text-sm text-muted">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-12">
        <h2 className="mb-3 text-xl font-semibold">See a step, not a summary</h2>
        <VizFromSpec spec={{ type: "graph", algorithm: "dijkstra", title: "Dijkstra's shortest paths, step by step" }} />
      </section>
    </div>
  );
}
