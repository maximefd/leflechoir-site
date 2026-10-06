# DANS backend/models.py

from datetime import datetime, timezone

from engine.arrows import clues_from_grid_data
from extensions import db # MODIFICATION ICI : On importe 'db' depuis notre fichier central

def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(db.Model):
    __tablename__ = 'user'
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(120), nullable=False)
    # Date à laquelle l'adresse a été confirmée par un lien reçu par e-mail ; None tant qu'elle ne l'est pas
    email_verified_at = db.Column(db.DateTime, nullable=True)
    # Les jetons émis avant cette date (UTC) sont refusés : changer de mot de passe ferme toutes les sessions
    sessions_revoked_at = db.Column(db.DateTime, nullable=True)
    # Inscription et dernière connexion (UTC) : la seconde fixe la suppression des comptes inactifs
    # (3 ans, page de confidentialité). Vides pour les comptes créés avant leur arrivée.
    created_at = db.Column(db.DateTime, nullable=True, default=lambda: _utcnow())
    last_login_at = db.Column(db.DateTime, nullable=True)
    # Accès au poste de pilotage (ADR 0016, point 6) : posé en ligne de commande (`flask admin grant`), jamais par l'API
    is_admin = db.Column(db.Boolean, nullable=False, default=False, server_default=db.false())
    
    dictionaries = db.relationship('Dictionary', backref='user', lazy='selectin', cascade="all, delete-orphan")
    grids = db.relationship('SavedGrid', backref='user', lazy='selectin', cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User {self.email}>"

class Dictionary(db.Model):
    __tablename__ = 'dictionary'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    is_active = db.Column(db.Boolean, default=False, nullable=False)
    
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    words = db.relationship('PersonalWord', backref='dictionary', lazy='selectin', cascade="all, delete-orphan")

    __table_args__ = (
        db.UniqueConstraint('user_id', 'name', name='uix_user_dico_name'),
    )

    def __repr__(self):
        return f"<Dictionary {self.name} (User {self.user_id})>"

    def to_json(self, include_words=False):
        data = { 'id': self.id, 'name': self.name, 'is_active': self.is_active, 'user_id': self.user_id }
        if include_words:
            data['words'] = [w.to_json() for w in self.words]
        return data

class PersonalWord(db.Model):
    __tablename__ = 'personal_word'
    id = db.Column(db.Integer, primary_key=True)
    mot = db.Column(db.String(50), nullable=False)
    mot_affiche = db.Column(db.String(50), nullable=False)
    definition = db.Column(db.String(255), nullable=True)
    date_ajout = db.Column(db.DateTime, default=datetime.utcnow)
    
    dictionary_id = db.Column(db.Integer, db.ForeignKey('dictionary.id'), nullable=False)

    def __repr__(self):
        return f"<PersonalWord '{self.mot_affiche}'>"

    def to_json(self):
        return {
            'id': self.id,
            'mot': self.mot,
            'mot_affiche': self.mot_affiche,
            'longueur': len(self.mot),
            'definition': self.definition,
            'source': 'PERSONNEL',
            'date_ajout': self.date_ajout.isoformat() if self.date_ajout else None
        }
class SavedGrid(db.Model):
    """Une grille générée que l'auteur a voulu garder.

    Le contenu est stocké **tel quel** (`payload`), et non regénéré à la demande : le lexique est
    curé de semaine en semaine et le catalogue de layouts s'enrichit, si bien que la même seed ne
    redonnerait pas la même grille six mois plus tard. Une grille conservée doit rester celle que
    l'auteur a vue.
    """
    __tablename__ = 'saved_grid'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    layout_id = db.Column(db.String(30), nullable=False)
    width = db.Column(db.Integer, nullable=False)
    height = db.Column(db.Integer, nullable=False)
    # La seed de génération, quand elle est connue : elle sert à retrouver l'origine d'une grille
    seed = db.Column(db.Integer, nullable=True)
    payload = db.Column(db.JSON, nullable=False)
    # Définition de chaque mot, par clé « x-y-direction » — la **position**, jamais le texte : une
    # lettre corrigée à la main renomme le mot, et une clé fondée sur le texte laisserait sa
    # définition orpheline ([ADR 0012](docs/adr/0012-grille-modifiable.md)).
    definitions = db.Column(db.JSON, nullable=False, default=dict, server_default=db.text("'{}'"))
    # Bloc-notes de l'auteur : les idées viennent avant les définitions, et rarement en une fois
    notes = db.Column(db.Text, nullable=False, default="", server_default="")
    # Archivée : rangée hors de la liste courante, jamais supprimée
    archived = db.Column(db.Boolean, nullable=False, default=False, server_default=db.false())
    # Mot mystère (#218) : {"word": "MARIE", "seed": 42, "cells": [{"x": 1, "y": 0}, …]}, une case par lettre dans
    # l'ordre ; NULL sans mot mystère. À part du `payload`, comme les définitions : il se pose et se retire seul
    mystery = db.Column(db.JSON(none_as_null=True), nullable=True)
    date_creation = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

    # Le seul accès : « mes grilles, la plus récente d'abord »
    __table_args__ = (
        db.Index('ix_saved_grid_user_date', 'user_id', 'date_creation'),
    )

    def __repr__(self):
        return f"<SavedGrid '{self.name}' ({self.layout_id})>"

    def shape(self) -> list[str]:
        """La forme de la grille, une ligne par rangée : « x » case définition, « - » case lettre.

        De quoi dessiner une miniature dans la liste sans transporter les lettres ni les mots :
        c'est la silhouette qui distingue deux grilles d'un coup d'œil, pas leur contenu.
        """
        cells = (self.payload or {}).get("cells", []) if isinstance(self.payload, dict) else []
        rows = [["-"] * self.width for _ in range(self.height)]
        for cell in cells:
            if 0 <= cell.get("y", -1) < self.height and 0 <= cell.get("x", -1) < self.width:
                rows[cell["y"]][cell["x"]] = "x" if cell.get("is_black") else "-"
        return ["".join(row) for row in rows]

    def summary(self):
        """Ce qu'il faut pour lister les grilles sans transporter toutes leurs cases."""
        words = self.payload.get('words', []) if isinstance(self.payload, dict) else []
        return {
            'id': self.id,
            'name': self.name,
            'layout': self.layout_id,
            'width': self.width,
            'height': self.height,
            'seed': self.seed,
            'word_count': len(words),
            'must_words': self.payload.get('must_words', []) if isinstance(self.payload, dict) else [],
            'defined_count': len(self.definitions or {}),
            'shape': self.shape(),
            'archived': self.archived,
            'has_notes': bool((self.notes or "").strip()),
            'date_creation': self.date_creation.isoformat() if self.date_creation else None,
        }

    def to_json(self):
        # Les flèches ne sont pas stockées : elles se déduisent des cases noires et des débuts de mots,
        # si bien qu'une grille conservée avant leur arrivée en reçoit aussi (#26).
        grid = dict(self.payload) if isinstance(self.payload, dict) else {}
        grid['clues'] = clues_from_grid_data(grid.get('cells', []), grid.get('words', []))
        # Avec la grille, comme à la génération : le dessin (écran et PDF) le lit au même endroit
        grid['mystery'] = self.mystery or None
        return {**self.summary(), 'grid': grid, 'definitions': self.definitions or {},
                'notes': self.notes or ""}


class RevokedToken(db.Model):
    """Jeton révoqué avant son expiration, à la déconnexion ([ADR 0015](../docs/adr/0015-session-en-cookies.md)).

    Gardé jusqu'à `expires_at` seulement : au-delà, le jeton est refusé de toute façon.
    """
    __tablename__ = 'revoked_token'
    jti = db.Column(db.String(64), primary_key=True)
    expires_at = db.Column(db.DateTime, nullable=False, index=True)


class UsageEvent(db.Model):
    """Un fait d'usage, écrit par l'API ([ADR 0016](../docs/adr/0016-mesure-d-usage-sans-cookie.md)).

    Jamais d'adresse IP : le visiteur est une empreinte du jour (usage.py). `user_id` n'est posé que là où
    un parcours en a besoin (compte, grille conservée) ; l'événement disparaît avec le compte. Les mots
    imposés en clair (`words`) sont effacés à 90 jours, les événements à 13 mois.
    """
    __tablename__ = 'usage_event'
    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: _utcnow(), index=True)
    # generation, search, account, grid, error
    kind = db.Column(db.String(20), nullable=False)
    # Ce qui s'est passé : « grid », « timeout », « busy_server », « register »…
    outcome = db.Column(db.String(40), nullable=True)
    status = db.Column(db.Integer, nullable=False)
    route = db.Column(db.String(80), nullable=True)
    site = db.Column(db.String(10), nullable=False)
    lang = db.Column(db.String(5), nullable=False)
    country = db.Column(db.String(2), nullable=True)
    visitor = db.Column(db.String(32), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=True, index=True)
    duration_ms = db.Column(db.Integer, nullable=True)
    cpu_ms = db.Column(db.Integer, nullable=True)
    data = db.Column(db.JSON, nullable=False, default=dict)
    # none_as_null : « pas de mots » est un NULL SQL, que la purge et les requêtes reconnaissent
    words = db.Column(db.JSON(none_as_null=True), nullable=True)

    __table_args__ = (
        db.Index('ix_usage_event_kind_date', 'kind', 'created_at'),
    )


