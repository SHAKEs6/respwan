import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  plugins: [react(), tailwindcss()],
  test: { environment: 'jsdom', include: ['src/**/*.test.ts'] },
});
