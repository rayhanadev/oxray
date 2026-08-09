import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function createTemporaryProjects(prefix: string, packageJson: string) {
  const directories: string[] = [];

  return {
    async create(): Promise<string> {
      const directory = await mkdtemp(join(tmpdir(), prefix));
      directories.push(directory);
      await Bun.write(join(directory, "package.json"), packageJson);
      return directory;
    },
    async cleanup(): Promise<void> {
      await Promise.all(
        directories.splice(0).map((directory) => rm(directory, { recursive: true })),
      );
    },
  };
}
