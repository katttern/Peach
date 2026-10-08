import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "react-oidc-context";

import App from "./App";
import "./index.css";

const oidcConfig = {
  authority: import.meta.env.VITE_COGNITO_AUTHORITY as string,
  client_id: import.meta.env.VITE_COGNITO_CLIENT_ID as string,
  redirect_uri: `${window.location.origin}/`,
  scope: "openid email profile",
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, "/");
  },
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider {...oidcConfig}>
      <App />
    </AuthProvider>
  </StrictMode>,
);
