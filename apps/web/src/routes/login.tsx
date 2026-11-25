import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AccountShell } from "@/components/header";
import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

export const Route = createFileRoute("/login")({
  component: RouteComponent,
});

function RouteComponent() {
  const [showSignIn, setShowSignIn] = useState(false);

  return <AccountShell>
    {showSignIn ? <SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
      : <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />}
  </AccountShell>;
}
