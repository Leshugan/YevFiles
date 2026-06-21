import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "leshugan.fm",
  appName: "YevFiles",
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
};

export default config;
