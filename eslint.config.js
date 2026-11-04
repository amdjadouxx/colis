/**
 * Configuration ESLint.
 *
 * Volontairement courte : le typage JSDoc verifie deja les contrats, et les
 * tests verifient le comportement. Le linter ne sert ici qu a ce que ni l un
 * ni l autre ne couvre — variables mortes, promesses oubliees, egalites
 * laches, et code injoignable.
 */

export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      // 2025 pour les attributs d import (`with { type: "json" }`).
      ecmaVersion: 2025,
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        globalThis: "readonly",
        document: "readonly",
        window: "readonly",
        fetch: "readonly",
        WebSocket: "readonly",
        Request: "readonly",
        Response: "readonly",
        URL: "readonly",
        DOMParser: "readonly",
        setTimeout: "readonly",
        navigator: "readonly",
        Buffer: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-fallthrough": "error",
      "no-unreachable": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-self-compare": "error",
      "no-template-curly-in-string": "error",
      "require-atomic-updates": "error",
      eqeqeq: ["error", "smart"],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  {
    // Fichiers generes : la source de verite est packages/.
    ignores: ["**/engine.bundle.js", "**/injected.js", "apps/web/**", "node_modules/**"],
  },
];
