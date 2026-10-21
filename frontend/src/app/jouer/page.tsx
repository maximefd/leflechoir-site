import { GrilleDuJour } from "@/components/jouer/grille-du-jour";
import { GrillesParues } from "@/components/jouer/grilles-parues";
import { aujourdhui, parues, verifierStock } from "@/content/grilles";
import { publicPage } from "@/lib/seo";

// La garde du stock (ADR 0026) : le build casse s'il reste moins de sept jours de grilles devant lui.
// Elle court au build, jamais dans le navigateur (le jour, là-bas, avance sans redéployer).
verifierStock(aujourdhui());

export const metadata = publicPage({
  path: "/jouer",
  title: "Mots fléchés du jour",
  description:
    "Une grille de mots fléchés nouvelle chaque jour, dessinée par notre moteur : à jouer en ligne ou à imprimer, gratuitement et sans compte.",
});

/**
 * La grille change chaque jour, la page reste : ce qui est écrit au build, sous la grille, dit ce qu'on y trouve
 * et mène aux grilles parues (leurs pages datées). C'est ce que lit un moteur, avant même d'exécuter la page.
 */
export default function Page() {
  return (
    <GrilleDuJour>
      <section aria-labelledby="une-grille-par-jour" className="mt-12">
        <h2 id="une-grille-par-jour" className="text-xl font-semibold text-foreground">Une grille par jour</h2>
        <p className="mt-3 text-[1.05rem] leading-relaxed text-muted-foreground">
          Chaque jour, une nouvelle grille de mots fléchés, gratuite et sans compte, à jouer au doigt sur téléphone
          ou au clavier sur ordinateur. Sa force est annoncée, de 1, la plus facile, à 4. Ses définitions sont
          écrites pour elle ; une fois la partie finie, la grille montre le sens de ses mots. Elle s’imprime aussi, pour la
          jouer sur papier.
        </p>
      </section>
      <GrillesParues initiales={parues(aujourdhui())} />
    </GrilleDuJour>
  );
}
