# Images de partage (Open Graph)

Les images de `public/og/` et `public/apple-touch-icon.png` sont dessinées avec les vraies polices du site.

1. Copier `og-template.astro` dans `src/pages/og-tmp.astro` (temporairement).
2. `node scripts/og/save-server.mjs public/og` (reçoit les images sur le port 8799), puis `npm run dev`.
3. Ouvrir `http://localhost:4321/og-tmp` : les quatre images sont enregistrées. Déplacer `apple-touch-icon.png` dans `public/`.
4. Supprimer `src/pages/og-tmp.astro`.

Modifier les titres directement dans le gabarit (appels `render(...)` en bas).
