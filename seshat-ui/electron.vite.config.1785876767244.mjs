// electron.vite.config.ts
import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import UnoCSS from "unocss/vite";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: "src/renderer",
    publicDir: resolve("public"),
    build: {
      rollupOptions: {
        input: resolve("src/renderer/index.html")
      }
    },
    resolve: {
      alias: {
        "@": resolve("src/renderer")
      }
    },
    plugins: [UnoCSS(), react()]
  }
});
export {
  electron_vite_config_default as default
};
