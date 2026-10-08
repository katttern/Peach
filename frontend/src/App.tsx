import { AuthBar } from "./components/auth-bar";
import { LoginPage } from "./pages/login-page";
import { MeetingsPage } from "./pages/meetings-page";

export default function App() {
  if (window.location.pathname.replace(/\/+$/, "") === "/login") {
    return <LoginPage />;
  }
  return (
    <>
      <AuthBar />
      <MeetingsPage />
    </>
  );
}
