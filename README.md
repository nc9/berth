# berth

A registry and SDK for container and sandbox providers. It does for compute what pi-ai does for LLMs: one list of providers, their container types and their prices, plus one interface to create and drive a sandbox on any of them.

- **Catalog:** providers (name, logo, website, description), container types (vCPU, memory, disk, GPU, OS, arch, regions, isolation), capabilities (snapshots, pause and resume, egress controls, lifetime limits) and dated, sourced prices per unit of container time.
- **SDK:** one `Provider` interface (create, exec detached, logs by offset, files, describe, destroy; optional pause, resume and snapshot), with one adapter package per provider.
- **Conformance:** one test suite every adapter must pass.

Policy stays with the consumer. Trust tiers, ownership rules, egress mapping and ceilings belong to the products that use berth (Longshore, Turntable). berth reports facts and carries out requests.

Status: design. See [DESIGN.md](DESIGN.md).

Licence: MIT.
