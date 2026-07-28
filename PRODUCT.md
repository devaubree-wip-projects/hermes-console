# Product

## Register

product

## Users

Hermes Console sert quatre personas, rattachés aux rôles RBAC canoniques `owner`, `member` et `viewer` :

- l’Admin ou Ops (`owner`) installe et maintient la Console, les runtimes et leurs secrets ;
- l’Owner ou Manager (`owner`) construit les agents, assigne le travail et reste responsable des décisions
  sensibles ;
- l’Opérateur (`member`) gère les conversations, tâches, validations et ressources au quotidien ;
- l’Auditeur ou DPO (`viewer`) vérifie en lecture seule qui a demandé, exécuté et validé une action.

Le non-développeur est un utilisateur de premier rang : les parcours essentiels ne doivent exiger ni
terminal, ni fichier de configuration, ni connaissance interne du runtime.

## Product Purpose

Hermes Console est l’autorité produit et de contrôle autour du runtime Hermes. Elle permet de construire et
piloter un ou plusieurs agents, puis de transformer leurs conversations et automatisations en travail
durable, attribué, observable et récupérable.

Le produit réussit quand un utilisateur comprend immédiatement quel agent agit, sur quel objet, dans quel
état réel, avec quelle responsabilité humaine, et peut reprendre le travail sans dépendre du cycle de vie
d’un onglet. Next.js reste l’autorité d’identité, de RBAC et de persistance ; un profil Hermes reste la
frontière runtime durable d’un agent.

## Brand Personality

Précise, calme, responsable.

La voix est directe et opérationnelle. Elle expose les états réels, les responsabilités et les décisions
sans dramatiser, sans jargon gratuit et sans masquer la complexité utile.

## Anti-references

- Les interfaces de chat qui présentent une conversation ouverte comme une file de travail durable.
- Les dashboards SaaS décoratifs, remplis de métriques sans action ni provenance.
- Les interfaces agentiques qui cachent le plan, les permissions, les demandes sensibles ou l’auteur d’une
  décision.
- Les clones visuels de Multica ou Sinew : leurs principes de collaboration peuvent inspirer le modèle,
  leur identité ne doit pas être reproduite.
- Les surfaces runtime exposées une par une sans parcours produit cohérent.

## Design Principles

1. **Montrer l’état canonique.** Une tâche, un run, un plan, une intervention et un livrable restent des
   objets distincts.
2. **Garder l’humain responsable.** L’assignation, l’initiateur et les décisions sensibles restent visibles.
3. **Rendre les travaux longs récupérables.** Aucun écran ne suppose qu’un onglet reste ouvert.
4. **Réduire le bruit sans perdre l’audit.** La progression est résumée, la timeline complète reste
   disponible.
5. **Préférer les affordances familières.** Listes, statuts, checklists, filtres et actions explicites
   servent le travail.

## Accessibility & Inclusion

Cible WCAG 2.2 AA. Tous les parcours doivent être utilisables au clavier, avec des focus visibles, des
libellés explicites et des états qui ne reposent jamais sur la couleur seule. Le mouvement réduit doit être
respecté. Le board doit proposer une alternative clavier au glisser-déposer, et les mises à jour temps réel
doivent rester compréhensibles par les technologies d’assistance.
