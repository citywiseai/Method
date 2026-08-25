import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Ported vanilla-JS engine (public/engine.js) intentionally keeps the
    // source Artifact's style (var, function expressions, etc.) rather than
    // being rewritten to satisfy this project's TypeScript lint rules.
    "public/**",
    // Plain CJS/Node scripts, not part of the Next.js app bundle.
    "scripts/**",
    "tests/**",
  ]),
]);

export default eslintConfig;
