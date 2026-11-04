import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // the game imports ../shared (answer matching shared with the race server)
  server: { fs: { allow: [".."] } },
})
