# Remaining dependency PR fixes

The AJV override previously replaced ESLint's AJV 6 dependency with AJV 8,
causing `defaultMeta` crashes. Constrain the patched AJV override to major 6.
Reproduction: `pnpm lint` failed before this change and exits successfully
afterward, retaining two existing React hook warnings.

This shared fix is carried only on the five remaining dependency PR branches.
Each branch documents its dependency-specific changes and validation below.

## PR #23

Align plugin and parser at 8.57.1 for supported TypeScript 5.8/5.9 tooling.

Frozen install, lint, typecheck, all 38 tests, and production build pass.
Existing React hook warnings remain. Human visual checks were not performed.
