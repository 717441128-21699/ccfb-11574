import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  worker: {
    format: 'es',
  },
  server: {
    watch: {
      // 浏览器自动化配置目录等不应触发监听
      ignored: ['**/.chrome-tmp/**'],
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
