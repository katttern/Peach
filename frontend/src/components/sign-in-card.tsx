import { Button } from "./ui/button";

export function SignInCard({
  text,
  onSignIn,
}: {
  text: string;
  onSignIn: () => void;
}) {
  return (
    <div className="grid gap-4 rounded-[32px] border-[1.5px] border-line bg-surface p-7 shadow-form">
      <p className="m-0">{text}</p>
      <Button type="button" className="justify-self-start" onClick={onSignIn}>
        Sign in
      </Button>
    </div>
  );
}
