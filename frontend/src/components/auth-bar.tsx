import { useEffect } from "react";
import { useAuth } from "react-oidc-context";

const CALLBACK_PARAMS = ["code", "state", "error", "error_description"];

export function AuthBar() {
  const auth = useAuth();

  // A failed callback (?error=...&state=...) keeps its params in the URL, so a
  // reload would replay it and fail again. Drop them once the error is shown;
  // a reload or the next successful sign-in then clears the message.
  useEffect(() => {
    if (!auth.error) return;
    const url = new URL(window.location.href);
    if (!CALLBACK_PARAMS.some((name) => url.searchParams.has(name))) return;
    CALLBACK_PARAMS.forEach((name) => url.searchParams.delete(name));
    window.history.replaceState({}, document.title, url.pathname + url.search);
  }, [auth.error]);

  async function signOut() {
    await auth.removeUser();
    const domain = import.meta.env.VITE_COGNITO_DOMAIN as string;
    const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string;
    const logoutUri = encodeURIComponent(`${window.location.origin}/`);
    window.location.href = `${domain}/logout?client_id=${clientId}&logout_uri=${logoutUri}`;
  }

  const pill =
    "inline-flex h-8 items-center rounded-full bg-tint px-3.5 font-semibold text-tint-text";
  return (
    <div className="inline-flex min-h-12 flex-wrap items-center gap-3.5 rounded-full border-[1.5px] border-line bg-surface py-[7px] pl-[18px] pr-[7px] text-sm">
      {auth.isLoading ? (
        <span className="text-muted">…</span>
      ) : auth.isAuthenticated ? (
        <>
          <span className="break-all">{auth.user?.profile.email}</span>
          <button type="button" className={pill} onClick={() => void signOut()}>
            Sign out
          </button>
        </>
      ) : (
        <button
          type="button"
          className={pill}
          onClick={() => void auth.signinRedirect()}
        >
          Sign in
        </button>
      )}
      {auth.error ? (
        <span className="text-danger">{auth.error.message}</span>
      ) : null}
    </div>
  );
}
