# Développement local

## Structure du workspace

`seshat-ai` utilise maintenant un workspace Go commité à la racine pour relier trois modules locaux :

```
seshat-ai/
  seshat-backend/   ← backend local / API desktop (module github.com/EngineerProjects/seshat-ai/seshat-backend)
  seshat-server/    ← serveur cloud en cours d’extraction
  seshat/           ← submodule Go (le moteur public)
  seshat-ui/
  go.work           ← commité : relie backend + server + engine
```

`go.work` contient :

```go
use (
    ./seshat
    ./seshat-backend
    ./seshat-server
)
```

Le module principal du backend vit maintenant dans `seshat-backend/go.mod` et déclare :

```go
module github.com/EngineerProjects/seshat-ai/seshat-backend

require github.com/EngineerProjects/seshat v0.0.0
replace github.com/EngineerProjects/seshat => ../seshat
```

Ce `replace` est intentionnel : `seshat` n'a pas encore de tag public stable. Le workspace Go résout la dépendance localement.

## Workflow courant

Cloner depuis la racine `seshat-ai` (qui contient `seshat` en submodule) :

```bash
git clone --recurse-submodules <repo>
cd seshat-ai
```

Travailler depuis la racine `seshat-ai` :

```bash
go build ./seshat-backend/... ./seshat-server/... ./seshat/...
go test ./seshat-backend/... ./seshat-server/... ./seshat/...
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

Pour toucher le moteur en même temps :

```bash
cd ../seshat
go build ./...
go test ./...
```

## Quand passer à un tag public

Quand `seshat` sera tagué avec une première version stable :

1. Retirer le `replace` de `seshat-backend/go.mod`
2. Pointer sur `github.com/EngineerProjects/seshat vX.Y.Z`
3. Garder `go.work` uniquement comme convenience locale non commitée pour l'édition simultanée des modules
