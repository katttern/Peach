import { useEffect, useRef } from "react";
import { useAuth } from "react-oidc-context";

export function LoginPage() {
  const auth = useAuth();
  const started = useRef(false);

  useEffect(() => {
    if (auth.isLoading || started.current) return;
    started.current = true;
    if (auth.isAuthenticated) {
      window.location.replace("/");
    } else {
      void auth.signinRedirect();
    }
  }, [auth]);

  return <p className="p-6 text-gray-600">Redirecting to sign-in…</p>;
}
