import { useAuth } from "react-oidc-context";

import { LoginPage } from "./pages/login-page";
import { MeetingPage } from "./pages/meeting-page";
import { MeetingsPage } from "./pages/meetings-page";

const MEETING_PATH = /^\/meetings\/([0-9a-f-]{36})$/i;

export default function App() {
  // Remount pages when the user changes (sign-in, sign-out, switch) so no
  // meetings or agenda from the previous session stay in component state.
  const userKey = useAuth().user?.profile.sub ?? "anonymous";
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path === "/login") {
    return <LoginPage />;
  }
  const meetingId = MEETING_PATH.exec(path)?.[1];
  return meetingId ? (
    <MeetingPage key={userKey} meetingId={meetingId} />
  ) : (
    <MeetingsPage key={userKey} />
  );
}
