"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { nextPath, withNext } from "@/lib/next-path";
import { useSharedEmail } from "@/hooks/use-shared-email";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthChoice, providerMessage } from "@/components/auth/fournisseurs";

export function LoginForm() {
  const { email, setEmail, forgetEmail } = useSharedEmail();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  // Le lien vers l'autre formulaire garde la destination : l'adresse n'est lisible qu'une fois monté
  const [otherHref, setOtherHref] = useState("/register");
  const [next, setNext] = useState("/");
  useEffect(() => {
    const target = nextPath("");
    if (target) setOtherHref(withNext("/register", target));
    setNext(target || "/");
    // Retour d'une connexion Google ou Microsoft qui n'a pas abouti (ADR 0034) : l'API dit pourquoi
    const reason = new URLSearchParams(window.location.search).get("erreur");
    if (reason) setError(providerMessage(reason));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      forgetEmail();
      // Venu d'une page qui attend la connexion (une grille à conserver) : on y retourne
      router.push(nextPath());
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Une erreur inattendue est survenue.");
      }
      // La redirection démonte la page : on ne réactive le bouton qu'en cas d'échec
      setSubmitting(false);
    }
  };

  return (
    <main className="flex items-center justify-center py-16 md:py-24">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl" data-testid="login-title">Connexion</CardTitle>
          <CardDescription>
            Pour retrouver tes grilles et tes dictionnaires.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <AuthChoice next={next} error={error}>
            <form onSubmit={handleSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="nom@exemple.com"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Link href="/forgot-password" className="text-xs text-muted-foreground underline hover:text-foreground">
                    Mot de passe oublié ?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Connexion en cours…" : "Se connecter"}
              </Button>
            </form>
          </AuthChoice>
          <div className="text-center text-sm">
            Pas encore de compte ?{" "}
            <Link href={otherHref} className="underline">
              S&apos;inscrire
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

