import { type Metadata } from "next";
import { AccountClientLayout } from "@/components/account/account-client-layout";
import { privatePage } from "@/lib/seo";

export const metadata: Metadata = privatePage({
  title: "Mon compte",
  description: "Ton adresse e-mail, ce que ton compte contient, et sa suppression.",
});

export default function AccountPage() {
  return <AccountClientLayout />;
}
