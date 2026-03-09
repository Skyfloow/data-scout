import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  envDir: '../',
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('echarts')) return 'vendor-echarts';
          if (id.includes('@reduxjs') || id.includes('react-redux')) return 'vendor-redux';
          if (id.includes('i18next')) return 'vendor-i18n';
          if (id.includes('@radix-ui') || id.includes('lucide-react') || id.includes('class-variance-authority')) return 'vendor-ui';
          if (id.includes('react-router')) return 'vendor-router';
        },
      },
    },
  },
});
