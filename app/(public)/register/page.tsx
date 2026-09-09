import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Create account | Tablo",
  description: "Create a Tablo account with your email and password.",
};

export default function RegisterPage() {
  return <AuthForm mode="signup" />;
}
