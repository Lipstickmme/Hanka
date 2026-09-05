import { Redirect } from "wouter";

/** Historic operations URL, now part of the wallet dashboard. */
export default function Operations() {
  return <Redirect to="/arc/dashboard" replace />;
}
