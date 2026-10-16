import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    // npm run launch-check runs only scripts/launch-check.test.ts (issue #18).
    include:
      process.env.LAUNCH_CHECK === "1" ? ["scripts/launch-check.test.ts"] : ["lib/**/*.test.ts", "scripts/__tests__/*.test.ts"],
    environment: "node",
  },
});
