import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmdirSync } from "node:fs";

// OpenNext serializes Next.js dotenv files into the Worker bundle. Production
// credentials belong in Cloudflare secrets, so keep local files out of deployment.
const envFiles = [".env", ".env.local", ...["production", "development", "test"]
  .flatMap((mode) => [`.env.${mode}`, `.env.${mode}.local`])];
const backup = mkdtempSync(".env.worker-backup-");
const moved = [];

try {
  for (const file of envFiles) {
    if (!existsSync(file)) continue;
    renameSync(file, `${backup}/${file}`);
    moved.push(file);
  }

  for (const command of ["opennextjs-cloudflare build", "opennextjs-cloudflare deploy"]) {
    if (command.endsWith(" deploy")) {
      const bundledEnv = readFileSync(".open-next/cloudflare/next-env.mjs", "utf8");
      if (bundledEnv.trim() !== ["production", "development", "test"]
        .map((mode) => `export const ${mode} = {};`).join("\n")) {
        throw new Error("Refusing to upload a Worker bundle containing dotenv values.");
      }
    }
    const result = spawnSync(command, { shell: true, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      break;
    }
  }
} finally {
  for (const file of moved) renameSync(`${backup}/${file}`, file);
  rmdirSync(backup);
}
