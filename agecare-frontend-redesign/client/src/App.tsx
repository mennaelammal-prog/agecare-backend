/**
 * AgeCare — Heirloom Journal design system.
 * A quiet, accessible care journal with warm editorial hierarchy and a reflective wisdom layer.
 */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          {/* Bottom-right, offset above the fixed SOS button -- "top-center"
              (the shadcn default) sat directly over page headings like
              "Care history". */}
          <Toaster position="bottom-right" offset={{ bottom: 96, right: 26 }} mobileOffset={{ bottom: 96, right: 26 }} />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
