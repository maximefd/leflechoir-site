import os

from app import create_app

# On appelle notre "usine" pour créer l'application
app = create_app()

if __name__ == "__main__":
    # Le mode debug n'est activé que si FLASK_DEBUG=1 (docker compose en dev).
    # Jamais en production : le débogueur Werkzeug permet d'exécuter du code à distance.
    debug = os.environ.get("FLASK_DEBUG") == "1"
    port = int(os.environ.get("PORT", 5000))
    # Le processus de génération de l'API ouverte (ADR 0032), comme sous gunicorn. Il garde le lexique du démarrage :
    # le rechargement à chaud ne vaut que pour ce processus-ci
    if app.config["API_ENABLED"]:
        import atexit

        import generation_runner

        atexit.register(generation_runner.stop, generation_runner.start(app))
    # Rechargement automatique désactivé : il chargerait le dictionnaire deux fois.
    app.run(host='0.0.0.0', port=port, debug=debug, use_reloader=False)
