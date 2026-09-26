import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { AuthProvider } from "./lib/auth";
import { applyTheme, loadTheme } from "./lib/utils";
import "./styles.css";

applyTheme(loadTheme());

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: (count, err) => count < 2 && !(err instanceof Error && "status" in err && (err as { status: number }).status < 500), refetchOnWindowFocus: false },
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
