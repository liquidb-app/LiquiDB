const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: __dirname,
});

// Try to load TypeScript parser and plugins if available
let tsParser = null;
let tsPlugin = null;
let reactHooksPlugin = null;
try {
  tsParser = require("@typescript-eslint/parser");
  tsPlugin = require("@typescript-eslint/eslint-plugin");
} catch (e) {
  // Parser/plugin not available
}
try {
  reactHooksPlugin = require("eslint-plugin-react-hooks");
} catch (e) {
  // Plugin not available
}

// Load Next.js configs - handle circular reference issues
let nextConfigs = [];
let hasNextConfigs = false;
try {
  nextConfigs = compat.extends("next/core-web-vitals", "next/typescript");
  hasNextConfigs = true;
} catch (error) {
  // If loading fails, we'll skip Next.js-specific rules
  // This is expected due to circular reference issues with FlatCompat
  nextConfigs = [];
}

const eslintConfig = [
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
  ...nextConfigs,
  // Configure TypeScript parser and plugins for .ts and .tsx files
  ...(tsParser ? [{
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        project: "./tsconfig.json",
      },
    },
    plugins: {
      ...(tsPlugin ? { "@typescript-eslint": tsPlugin } : {}),
      ...(reactHooksPlugin ? { "react-hooks": reactHooksPlugin } : {}),
    },
  }] : []),
  {
    rules: {
      ...(hasNextConfigs && {
        "react/no-unescaped-entities": ["warn", {
          "forbid": [">", "}", '"', "'"]
        }],
        "@next/next/no-img-element": "off",
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
      }),
    },
  },
  {
    files: ["electron/**/*.{js,ts,tsx}", "helper/**/*.{js,ts,tsx}"],
    rules: hasNextConfigs ? {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
    } : {},
  },
];

module.exports = eslintConfig;

