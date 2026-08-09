import packageJson from "../package.json" with { type: "json" };
import noTypeErasure from "./rules/no-type-erasure.ts";
import noTypeof from "./rules/no-typeof.ts";

const plugin = {
  meta: {
    name: "rayhanadev",
    version: packageJson.version,
  },
  rules: {
    "no-type-erasure": noTypeErasure,
    "no-typeof": noTypeof,
  },
};

export default plugin;
