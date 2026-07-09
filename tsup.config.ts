import { defineConfig } from 'tsup';

// Dual ESM + CJS build so both `import` and `require` consumers work.
// `@temporalio/worker` is a peer dependency and is intentionally NOT bundled.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2021',
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
});
