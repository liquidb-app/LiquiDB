const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      "out/**",
      "dist/**",
      "build/**",
      "node_modules/**",
      "*.tsbuildinfo",
      "electron/dist/**",
      "electron-dist/**",
      "helper-dist/**",
      "next-env.d.ts",
      "eslint.config.js",
      "postcss.config.js",
    ],
  },
  {
    rules: {
      "react/no-unescaped-entities": ["warn", {
        "forbid": [">", "}", '"', "'"]
      }],
      "@typescript-eslint/no-explicit-any": ["error", {
        "ignoreRestArgs": true,
        "fixToUnknown": false
      }],
      "@typescript-eslint/no-unused-vars": ["warn", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_",
        "ignoreRestSiblings": true
      }],
      "@next/next/no-img-element": "off",
    },
  },
  {
    files: ["electron/**/*.{js,ts,tsx}", "helper/**/*.{js,ts,tsx}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

module.exports = eslintConfig;

