# Bookcollection

PWA installable (React + Vite) pour suivre ses lectures, hors ligne.
Auth Google + Cloud Firestore (cache IndexedDB persistant), hébergée sur Firebase Hosting.

## Fonctionnalités
- **Timeline** des lectures par date de fin, groupée par année, avec les livres **en cours** en tête
- **Ajout par code-barres** (caméra : BarcodeDetector natif, sinon ZXing) ou ISBN saisi
- Récupération auto : couverture, résumé, auteurs, pages, genres (Google Books + Open Library)
- Statuts : à lire / en cours / lu / abandonné, dates, note ★, notes perso
- **Stats** : livres et pages par an (ou par mois pour une année), top auteurs, top genres
- **Hors ligne** : app précachée (service worker), lecture/écriture Firestore en local, synchro au retour du réseau ; couvertures en cache
- Export JSON de ses données

## Mise en route (une seule fois)

1. **Créer le projet** sur https://console.firebase.google.com
2. **Authentication** › Méthode de connexion › activer **Google**
3. **Firestore Database** › Créer (mode production, région `eur3` par ex.)
4. Paramètres du projet › **Ajouter une app Web** › copier la config
5. En local :
   ```bash
   cp .env.example .env        # coller les valeurs de config
   npm install
   npm i -g firebase-tools
   firebase login
   firebase use --add          # choisir le projet (remplace VOTRE-PROJET-ID dans .firebaserc)
   ```
6. **Déployer** (hosting + règles Firestore) :
   ```bash
   npm run deploy
   ```
7. Ouvrir `https://<projet>.web.app` sur le téléphone › « Ajouter à l'écran d'accueil ».

> Le domaine `<projet>.web.app` est autorisé automatiquement pour l'auth. Pour un domaine perso,
> l'ajouter dans Authentication › Paramètres › Domaines autorisés.

## Dev
```bash
npm run dev       # http://localhost:5173 (localhost est autorisé par défaut)
```
La caméra nécessite HTTPS ou localhost.

## Données
`users/{uid}/books/{bookId}` — règles dans `firestore.rules` : chaque utilisateur n'accède qu'à ses propres livres.

## Structure
```
src/
  lib/firebase.ts    init Firebase, cache offline, login Google
  lib/books.ts       CRUD Firestore + hook temps réel
  lib/lookup.ts      ISBN → Google Books / Open Library
  lib/store.tsx      contexte auth + livres + état réseau
  components/        Scanner, BookForm, Cover
  pages/             Timeline, Library, AddBook, BookDetail, Stats, Profile, Login
```
