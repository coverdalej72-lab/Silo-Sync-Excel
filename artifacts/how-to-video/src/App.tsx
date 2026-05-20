import { Router, Route, Switch } from "wouter";
import Dashboard from "@/pages/Dashboard";
import Settings from "@/pages/Settings";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function App() {
  return (
    <Router base={base}>
      <Switch>
        <Route path="/settings" component={Settings} />
        <Route path="/" component={Dashboard} />
      </Switch>
    </Router>
  );
}