class VisitorSalt(db.Model):
    """Le sel du jour de l'empreinte des visiteurs : secret, remplacé et détruit chaque jour (ADR 0016).

    En base, pour que les workers de gunicorn comptent le même visiteur de la même façon.
    """
    __tablename__ = 'visitor_salt'
    day = db.Column(db.Date, primary_key=True)
    salt = db.Column(db.String(64), nullable=False)


class WordSuggestion(db.Model):
    """Un mot signalé (à retirer) ou proposé (à ajouter) depuis le site (roadmap 1e, #144, #145).

    Rien n'entre dans le lexique ni n'en sort sans la décision de l'auteur, prise dans le curateur : le statut
    reflète cette décision, renvoyée par `make deploy-lexicon`. Une personne se compte par son compte, sinon
    par l'empreinte du jour (ADR 0016). Les suggestions d'un compte disparaissent avec lui.
    """
    __tablename__ = 'word_suggestion'
    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: _utcnow(), index=True)
    # « remove » : à retirer du lexique ; « add » : à y ajouter
    kind = db.Column(db.String(10), nullable=False)
    # Forme commune (normalization.py) et forme lue ou tapée
    word = db.Column(db.String(50), nullable=False, index=True)
    display = db.Column(db.String(50), nullable=False)
    lang = db.Column(db.String(5), nullable=False)
    # D'où vient la suggestion : search, search_empty, grid, editor, editor_unknown, editor_replaced (implicite)
    source = db.Column(db.String(20), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=True, index=True)
    visitor = db.Column(db.String(32), nullable=True)
    # « pending », « accepted » (le lexique suit la suggestion), « rejected »
    status = db.Column(db.String(10), nullable=False, default="pending")
    decided_at = db.Column(db.DateTime, nullable=True)

    def to_json(self):
        return {
            "word": self.word,
            "display": self.display,
            "kind": self.kind,
            "status": self.status,
            "created_at": self.created_at.isoformat(timespec="seconds") + "Z",
        }


