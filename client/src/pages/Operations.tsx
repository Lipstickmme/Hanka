import { Redirect } from "wouter";

/** Historic operations URL. Manual payouts were retired with Arc-only settlement. */
export default function Operations() {
  return <Redirect to="/arc/dashboard" replace />;
}
