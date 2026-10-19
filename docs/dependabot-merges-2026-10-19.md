# Dependabot merge verification — 2026-10-19

Authorized merge set: #15, #16, #17, #18, #20.

#15 (Radix Slot), #16 (Next ESLint config), and #17 (Postgres) merged first.
#18's lockfile then conflicted. Merged current main into its branch and
regenerated the lockfile, keeping PostCSS at the reviewed version 8.5.8.
The resulting lockfile also refreshes PostCSS transitive dependencies and
registry deprecation metadata.

After that resolution, frozen installation, typechecking, all 38 tests, and
production build passed. Lint still fails with the pre-existing AJV/defaultMeta
error. Human visual checks remain outstanding.

#18 was merged. #20 then required resolving a package.json conflict against the
updated main. Kept all previously merged versions and eslint-config-prettier
10.1.8. Its lockfile merged without manual edits. Frozen installation,
typechecking, all 38 tests, and production build passed for the full authorized
set together. Lint retains the same pre-existing failure.

#19, #21, #22, #23, and #24 remain outside the authorized merge set.
