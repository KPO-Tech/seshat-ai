# Développement local

## Structure du workspace

`seshat-ai` consomme `seshat` via un `go.work` commité à la racine :

```
seshat-ai/
  cmd/
  internal/
  seshat/       ← submodule Go (le moteur public)
  seshat-skills/
  seshat-ui/
  go.work             ← commité : wire seshat-ai + seshat ensemble
  go.mod
```

`go.work` contient :

```go
use (
    .
    ./seshat
)
```

Et `go.mod` déclare :

```go
require github.com/EngineerProjects/seshat v0.0.0
replace github.com/EngineerProjects/seshat => ./seshat
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
go build ./...           # compile tout (product + engine)
go test ./...            # lance tous les tests
go test ./cmd/api/...    # tests du serveur API seulement
```

Pour toucher le moteur en même temps :

```bash
cd seshat          # Go workspace résout les imports automatiquement
go build ./...
go test ./...
```

## Quand passer à un tag public

Quand `seshat` sera tagué avec une première version stable :

1. Retirer le `replace` de `seshat-ai/go.mod`
2. Pointer sur `github.com/EngineerProjects/seshat vX.Y.Z`
3. Garder `go.work` uniquement comme convénience locale non-commitée pour l'édition simultanée des deux repos
