# PRD - Application Knowledge (SeshatOS)

## Intention Produit & Vision
L'application Knowledge est la première plateforme produit complète du MVP SeshatOS. Elle unifie le cycle complet de la connaissance d'entreprise :
1. **Collecter & Connecter** (SharePoint, Google Drive, S3, Azure Blob, connecteurs MCP)
2. **Gouverner & Organiser** (Collections, permissions synchronisées, traçabilité & audit)
3. **Rechercher & Explorer** (Search haute performance avec extraits et scores, Knowledge Graph relationnel)
4. **Interagir & Raisonner** (Chat Knowledge spécialisé avec citations strictes, niveau de confiance et détection des contradictions)
5. **Découvrir & Surveiller** (Discover : détection des documents obsolètes, lacunes documentaires, risques et alertes)
6. **Agir de manière gouvernée** (Actions : propositions de mise à jour, workflows d'approbation humaine, automations contrôlées)

## Architecture Informationnelle (8 Vues Clés)
- **Overview** : Tableau de bord de santé documentaire (qualité, fraîcheur, risques, statistiques d'ingestion).
- **Search** : Moteur de recherche interne ultra-rapide avec filtres multicritères, citations et actions rapides.
- **Chat Knowledge** : Assistant conversationnel RAG gouverné avec citations cliquables et métriques de confiance.
- **Sources** : Gestionnaire des connecteurs d'entreprise (SharePoint, GDrive, S3, MCP) et synchronisations.
- **Collections** : Corpus thématiques configurables avec périmètres et règles d'accès.
- **Knowledge Graph** : Carte interactive des entités, procédures, équipes et liens inter-documents.
- **Discover** : Intelligence proactive détectant les contradictions, l'obsolescence et les angles morts.
- **Actions** : Suivi des propositions de mise à jour, tâches d'assainissement et approbations gouvernées.
