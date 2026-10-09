import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { Layout } from "./components/Layout";
import { useAuth } from "./lib/auth";
import { Spinner } from "./components/ui";
import { CoachDockProvider } from "./components/CoachDock";

// Route-level code splitting keeps the initial bundle small; the lesson page
// (markdown + mermaid + editor + viz) is by far the heaviest.
const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const RoadmapPage = lazy(() => import("./pages/Roadmap"));
const Learn = lazy(() => import("./pages/Learn"));
const TrackPage = lazy(() => import("./pages/Track"));
const ModulePage = lazy(() => import("./pages/Module"));
const LessonPage = lazy(() => import("./pages/Lesson"));
const Practice = lazy(() => import("./pages/Practice"));
const ProblemPage = lazy(() => import("./pages/Problem"));
const CoachPage = lazy(() => import("./pages/Coach"));
const Interviews = lazy(() => import("./pages/Interviews"));
const InterviewRoom = lazy(() => import("./pages/InterviewRoom"));
const Profile = lazy(() => import("./pages/Profile"));
const Playground = lazy(() => import("./pages/Playground"));
const VizGallery = lazy(() => import("./pages/VizGallery"));
const Listen = lazy(() => import("./pages/Listen"));
const NotFound = lazy(() => import("./pages/NotFound"));

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner className="mt-24" />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
}

export function App() {
  return (
    <CoachDockProvider>
    <Layout>
      <Suspense fallback={<Spinner className="mt-24" />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
          <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/roadmap" element={<RoadmapPage />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/learn/:track" element={<TrackPage />} />
          <Route path="/learn/:track/:module" element={<ModulePage />} />
          <Route path="/learn/:track/:module/:lesson" element={<LessonPage />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/practice/:slug" element={<ProblemPage />} />
          {/* One route with an optional segment: creating a conversation navigates
              /coach -> /coach/:id without remounting the page mid-stream. */}
          <Route path="/coach/:id?" element={<RequireAuth><CoachPage /></RequireAuth>} />
          <Route path="/interviews" element={<RequireAuth><Interviews /></RequireAuth>} />
          <Route path="/listen" element={<RequireAuth><Listen /></RequireAuth>} />
          <Route path="/interviews/:id" element={<RequireAuth><InterviewRoom /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="/playground" element={<Playground />} />
          <Route path="/viz" element={<VizGallery />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Layout>
    </CoachDockProvider>
  );
}