class LayoutProposal(db.Model):
    """Une mise en page faite à la main, proposée au catalogue (roadmap 5C) ; recueil arrêté le 06/10/2026 (#221).

    Plus rien n'y entre : la table et les formes déjà reçues restent, et partent avec le compte.

    Seule la forme est gardée (`x` case définition, `-` case lettre, ADR 0006), jamais les mots : l'auteur
    l'ajoute ou la refuse dans le curateur. Une forme n'est gardée qu'une fois ; elle disparaît avec le compte
    qui l'a proposée.
    """
    __tablename__ = 'layout_proposal'
    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: _utcnow(), index=True)
    width = db.Column(db.Integer, nullable=False)
    height = db.Column(db.Integer, nullable=False)
    # Les rangées, séparées par des retours à la ligne : la forme exacte du fichier du catalogue
    rows = db.Column(db.Text, nullable=False)
    lang = db.Column(db.String(5), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False, index=True)
    __table_args__ = (db.UniqueConstraint('lang', 'rows', name='uq_layout_proposal_lang_rows'),)

    def to_json(self):
        return {
            "id": self.id,
            "width": self.width,
            "height": self.height,
            "rows": self.rows.split("\n"),
            "created_at": self.created_at.isoformat(timespec="seconds") + "Z",
        }


class SystemSample(db.Model):
    """Un échantillon du serveur, pris chaque minute (ADR 0016, point 3 ; system_samples.py).

    Rien de personnel : la machine, pas ses visiteurs. Gardé 30 jours, puis résumé en `SystemDaily`.
    """
    __tablename__ = 'system_sample'
    id = db.Column(db.Integer, primary_key=True)
    # La minute de l'échantillon (UTC) : une seule ligne par site et par minute, même si deux minuteurs se croisent
    created_at = db.Column(db.DateTime, nullable=False, index=True)
    site = db.Column(db.String(10), nullable=False)
    lang = db.Column(db.String(5), nullable=False)
    # Mémoire de la machine (/proc/meminfo) : utilisée = totale - disponible
    mem_total_mb = db.Column(db.Integer, nullable=True)
    mem_used_mb = db.Column(db.Integer, nullable=True)
    # Mémoire propre à l'API, lexique partagé compté une fois (PSS de ses processus) : l'ADR 0013 demande de
    # surveiller l'érosion du partage entre workers
    api_mem_mb = db.Column(db.Integer, nullable=True)
    # Compteurs cumulés de /proc/stat, et la part de CPU occupée depuis l'échantillon précédent (tous cœurs)
    cpu_busy = db.Column(db.BigInteger, nullable=True)
    cpu_total = db.Column(db.BigInteger, nullable=True)
    cpu_percent = db.Column(db.Float, nullable=True)
    # Places de génération prises à cet instant, sur combien (generation_slots.py)
    slots_busy = db.Column(db.Integer, nullable=True)
    slots_total = db.Column(db.Integer, nullable=True)
    db_size_mb = db.Column(db.Float, nullable=True)
    # Dernière sauvegarde copiée hors du serveur (trace de tools/db/backup-offsite.sh)
    last_backup_at = db.Column(db.DateTime, nullable=True)
    # L'API répond-elle sur /api/status ? Vide : non vérifié
    api_ok = db.Column(db.Boolean, nullable=True)

    __table_args__ = (
        db.UniqueConstraint('site', 'created_at', name='uix_system_sample_site_minute'),
    )


