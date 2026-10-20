# Remaining dependency PR fixes

The AJV override previously replaced ESLint's AJV 6 dependency with AJV 8,
causing `defaultMeta` crashes. Constrain the patched AJV override to major 6.
Reproduction: `pnpm lint` failed before this change and exits successfully
afterward, retaining two existing React hook warnings.

This shared fix is carried only on the five remaining dependency PR branches.
Each branch documents its dependency-specific changes and validation below.
