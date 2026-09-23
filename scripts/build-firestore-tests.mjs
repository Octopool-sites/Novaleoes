import { build } from "esbuild";
for (const name of ["store", "inventory", "handler"]) {
  await build({ entryPoints: [`server/${name}.ts`], outfile: `outputs/test-firestore-${name}.mjs`, bundle: true, platform: "node", format: "esm", packages: "external", target: "node22" });
}
