import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { ApiError, isTransient } from "./lib/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { AuthProvider } from "./lib/auth";
import { applyTheme, loadTheme } from "./lib/utils";
import "./styles.css";

applyTheme(loadTheme());

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry only what can succeed on a second try (429, 5xx, network),
      // waiting as long as the server asked when it said.
      retry: (count, err) => count < 2 && isTransient(err),
      retryDelay: (attempt, err) =>
        err instanceof ApiError && err.retryAfter ? Math.min(err.retryAfter * 1000, 10_000) : Math.min(500 * 2 ** attempt, 4_000),
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
