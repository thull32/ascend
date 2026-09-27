// Renders lesson/problem Markdown. Special fenced blocks (viz/exercise/quiz/
// mermaid) are dispatched to interactive components; everything else goes
// through remark/rehype. Heavy children are lazy so a plain-text lesson never
// pays for the editor or Mermaid.
import { lazy, Suspense, useMemo, type ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { Link } from "react-router";
import { Spinner } from "./ui";
import { escapeCurrency } from "../lib/markdown";

const Mermaid = lazy(() => import("./Mermaid"));
const VizBlock = lazy(() => import("../viz/VizBlock"));
const ExerciseBlock = lazy(() => import("./Exercise"));
const QuizBlock = lazy(() => import("./Quiz"));

interface Props {
  source: string;
  /** Lesson slug, needed by exercise/quiz blocks to persist results. */
  lessonSlug?: string;
  className?: string;
}

type CodeProps = ComponentProps<"code"> & { node?: unknown };

export function Markdown({ source, lessonSlug, className }: Props) {
  const components = useMemo(
    () => ({
      a({ href, children, ...rest }: ComponentProps<"a">) {
        if (href && href.startsWith("/")) {
          return (
            <Link to={href} {...(rest as object)}>
              {children}
            </Link>
          );
        }
        return (
          <a href={href} target={href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer" {...rest}>
            {children}
          </a>
        );
      },
      pre({ children, ...rest }: ComponentProps<"pre">) {
        // Intercept special fences: react-markdown gives <pre><code class="language-x">.
        const child = Array.isArray(children) ? children[0] : children;
        if (child && typeof child === "object" && "props" in child) {
          const props = (child as { props: CodeProps }).props;
          const lang = /language-([\w-]+)/.exec(String(props.className ?? ""))?.[1];
          const raw = String(props.children ?? "").replace(/\n$/, "");
          if (lang === "mermaid") return <Suspense fallback={<Spinner />}><Mermaid source={raw} /></Suspense>;
          if (lang === "viz") return <Suspense fallback={<Spinner />}><VizBlock source={raw} /></Suspense>;
          if (lang === "exercise") return <Suspense fallback={<Spinner />}><ExerciseBlock source={raw} lessonSlug={lessonSlug} /></Suspense>;
          if (lang === "quiz") return <Suspense fallback={<Spinner />}><QuizBlock source={raw} lessonSlug={lessonSlug} /></Suspense>;
        }
        return <pre {...rest}>{children}</pre>;
      },
    }),
    [lessonSlug],
  );

  const prepared = useMemo(() => escapeCurrency(source), [source]);
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeSlug, rehypeKatex, [rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={components}
      >
        {prepared}
      </ReactMarkdown>
    </div>
  );
}
