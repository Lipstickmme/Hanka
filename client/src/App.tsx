import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ArcWalletProvider } from "./contexts/ArcWalletContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Market from "./pages/Market";
import Operations from "./pages/Operations";
import { lazy, Suspense } from "react";

const MarketFallback = () => <div className="hanka-app min-h-screen" />;
const ArcMarket = lazy(() => import("./pages/ArcMarket"));
const ArcDashboard = lazy(() => import("./pages/ArcDashboard"));

const ArcMarketRoute = () => (
  <Suspense fallback={<MarketFallback />}>
    <ArcMarket />
  </Suspense>
);

const ArcDashboardRoute = () => (
  <Suspense fallback={<MarketFallback />}>
    <ArcDashboard />
  </Suspense>
);

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/market" component={Market} />
      <Route path="/operations" component={Operations} />
      <Route path="/arc" component={ArcMarketRoute} />
      <Route path="/arc/dashboard" component={ArcDashboardRoute} />
      <Route path="/404" component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ArcWalletProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </ArcWalletProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
