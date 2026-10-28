import { useLocation, Link } from "react-router-dom";
import { Pulse } from "../components/Icons";

export default function ComingSoon() {
  const { state } = useLocation();
  return (
    <div className="empty">
      <span className="empty-icon"><Pulse /></span>
      <h2>{state?.name || "This module"}</h2>
      <p className="muted">This screen is being converted from the original jQuery page and arrives in Phase {state?.phase ?? "—"}.</p>
      <Link className="btn primary" to="/app">Back to dashboard</Link>
    </div>
  );
}
