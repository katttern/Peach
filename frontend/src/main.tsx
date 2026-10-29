import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { User } from "oidc-client-ts";
import { AuthProvider } from "react-oidc-context";

import App from "./App";
import "./index.css";

const oidcConfig = {
  authority: import.meta.env.VITE_COGNITO_AUTHORITY as string,
  client_id: import.meta.env.VITE_COGNITO_CLIENT_ID as string,
  redirect_uri: `${window.location.origin}/`,
  scope: "openid email profile",
  // Return to the page that started sign-in (state is a same-origin path).
  onSigninCallback: (user: User | undefined) => {
    const state = user?.state;
    const target =
      typeof state === "string" && /^\/(?!\/)/.test(state) ? state : "/";
    if (target === "/") {
      window.history.replaceState({}, document.title, "/");
    } else {
      window.location.replace(target);
    }
  },
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider {...oidcConfig}>
      <App />
    </AuthProvider>
  </StrictMode>,
);
