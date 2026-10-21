import { defineConfig } from 'vite';

// base './' — GitHub Pages 하위 경로(/<저장소>/)든 도메인 루트든 dist를 그대로 올리면 된다
export default defineConfig({
  base: './',
});
