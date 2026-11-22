import tseslint from "@typescript-eslint/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  { ignores: ["dist"] },
  ...tseslint.configs["flat/recommended"],
  reactHooks.configs.flat.recommended,
  reactRefresh.configs.vite,
];
