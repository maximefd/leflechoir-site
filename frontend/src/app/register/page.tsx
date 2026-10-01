import { type Metadata } from "next";
import { RegisterForm } from "@/components/auth/register-form";
import { privatePage } from "@/lib/seo";

export const metadata: Metadata = privatePage({
  title: "Créer un compte",
  description: "Crée un compte pour conserver tes dictionnaires thématiques et tes grilles.",
});

export default function RegisterPage() {
  return <RegisterForm />;
}
