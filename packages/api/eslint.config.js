module.exports = [
  {
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "commonjs",
      globals: {
        require: "readonly",
        module: "readonly",
        process: "readonly",
        console: "readonly",
        __dirname: "readonly"
      }
    },
    rules: {
  "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
  "no-console": "off"
}
  }
];