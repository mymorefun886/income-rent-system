module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
  ],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18' } },
  rules: {
    'react/react-in-jsx-scope': 'off',
    "react/prop-types": "off",
    "no-unused-vars": "off",
    "no-empty": "off",
    "no-irregular-whitespace": "off",
    "react/no-unescaped-entities": "off",
  },
  overrides: [
    {
      files: ["backend/**/*.js"],
      rules: {
        "no-undef": "off",
        "no-unused-vars": "off",
        "no-useless-escape": "off",
        "no-constant-condition": "off",
      },
    },
    {
      files: ["src/components/ui/command.jsx"],
      rules: { "react/no-unknown-property": "off" },
    },
  ],
};
