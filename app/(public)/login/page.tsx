import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Sign in | Tablo",
  description: "Sign in to Tablo with your email and password.",
};

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
