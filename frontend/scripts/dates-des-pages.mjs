// @ts-check
/**
 * La date de dernière modification de chaque page publique à adresse fixe, pour le `<lastmod>` du sitemap : celle du
 * dernier commit qui a touché les fichiers dont la page est faite (sa route, ses composants, son contenu). Écrite
 * avant `next dev` et `next build` dans `src/content/dates-des-pages.json` (ignoré par git), que lit `app/sitemap.ts`.
 *
 * Seulement la page elle-même, pas la mise en page commune (`app/layout.tsx`, l'en-tête, le pied de page) : sinon
 * chaque retouche du menu « modifierait » tout le site, et un moteur cesse de croire un `lastmod` qui bouge sans
 * raison. Les articles, les grilles à jouer et les listes de mots ont déjà leur propre date (sitemap.ts).
 *
 * Usage : `node scripts/dates-des-pages.mjs [sortie]`, depuis `frontend/`. Hors d'un dépôt git (le dossier tiré par
 * `git archive` au déploiement), le fichier déjà écrit est gardé : `tools/deploy/deploy.sh` l'écrit depuis le dépôt,
 * pour le commit déployé, avant de construire.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FRONTEND = fileURLToPath(new URL('../', import.meta.url));
const SORTIE = process.argv[2] ?? fileURLToPath(new URL('../src/content/dates-des-pages.json', import.meta.url));

/**
 * Les fichiers de chaque page (chemins relatifs à `frontend/src/`). Une page publique absente d'ici n'a pas de
 * `<lastmod>` : le test du sitemap (tests/seo.spec.ts) le voit.
 */
const SOURCES = {
  '/': ['app/page.tsx', 'components/home', 'components/faq', 'content/faq-accueil.ts'],
  '/search': ['app/search', 'components/search'],
  '/grid': ['app/grid', 'components/grid'],
  '/creer-des-mots-fleches': ['app/creer-des-mots-fleches', 'components/guide'],
  '/jouer': ['app/jouer/page.tsx', 'components/jouer'],
  '/articles': ['app/articles/page.tsx'],
  '/mots': ['app/mots/page.tsx', 'components/mots', 'content/mots'],
  '/a-propos': ['app/a-propos'],
  '/mots-fleches-ia': ['app/mots-fleches-ia', 'content/lien-prepare.ts'],
  '/developpeurs': ['app/developpeurs', 'content/lien-prepare.ts'],
  '/contact': ['app/contact', 'components/contact'],
  '/legal': ['app/legal'],
  '/privacy': ['app/privacy', 'components/audience'],
  '/terms': ['app/terms'],
  '/sources': ['app/sources'],
};

function dansUnDepot() {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: FRONTEND, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (!dansUnDepot()) {
  if (!existsSync(SORTIE)) console.warn(`dates-des-pages : ni dépôt git ni ${SORTIE} : le sitemap partira sans date pour les pages fixes.`);
  process.exit(0);
}

/** @type {Record<string, string>} */
const dates = {};
for (const [chemin, sources] of Object.entries(SOURCES)) {
  const fichiers = sources.map((source) => `src/${source}`).filter((source) => existsSync(`${FRONTEND}${source}`));
  // Sans fichier, `git log --` donnerait le dernier commit du dépôt : pas de date plutôt qu'une fausse
  if (fichiers.length === 0) continue;
  // La date du commit (pas celle de l'auteur, qui peut précéder un rebase), en ISO 8601 avec le fuseau
  const date = execFileSync('git', ['log', '-1', '--format=%cI', 'HEAD', '--', ...fichiers], { cwd: FRONTEND, encoding: 'utf-8' }).trim();
  if (date) dates[chemin] = date;
}
writeFileSync(SORTIE, `${JSON.stringify(dates, null, 2)}\n`);
