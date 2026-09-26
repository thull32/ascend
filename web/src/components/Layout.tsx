import { BookOpen, Code2, LogOut, Map, MessageSquare, Mic, Moon, Search, Sun, User as UserIcon, Menu, X, LayoutDashboard, Play } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { applyTheme, cn, loadTheme } from "../lib/utils";
import { SearchDialog } from "./SearchDialog";

const nav = [
  { to: "/roadmap", label: "Roadmap", icon: Map },
  { to: "/learn", label: "Learn", icon: BookOpen },
  { to: "/practice", label: "Practice", icon: Code2 },
  { to: "/coach", label: "Coach", icon: MessageSquare },
  { to: "/interviews", label: "Interviews", icon: Mic },
  { to: "/playground", label: "Playground", icon: Play },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState(loadTheme);
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  };

  const immersive = /^\/interviews\/[^/]+$/.test(location.pathname);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <button className="rounded-md p-1.5 hover:bg-elev-2 lg:hidden" onClick={() => setOpen((v) => !v)} aria-label="Toggle navigation">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link to={user ? "/dashboard" : "/"} className="flex items-center gap-2 font-semibold tracking-tight">
            <img src="/favicon.svg" alt="" className="h-6 w-6" />
            Ascend
          </Link>
          <nav className="ml-4 hidden items-center gap-1 lg:flex">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) => cn("rounded-md px-3 py-1.5 text-sm text-muted hover:bg-elev-2 hover:text-fg", isActive && "bg-elev-2 text-fg")}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setSearchOpen(true)} className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-sm text-muted hover:bg-elev-2" aria-label="Search">
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden rounded bg-elev-2 px-1 text-[10px] sm:inline">⌘K</kbd>
            </button>
            <button onClick={toggleTheme} className="rounded-md p-2 text-muted hover:bg-elev-2 hover:text-fg" aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {user ? (
              <>
                <Link to="/dashboard" className="hidden rounded-md p-2 text-muted hover:bg-elev-2 hover:text-fg sm:block" aria-label="Dashboard">
                  <LayoutDashboard className="h-4 w-4" />
                </Link>
                <Link to="/profile" className="rounded-md p-2 text-muted hover:bg-elev-2 hover:text-fg" aria-label="Profile">
                  <UserIcon className="h-4 w-4" />
                </Link>
                <button
                  onClick={async () => {
                    await logout();
                    navigate("/");
                  }}
                  className="rounded-md p-2 text-muted hover:bg-elev-2 hover:text-fg"
                  aria-label="Log out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            ) : (
              <Link to="/login" className="rounded-md bg-accent-strong px-3 py-1.5 text-sm font-medium text-white hover:bg-accent">
                Sign in
              </Link>
            )}
          </div>
        </div>
        {open && (
          <nav className="border-t border-line px-2 py-2 lg:hidden">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => cn("flex items-center gap-3 rounded-md px-3 py-2.5 text-sm", isActive ? "bg-elev-2 text-fg" : "text-muted")}>
                <n.icon className="h-4 w-4" />
                {n.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main className={cn("mx-auto w-full max-w-7xl flex-1 px-4 py-6", immersive && "max-w-none px-0 py-0")}>{children}</main>
      {!immersive && (
        <footer className="border-t border-line py-6 text-center text-xs text-muted">
          Ascend is free and open source.{" "}
          <a className="hover:text-fg" href="https://github.com/thull32/ascend" target="_blank" rel="noreferrer">
            Read the code
          </a>{" "}
          — it is part of the curriculum.
        </footer>
      )}
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
