"""Les messages de l'API ouverte, dans la langue de qui l'appelle (ADR 0032).

Un client lit `reason`, toujours le même ; le message l'explique à un humain ou à un modèle, dans la langue demandée
par `Accept-Language` (anglais, français, allemand ; l'anglais à défaut). C'est la langue des messages, pas celle de
la grille : un professeur d'allemand peut lire en français les messages d'une grille allemande.

Une langue de plus : une colonne de plus dans `MESSAGES`, et `test_api_messages.py` vérifie qu'aucun message ne
manque.
"""

MESSAGE_LANGS = ("en", "fr", "de")
DEFAULT_MESSAGE_LANG = "en"

MESSAGES: dict[str, dict[str, str]] = {
    # --- Accès ---
    "api_disabled": {
        "en": "The API is not open yet.",
        "fr": "L'API n'est pas encore ouverte.",
        "de": "Die API ist noch nicht geöffnet.",
    },
    "invalid_api_key": {
        "en": "Invalid or revoked API key.",
        "fr": "Clé d'API invalide ou révoquée.",
        "de": "Ungültiger oder widerrufener API-Schlüssel.",
    },
    "rate_limited": {
        "en": "Too many requests from this address: wait a moment.",
        "fr": "Trop de requêtes depuis cette adresse : attends un instant.",
        "de": "Zu viele Anfragen von dieser Adresse: bitte kurz warten.",
    },
    "not_found": {
        "en": "Not found. Generations are kept 24 hours (30 days once their clues are written).",
        "fr": "Introuvable. Les générations sont gardées 24 heures (30 jours une fois leurs définitions écrites).",
        "de": "Nicht gefunden. Generierungen werden 24 Stunden aufbewahrt (30 Tage, sobald ihre Hinweise geschrieben "
              "sind).",
    },
    "method_not_allowed": {
        "en": "Method not allowed on this path.",
        "fr": "Méthode non autorisée sur cette adresse.",
        "de": "Methode für diesen Pfad nicht erlaubt.",
    },
    "internal_error": {
        "en": "Internal server error.",
        "fr": "Erreur interne du serveur.",
        "de": "Interner Serverfehler.",
    },
    # --- Le corps de la requête ---
    "length_required": {
        "en": "The Content-Length header is required.",
        "fr": "L'en-tête Content-Length est obligatoire.",
        "de": "Der Header Content-Length ist erforderlich.",
    },
    "payload_too_large": {
        "en": "The request body exceeds {max_kb} KB.",
        "fr": "Le corps de la requête dépasse {max_kb} Ko.",
        "de": "Der Anfragekörper überschreitet {max_kb} KB.",
    },
    "unsupported_media_type": {
        "en": "The body must be JSON (Content-Type: application/json).",
        "fr": "Le corps doit être du JSON (Content-Type: application/json).",
        "de": "Der Körper muss JSON sein (Content-Type: application/json).",
    },
    "invalid_request": {
        "en": "Invalid request: {detail}",
        "fr": "Requête invalide : {detail}",
        "de": "Ungültige Anfrage: {detail}",
    },
    # --- La demande de grille ---
    "unsupported_lang": {
        "en": "Unknown grid language « {lang} ». Languages: {supported}.",
        "fr": "Langue de grille inconnue : « {lang} ». Langues : {supported}.",
        "de": "Unbekannte Rastersprache „{lang}“. Sprachen: {supported}.",
    },
    "lang_unavailable": {
        "en": "Grids in « {lang} » are not available right now: try again in a few minutes.",
        "fr": "Les grilles en « {lang} » ne sont pas disponibles pour le moment : réessaie dans quelques minutes.",
        "de": "Raster auf „{lang}“ sind gerade nicht verfügbar: in ein paar Minuten erneut versuchen.",
    },
    "api_paused": {
        "en": "The generator is reserved for the website for a few minutes: try again later.",
        "fr": "Le générateur est réservé au site quelques minutes : réessaie plus tard.",
        "de": "Der Generator ist für einige Minuten der Website vorbehalten: später erneut versuchen.",
    },
    "size_out_of_range": {
        "en": "A grid is {min_side} to {max_side} cells wide and high.",
        "fr": "Une grille fait de {min_side} à {max_side} cases de côté.",
        "de": "Ein Raster ist {min_side} bis {max_side} Felder breit und hoch.",
    },
    "geometry_unavailable": {
        "en": "The engine cannot draw a {width} × {height} grid: change one dimension.",
        "fr": "Le moteur ne sait pas dessiner de grille en {width} × {height} : change une des deux dimensions.",
        "de": "Die Engine kann kein Raster {width} × {height} zeichnen: eine Abmessung ändern.",
    },
    "invalid_letters": {
        "en": "These words have letters that « {lang} » grids do not use: {words}.",
        "fr": "Ces mots ont des lettres que les grilles en « {lang} » n'utilisent pas : {words}.",
        "de": "Diese Wörter enthalten Buchstaben, die Raster auf „{lang}“ nicht verwenden: {words}.",
    },
    "word_length": {
        "en": "A word has 2 to {max_side} letters once written in the grid: {words}.",
        "fr": "Un mot a de 2 à {max_side} lettres une fois écrit dans la grille : {words}.",
        "de": "Ein Wort hat im Raster 2 bis {max_side} Buchstaben: {words}.",
    },
    "must_words": {
        "en": "These required words are longer than the grid: {words}.",
        "fr": "Ces mots obligatoires sont plus longs que la grille : {words}.",
        "de": "Diese Pflichtwörter sind länger als das Raster: {words}.",
    },
    "mystery_word_length": {
        "en": "The mystery word has {min_letters} to {max_letters} letters.",
        "fr": "Le mot mystère compte de {min_letters} à {max_letters} lettres.",
        "de": "Das Lösungswort hat {min_letters} bis {max_letters} Buchstaben.",
    },
    # --- Quotas ---
    "generation_in_progress": {
        "en": "A generation is already running for you: wait for its result before asking for another one.",
        "fr": "Une génération est déjà en cours pour toi : attends son résultat avant d'en demander une autre.",
        "de": "Für dich läuft bereits eine Generierung: warte auf ihr Ergebnis, bevor du eine neue anforderst.",
    },
    "quota_minute": {
        "en": "Limit of {limit} generations per minute{who}.",
        "fr": "Limite de {limit} générations par minute{who}.",
        "de": "Grenze von {limit} Generierungen pro Minute{who}.",
    },
    "quota_day": {
        "en": "Limit of {limit} generations per 24 hours{who}.",
        "fr": "Limite de {limit} générations par 24 heures{who}.",
        "de": "Grenze von {limit} Generierungen pro 24 Stunden{who}.",
    },
    "quota_words": {
        "en": "Limit of {limit} words returned per 24 hours{who}.",
        "fr": "Limite de {limit} mots rendus par 24 heures{who}.",
        "de": "Grenze von {limit} zurückgegebenen Wörtern pro 24 Stunden{who}.",
    },
    "repeated_settings": {
        "en": "Too many grids with the same settings in 24 hours: change the words or the size.",
        "fr": "Trop de grilles aux mêmes réglages en 24 heures : change les mots ou le format.",
        "de": "Zu viele Raster mit denselben Einstellungen in 24 Stunden: Wörter oder Größe ändern.",
    },
    "quota_global": {
        "en": "The service has reached its generation cap for today.",
        "fr": "Le service a atteint son plafond de générations pour aujourd'hui.",
        "de": "Der Dienst hat sein Generierungslimit für heute erreicht.",
    },
    "busy": {
        "en": "The generator is in high demand: try again in a moment.",
        "fr": "Le générateur est très demandé : réessaie dans un instant.",
        "de": "Der Generator ist stark gefragt: gleich erneut versuchen.",
    },
    # --- L'issue d'une génération ---
    "queue_timeout": {
        "en": "The generator was too busy: the request waited too long. Try again in a few minutes.",
        "fr": "Le générateur était trop occupé : la demande a attendu trop longtemps. Réessaie dans quelques minutes.",
        "de": "Der Generator war zu ausgelastet: die Anfrage hat zu lange gewartet. In ein paar Minuten erneut "
              "versuchen.",
    },
    "must_words_unplaced": {
        "en": "Not every required word could be placed in time: {words}. Try another seed, a larger grid or fewer "
              "required words.",
        "fr": "Tous les mots obligatoires n'ont pas pu être placés à temps : {words}. Essaie une autre graine, une "
              "grille plus grande ou moins de mots obligatoires.",
        "de": "Nicht alle Pflichtwörter konnten rechtzeitig platziert werden: {words}. Andere Seed, größeres Raster "
              "oder weniger Pflichtwörter versuchen.",
    },
    "timeout": {
        "en": "The generation ran out of time: try another seed or another size.",
        "fr": "La génération a manqué de temps : essaie une autre graine ou un autre format.",
        "de": "Die Generierung hat die Zeit überschritten: andere Seed oder andere Größe versuchen.",
    },
    "no_solution": {
        "en": "No grid could be built with these words.",
        "fr": "Aucune grille n'a pu être construite avec ces mots.",
        "de": "Mit diesen Wörtern ließ sich kein Raster bauen.",
    },
    "mystery_letters_missing": {
        "en": "The grid lacks these letters for the mystery word: {letters}. Try another seed.",
        "fr": "Il manque ces lettres dans la grille pour le mot mystère : {letters}. Essaie une autre graine.",
        "de": "Dem Raster fehlen diese Buchstaben für das Lösungswort: {letters}. Andere Seed versuchen.",
    },
    # --- Le fichier de grille et ses définitions ---
    "invalid_grid": {
        "en": "This grid file cannot be read: see details.",
        "fr": "Ce fichier de grille ne se lit pas : voir le détail.",
        "de": "Diese Rasterdatei ist nicht lesbar: siehe Details.",
    },
    "clue_missing": {
        "en": "This word has no clue yet.",
        "fr": "Ce mot n'a pas encore de définition.",
        "de": "Dieses Wort hat noch keinen Hinweis.",
    },
    "clue_too_long": {
        "en": "Too long for its cell: about {max_chars} characters fit.",
        "fr": "Trop longue pour sa case : environ {max_chars} caractères y tiennent.",
        "de": "Zu lang für sein Feld: etwa {max_chars} Zeichen passen hinein.",
    },
    "clue_contains_answer": {
        "en": "The clue gives the answer away.",
        "fr": "La définition donne la réponse.",
        "de": "Der Hinweis verrät die Lösung.",
    },
    "clue_invalid": {
        "en": "A clue is 1 to {max_length} characters of plain text, without < or >.",
        "fr": "Une définition fait de 1 à {max_length} caractères de texte simple, sans < ni >.",
        "de": "Ein Hinweis besteht aus 1 bis {max_length} Zeichen einfachem Text, ohne < oder >.",
    },
    "clue_style_long": {
        "en": "Reads like a dictionary entry: an arrowword clue has 1 to {max_words} words.",
        "fr": "Ressemble à une définition de dictionnaire : en mots fléchés, une définition tient en 1 à {max_words} "
              "mots.",
        "de": "Klingt nach Wörterbuch: ein Schwedenrätsel-Hinweis hat 1 bis {max_words} Wörter.",
    },
    "clue_style_relative": {
        "en": "A relative clause (« which », « who ») is a dictionary habit: say it in a few words, or play on words.",
        "fr": "Une relative (« qui », « que l'on ») est un réflexe de dictionnaire : dis-le en quelques mots, ou joue "
              "sur les mots.",
        "de": "Ein Relativsatz („der“, „die“, „welche“) ist Wörterbuchstil: in wenigen Wörtern sagen oder mit "
              "Wörtern spielen.",
    },
}

