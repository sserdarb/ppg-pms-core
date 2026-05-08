import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/schema/index.ts', 'src/push-schema.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
});