class SystemDaily(db.Model):
    """Le résumé d'une journée d'échantillons : ce qui reste après 30 jours, gardé 13 mois (ADR 0016, point 5)."""
    __tablename__ = 'system_daily'
    id = db.Column(db.Integer, primary_key=True)
    day = db.Column(db.Date, nullable=False)
    site = db.Column(db.String(10), nullable=False)
    lang = db.Column(db.String(5), nullable=False)
    samples = db.Column(db.Integer, nullable=False)
    mem_total_mb = db.Column(db.Integer, nullable=True)
    mem_used_avg_mb = db.Column(db.Integer, nullable=True)
    mem_used_max_mb = db.Column(db.Integer, nullable=True)
    api_mem_max_mb = db.Column(db.Integer, nullable=True)
    cpu_avg_percent = db.Column(db.Float, nullable=True)
    cpu_max_percent = db.Column(db.Float, nullable=True)
    slots_busy_max = db.Column(db.Integer, nullable=True)
    # Nombre d'échantillons où toutes les places étaient prises : les minutes où une demande aurait été refusée
    slots_full = db.Column(db.Integer, nullable=True)
    db_size_mb = db.Column(db.Float, nullable=True)
    last_backup_at = db.Column(db.DateTime, nullable=True)
    api_down = db.Column(db.Integer, nullable=True)

    __table_args__ = (
        db.UniqueConstraint('site', 'day', name='uix_system_daily_site_day'),
    )


class AlertSent(db.Model):
    """Une alerte ou un bilan envoyé à l'auteur (alerts.py, #132) : le journal qui plafonne les envois.

    Le quota gratuit de Brevo (300 e-mails par jour) est partagé avec les e-mails du compte. La ligne est écrite
    **avant** l'envoi : une alerte qui échoue ou un minuteur qui s'emballe ne peut pas la renvoyer. `period`
    interdit deux alertes du même type pour la même période, même lancées au même instant.
    """
    __tablename__ = 'alert_sent'
    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: _utcnow(), index=True)
    site = db.Column(db.String(10), nullable=False)
    lang = db.Column(db.String(5), nullable=False)
    # ram, busy, p95, server_errors, backup, api_down, test, weekly
    kind = db.Column(db.String(20), nullable=False)
    # Le jour (alerte), la semaine (bilan) ou l'instant (essai)
    period = db.Column(db.String(20), nullable=False)
    # Ce qui a déclenché l'envoi, en une ligne : des chiffres, rien de personnel
    summary = db.Column(db.String(200), nullable=False, default="", server_default="")
    delivered = db.Column(db.Boolean, nullable=False, default=False, server_default=db.false())

    __table_args__ = (
        db.UniqueConstraint('site', 'kind', 'period', name='uix_alert_sent_site_kind_period'),
    )


class ContactMessage(db.Model):
    """Un message écrit par le formulaire de contact (roadmap Phase 8, #131).

    Lu par l'auteur dans la boîte de réception du poste de pilotage ; l'e-mail de notification ne recopie jamais
    le message. Jamais d'adresse IP ni d'empreinte. Le compte, s'il y en a un, est lié au message : il disparaît
    avec lui. Gardé 12 mois (usage.py).
    """
    __tablename__ = 'contact_message'
    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: _utcnow(), index=True)
    site = db.Column(db.String(10), nullable=False)
    lang = db.Column(db.String(5), nullable=False)
    # suggestion, problem, data
    reason = db.Column(db.String(20), nullable=False)
    message = db.Column(db.Text, nullable=False)
    # L'adresse de réponse, facultative
    reply_email = db.Column(db.String(254), nullable=True)
    # L'identifiant de la requête qui a échoué (« Signaler ce problème »), retrouvable dans Sentry et les journaux
    request_id = db.Column(db.String(64), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=True, index=True)
    read_at = db.Column(db.DateTime, nullable=True)
