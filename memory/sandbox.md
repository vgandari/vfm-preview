---
name: sandbox-limits
description: Things the Claude sandbox blocks in this project
metadata:
  type: reference
---

Headless Chrome fails with a Mach port permission error, so no screenshots/PDF; VS Code cannot launch either. `git init`
needed the user to run it (hooks/config writes were blocked at first). Manual tests are in docs/MANUAL_TESTS.md.
