import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Honour an assigned PORT (tooling may pick one when 3000 is taken); default stays 3000.
    port: Number(process.env.PORT) || 3000,
    open: true
  }
});
