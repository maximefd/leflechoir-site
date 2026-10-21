import Link from "next/link";
import { cadre, lienOcre, texteDoux } from "@/components/mots/style";
import { ADRESSE_CONTACT, ADRESSE_CREER, ADRESSE_JOUER } from "@/content/mots/liens";

/**
 * Sous les mots, en second temps : la personne est venue chercher son mot, c'est très bien. Si la grille lui résiste,
 * une pause avec la grille du jour ; si l'envie lui prend, la fabrication de la sienne, guidée. Et, tout en bas, la porte
 * pour un mot qui manque. À RELIRE PAR L'AUTEUR : textes rédigés par Claude (8 octobre 2026), formules de l'auteur.
 */
export function InvitationApresRecherche() {
  return (
    <aside aria-label="Pour la suite" className={`mt-8 p-5 ${cadre}`}>
      <p className={`text-[1.05rem] leading-relaxed ${texteDoux}`}>
        Cette grille te donne du fil à retordre ? Fais une pause avec{" "}
        <Link href={ADRESSE_JOUER} className={lienOcre}>la grille du jour</Link>.
      </p>
      <p className={`mt-2 text-[1.05rem] leading-relaxed ${texteDoux}`}>
        Et si tu fabriquais la tienne ? <Link href={ADRESSE_CREER} className={lienOcre}>C’est guidé pas à pas</Link>.
      </p>
    </aside>
  );
}

/** Un mot qui manque dans la liste ? Le formulaire de contact. Je lis chaque message (voix de l'auteur). */
export function MotQuiManque() {
  return (
    <p className="mt-6 text-[1.05rem] text-muted-foreground">
      Il manque un mot ? <Link href={ADRESSE_CONTACT} className={lienOcre}>Écris-moi</Link>. Je lis chaque message.
    </p>
  );
}
