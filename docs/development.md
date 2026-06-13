# Développement local

## Structure du workspace

`nexus-ai` consomme `nexus-engine` via un `go.work` commité à la racine :

```
nexus-ai/
  cmd/
  internal/
  nexus-engine/       ← submodule Go (le moteur public)
  nexus-skills/
  nexus-ui/
  go.work             ← commité : wire nexus-ai + nexus-engine ensemble
  go.mod
```

`go.work` contient :

```go
use (
    .
    ./nexus-engine
)
```

Et `go.mod` déclare :

```go
require github.com/EngineerProjects/nexus-engine v0.0.0
replace github.com/EngineerProjects/nexus-engine => ./nexus-engine
```

Ce `replace` est intentionnel : `nexus-engine` n'a pas encore de tag public stable. Le workspace Go résout la dépendance localement.

## Workflow courant

Cloner depuis la racine `nexus-ai` (qui contient `nexus-engine` en submodule) :

```bash
git clone --recurse-submodules <repo>
cd nexus-ai
```

Travailler depuis la racine `nexus-ai` :

```bash
go build ./...           # compile tout (product + engine)
go test ./...            # lance tous les tests
go test ./cmd/api/...    # tests du serveur API seulement
```

Pour toucher le moteur en même temps :

```bash
cd nexus-engine          # Go workspace résout les imports automatiquement
go build ./...
go test ./...
```

## Quand passer à un tag public

Quand `nexus-engine` sera tagué avec une première version stable :

1. Retirer le `replace` de `nexus-ai/go.mod`
2. Pointer sur `github.com/EngineerProjects/nexus-engine vX.Y.Z`
3. Garder `go.work` uniquement comme convénience locale non-commitée pour l'édition simultanée des deux repos
