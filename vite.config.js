import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" обязателен — Capacitor грузит файлы по file://
export default defineConfig({
  plugins: [react()],
  base: "./",
});
