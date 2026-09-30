import { defineConfig, mergeConfig } from 'vite';
import baseConfig from './vite.config';

// Dev-server settings used only inside the cluster by Tilt (frontend/Dockerfile.dev).
// It plays the role nginx plays in production: listen on 8080 and forward /v1 to
// the API Service, adding the API key from the API_KEY env var (filled from the Secret).
export default mergeConfig(
  baseConfig,
  defineConfig({
    server: {
      host: '0.0.0.0',
      port: 8080,
      strictPort: true,
      // Vite rejects unknown Host headers by default; allow the cluster's names
      allowedHosts: true,
      proxy: {
        '/v1': {
          target: 'http://openfx-api:80',
          headers: { 'X-API-Key': process.env.API_KEY ?? '' },
        },
      },
    },
  }),
);
