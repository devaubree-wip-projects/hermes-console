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
    ".next-e2e/**",
    ".next-build/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Verbatim port of the xulux chat (ux-ui-unified). Upstream lints clean under
    // eslint-config-next 16.1.7, which does not enforce these react-hooks v6 rules;
    // keep the ported code unmodified rather than diverging from upstream.
    files: [
      "src/components/shared/chat/**",
      "src/components/v1-xulux/**",
      "src/lib/shared/chat/**",
    ],
    rules: {
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
