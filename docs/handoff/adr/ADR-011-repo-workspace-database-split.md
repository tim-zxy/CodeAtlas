# ADR 011 Repository and Workspace Database Split

Status: Accepted

Decision: Repository facts live in independently rebuildable repository databases. Workspace services, contracts, cross-repository execution, documents, knowledge, lifecycle, evaluation, and usage live in a workspace database joined by stable IDs and frozen RevisionSets.

Consequences: one repository can be reindexed without corrupting workspace knowledge history; cross-repository compilation has an immutable revision basis; migrations are separately versioned.

