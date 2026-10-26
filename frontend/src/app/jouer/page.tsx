import { GrilleDuJour } from "@/components/jouer/grille-du-jour";
import { aujourdhui, verifierStock } from "@/content/grilles";
import { publicPage } from "@/lib/seo";

// La garde du stock (ADR 0026) : le build casse s'il reste moins de sept jours de grilles devant lui.
// Elle court au build, jamais dans le navigateur (le jour, là-bas, avance sans redéployer).
verifierStock(aujourdhui());

export const metadata = publicPage({
  path: "/jouer",
  // « gratuits » et « en ligne » : ce que l'on tape pour jouer ; 56 caractères avec le nom du site
  title: "Mots fléchés du jour, gratuits et en ligne",
  description:
    "Chaque jour, une nouvelle grille de mots fléchés aux définitions malignes, gratuite et sans inscription : à jouer sur téléphone ou ordinateur, ou à imprimer.",
});

/**
 * La grille change chaque jour, la page reste : ce qui est écrit au build, sous la grille, dit ce qu'on y trouve
 * et mène aux grilles parues (leurs pages datées, dans le calendrier). C'est ce que lit un moteur, avant même d'exécuter la page.
 */
export default function Page() {
  return (
    <GrilleDuJour jourDuBuild={aujourdhui()}>
      <section aria-labelledby="une-grille-par-jour" className="mt-12">
        <h2 id="une-grille-par-jour" className="text-xl font-semibold text-foreground">Une grille par jour</h2>
        <p className="mt-3 text-[1.05rem] leading-relaxed text-muted-foreground">
          Chaque jour, une nouvelle grille de mots fléchés, gratuite et sans compte, à jouer au doigt sur téléphone
          ou au clavier sur ordinateur. Ses définitions sont
          écrites pour elle ; une fois la partie finie, la grille montre le sens de ses mots. Elle s’imprime aussi, pour la
          jouer sur papier.
        </p>
      </section>
    </GrilleDuJour>
  );
}