# Morceaux réutilisés dans plusieurs messages
WHO = {
    "key": {"en": " for this key", "fr": " pour cette clé", "de": " für diesen Schlüssel"},
    "anonymous": {"en": " without a key (create one for more)", "fr": " sans clé (crée une clé pour davantage)",
                  "de": " ohne Schlüssel (für mehr einen erstellen)"},
}

LANGUAGE_NAMES = {
    "fr": {"en": "French", "fr": "français", "de": "Französisch"},
    "de": {"en": "German", "fr": "allemand", "de": "Deutsch"},
    "en": {"en": "English", "fr": "anglais", "de": "Englisch"},
}


def pick_language(header: str | None) -> str:
    """La langue des messages, d'après `Accept-Language` (« de-CH,de;q=0.9,en;q=0.5 ») ; l'anglais à défaut."""
    choices = []
    for index, part in enumerate((header or "").split(",")):
        tag, _, params = part.strip().partition(";")
        quality = 1.0
        if params.strip().startswith("q="):
            try:
                quality = float(params.strip()[2:])
            except ValueError:
                quality = 0.0
        choices.append((-quality, index, tag.strip().lower()[:2]))
    for _, _, code in sorted(choices):
        if code in MESSAGE_LANGS:
            return code
    return DEFAULT_MESSAGE_LANG


def message(reason: str, message_lang: str, /, **params) -> str:
    """Le message d'un `reason` dans la langue des messages ; `params` peut contenir `lang` (la langue d'une grille)."""
    texts = MESSAGES.get(reason) or MESSAGES["internal_error"]
    text = texts.get(message_lang) or texts[DEFAULT_MESSAGE_LANG]
    try:
        return text.format(**params)
    except (KeyError, IndexError):
        return text


def who(keyed: bool, lang: str) -> str:
    return WHO["key" if keyed else "anonymous"][lang]
