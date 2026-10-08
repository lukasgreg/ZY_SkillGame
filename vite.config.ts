import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Served from https://lukasgreg.github.io/ZY_SkillGame/
export default defineConfig({
  base: '/ZY_SkillGame/',
  plugins: [preact()],
  test: { environment: 'node' },
} as never);
