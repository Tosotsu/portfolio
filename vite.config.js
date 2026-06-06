import { defineConfig } from 'vite';

export default defineConfig({
  // Tell Vite to treat .glsl files as raw strings (imported with ?raw suffix)
  // This lets us write shaders as separate files instead of template strings
  assetsInclude: ['**/*.glsl'],

  build: {
    // Increase chunk size warning limit — particle data arrays are large
    chunkSizeWarningLimit: 2000,
  },

  server: {
    // Open browser automatically on dev start
    open: true,
  },
});
