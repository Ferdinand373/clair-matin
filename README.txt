CLAIR MATIN — V5.5

Cette version restaure Clair Matin V5.4 et conserve ses données grâce à la même clé locale : clairMatin_v5_4.

NOUVEAUTÉ
- Bouton « Importer depuis Clair Horizon ».
- Autoriser « Coller » si l’iPhone le demande.
- Le même projet est mis à jour sans doublon.
- Solution manuelle par zone de collage si la lecture du presse-papiers est refusée.

INSTALLATION
Remplacer dans le dépôt clair-matin : index.html, manifest.json, sw.js, README.txt, VERSION.txt et le dossier assets. Les anciens fichiers inutiles peuvent rester, mais ces fichiers-ci doivent être remplacés.

COMPATIBILITÉ AVEC LE DÉPÔT ACTUEL
Les fichiers service-worker.js et manifest.webmanifest sont aussi inclus afin de remplacer proprement les restes de Clair Courses qui avaient été envoyés par erreur dans le dépôt clair-matin.
