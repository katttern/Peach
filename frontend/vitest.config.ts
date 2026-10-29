import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Pin the zone so DST and UTC-conversion expectations hold on any machine.
    env: { TZ: "Europe/Kyiv" },
  },
});
