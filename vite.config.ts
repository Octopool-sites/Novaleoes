import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
// VITE_BASE: subpasta de publicação (ex.: "/Novaleoes/" na prévia do GitHub Pages). Padrão "/" (Vercel).
export default defineConfig({base:process.env.VITE_BASE||"/",plugins:[react()],resolve:{alias:{"@":fileURLToPath(new URL(".",import.meta.url))}},build:{outDir:"dist/client",sourcemap:false},server:{host:"127.0.0.1"}});
