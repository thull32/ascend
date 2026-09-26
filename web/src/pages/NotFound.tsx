import { Link } from "react-router";

export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="mt-2 text-muted">That page does not exist (or the content moved).</p>
      <Link to="/learn" className="mt-4 inline-block text-accent">
        Back to the curriculum
      </Link>
    </div>
  );
}
