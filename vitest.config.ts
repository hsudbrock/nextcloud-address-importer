import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Fast checks only: Dockerized integration tests live under
    // test/integration and run via `npm run test:integration:nextcloud`.
    exclude: ["dist/**", "node_modules/**", "test/integration/**"],
  },
});
