# Microservices: requirement analysis and future options

**Status: UNDECIDED until instructor rubric is confirmed.** The course mentions Laravel/MVC and microservices, but no verified requirement yet states how many separately deployable services, independent databases or demonstrations are mandatory for Milestone 1.

## Terminology matters

- **MVC:** Pattern organizing HTTP/controller, domain/model, and view/representation responsibilities. Laravel supports MVC.
- **Layered/modular monolith:** One deployed Laravel API with internal auth/movie modules and one persistence boundary. This is the current Milestone 1 architectural direction.
- **Microservices:** Independently runnable/deployable applications owning bounded capabilities, defined service contracts and typically independent data ownership, plus the operational burden of network calls, auth trust, observability and deployment.

**Do not call one Laravel runtime with `/auth` and `/movies` routes "microservices".** Dockerizing a monolith also doesn't automatically make it microservices.

## Proposed future service boundaries (not approved or implemented)

| Potential service | Owns | Dependencies and tradeoffs |
| --- | --- | --- |
| Identity | User identities, credentials/sessions/OAuth later | Other services need verified identity mechanism; complexity in service-to-service auth |
| Movie catalog | TMDB client, cached catalog, provider rankings | Can run independently but adds network hops; cache/data ownership must remain singular |
| Community | Reviews, watchlists, follows later | Needs identity/movie references across service boundaries, event consistency and moderation |

If microservices are compulsory now, hold an architecture checkpoint and select the **minimum acceptable decomposition** before auth/movie features. A possible educational split is an identity service and catalog service behind a gateway or BFF, but this would require explicit session/auth trust, database ownership, ports, CI, local orchestration and deployments. Do not implement it without instructor/team agreement.

## Evaluation questions for instructor

1. Must we run at least two **separately deployable** services, or are distinct Laravel modules acceptable?
2. Is synchronous REST sufficient, or are async events/message queues mandatory?
3. Is shared MySQL allowed, or is database-per-service required?
4. Does the requirement apply in Milestone 1 or only final delivery?
5. What runtime/demo evidence, deployment diagrams and API boundaries are assessed?

## Decision gate

Record written acceptance in a new ADR before splitting runtime and data. Update API contracts, local setup, CI and AGENTS scope at the same time. Until then, document the monolith accurately and don't create pseudo-microservice folders.
