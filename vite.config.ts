import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: './src/card-entry.tsx',
      name: 'DualControllerCard',
      formats: ['iife'],
      fileName: () => 'dual-axis-controller-v4.js',
    },
    rollupOptions: {
      // We want React bundled directly into the file so HACS doesn't complain about missing external dependencies
      external: [], 
    },
  },
  // Ensure the React process sets the environment appropriately
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production')
  }
});
