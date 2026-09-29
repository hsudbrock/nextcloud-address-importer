import { defineConfig } from "vitest/config";

// Slower optional job: Dockerized Nextcloud integration tests (issues 06 + 10).
// Run via `npm run test:integration:nextcloud`. Never included in `npm test`.
export default defineConfig({
  test: {
    include: ["test/integration/nextcloud/**/*.integration.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
