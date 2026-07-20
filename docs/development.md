# Développement local

## Structure du workspace

`seshat-ai` utilise un workspace Go commité à la racine pour relier deux modules locaux :

```
seshat-ai/
  seshat-backend/   ← backend local / API desktop (module github.com/EngineerProjects/seshat-ai/seshat-backend)
  seshat-server/    ← serveur cloud en cours d’extraction
  seshat-ui/
  go.work           ← commité : relie backend + server
```

`go.work` contient :

```go
use (
    ./seshat-backend
    ./seshat-server
)
```

Le moteur `seshat` n'est plus un submodule ni un module local : c'est une dépendance externe publiée, `github.com/KPO-Tech/seshat` (voir https://github.com/KPO-Tech/seshat). Le module principal du backend le déclare dans `seshat-backend/go.mod` comme n'importe quelle autre dépendance :

```go
module github.com/EngineerProjects/seshat-ai/seshat-backend

require github.com/KPO-Tech/seshat v0.2.1
```

Même chose dans `seshat-server/go.mod`. Aucun `replace` local — `go mod download` récupère le module directement depuis GitHub.

## Workflow courant

```bash
git clone <repo>
cd seshat-ai
```

Travailler depuis la racine `seshat-ai` :

```bash
go build ./seshat-backend/... ./seshat-server/...
go test ./seshat-backend/... ./seshat-server/...
go test ./seshat-backend/internal/api/...
```

Travailler uniquement sur le backend local :

```bash
cd seshat-backend
go build ./cmd/api
go test ./...
```

Travailler uniquement sur le serveur cloud :

```bash
cd ../seshat-server
go build ./cmd/server
go test ./...
```

## Faire évoluer le moteur seshat

Le code de `seshat` vit dans son propre repo (`github.com/KPO-Tech/seshat`), cloné et développé séparément. Pour consommer un changement depuis `seshat-ai` :

1. Merger et taguer une nouvelle version sur le repo seshat (`vX.Y.Z`).
2. Depuis `seshat-backend/` et `seshat-server/` : `go get github.com/KPO-Tech/seshat@vX.Y.Z`.
3. Committer les `go.mod`/`go.sum` mis à jour.

Ne jamais ajouter de `replace` pointant vers une copie locale de `seshat` dans un commit — c'est un dépôt indépendant, pas un sous-module de ce repo.
