import { Navigate, Outlet, useLocation } from "react-router-dom";

import { hasApiKey } from "../lib/storage";

/**
 * Wraps protected routes. All routes except /setup should use this layout.
 * Redirects to /setup when no OpenAI API key is stored.
 */
export function ApiKeyGate() {
  const location = useLocation();

  if (!hasApiKey()) {
    return <Navigate to="/setup" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
