import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";

import { resolveNodeTypesPackage } from "../src/node-types.ts";
import { inferRuntime, inspectProject } from "../src/project.ts";
import { createTemporaryProjects } from "./temporary-projects.ts";

const temporaryProjects = createTemporaryProjects("oxray-project-test-", '{ "name": "fixture" }\n');

afterEach(async () => {
  await temporaryProjects.cleanup();
});

describe("project detection", () => {
  test("infers Bun from Bun-specific project configuration", async () => {
    const directory = await temporaryProjects.create();
    await Bun.write(join(directory, "bunfig.toml"), "[install]\n");

    expect(await inferRuntime(directory, {})).toBe("bun");
  });

  test("infers Node from a version declaration", async () => {
    const directory = await temporaryProjects.create();
    await Bun.write(join(directory, ".nvmrc"), "22\n");

    expect(await inferRuntime(directory, {})).toBe("node");
  });

  test("leaves conflicting runtime signals for the prompt", async () => {
    const directory = await temporaryProjects.create();
    await Bun.write(join(directory, "bunfig.toml"), "[install]\n");
    await Bun.write(join(directory, ".node-version"), "22\n");

    expect(await inferRuntime(directory, {})).toBeUndefined();
  });

  test("rejects alternate config formats", async () => {
    const directory = await temporaryProjects.create();
    await Bun.write(join(directory, "oxlint.config.ts"), "export default {}\n");

    let message = "";
    try {
      await inspectProject(directory);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("conflicting config files");
  });
});

describe("Node type version resolution", () => {
  test("prefers .node-version over .nvmrc and engines", async () => {
    const directory = await temporaryProjects.create();
    await Bun.write(join(directory, ".node-version"), "v24.3.0\n");
    await Bun.write(join(directory, ".nvmrc"), "22\n");

    expect(await resolveNodeTypesPackage(directory, { engines: { node: "^20.19.0" } })).toBe(
      "@types/node@24",
    );
  });

  test("uses .nvmrc when .node-version is absent", async () => {
    const directory = await temporaryProjects.create();
    await Bun.write(join(directory, ".nvmrc"), "# project runtime\n22.14.0\n");

    expect(await resolveNodeTypesPackage(directory, {})).toBe("@types/node@22");
  });

  test("reuses an engines range when no version file exists", async () => {
    const directory = await temporaryProjects.create();

    expect(
      await resolveNodeTypesPackage(directory, {
        engines: { node: "^20.19.0 || >=22.12.0" },
      }),
    ).toBe("@types/node@^20.19.0 || >=22.12.0");
  });
});
