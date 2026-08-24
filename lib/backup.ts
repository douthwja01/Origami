import { spawn } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { assets, projects } from "@/lib/db/schema";
import { vaultRoot } from "@/lib/vault";

export async function backupStats() {
  const db = getDb();
  const [projectRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projects);
  const [assetRow] = await db
    .select({
      count: sql<number>`count(*)::int`,
      bytes: sql<number>`coalesce(sum(${assets.sizeBytes}), 0)::bigint`,
    })
    .from(assets);
  return {
    projectCount: Number(projectRow?.count ?? 0),
    assetCount: Number(assetRow?.count ?? 0),
    vaultBytes: Number(assetRow?.bytes ?? 0),
  };
}

async function backupManifest() {
  const db = getDb();
  const projectRows = await db.select().from(projects);
  const assetRows = await db.select().from(assets);
  return {
    version: 1,
    app: "origami",
    createdAt: new Date().toISOString(),
    vaultEntry: path.basename(vaultRoot()),
    projects: projectRows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    assets: assetRows.map((row) => ({
      ...row,
      sizeBytes: Number(row.sizeBytes),
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export async function createBackupStream(): Promise<{
  stream: Readable;
  filename: string;
}> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `origami-backup-${stamp}.tar.gz`;
  const tmp = await mkdtemp(path.join(tmpdir(), "origami-backup-"));
  const manifestName = "origami-backup.json";
  await writeFile(
    path.join(tmp, manifestName),
    `${JSON.stringify(await backupManifest(), null, 2)}\n`,
  );

  const vault = vaultRoot();
  let vaultExists = false;
  try {
    await access(vault);
    vaultExists = true;
  } catch {
    vaultExists = false;
  }

  const args = ["-c", "-z", "-f", "-", "-C", tmp, manifestName];
  if (vaultExists) {
    args.push("-C", path.dirname(vault), path.basename(vault));
  }

  const child = spawn("tar", args, { windowsHide: true });
  const cleanup = () => {
    void rm(tmp, { recursive: true, force: true });
  };
  child.on("close", cleanup);
  child.on("error", cleanup);

  await new Promise<void>((resolve, reject) => {
    child.once("spawn", () => resolve());
    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
  });

  if (!child.stdout) {
    cleanup();
    throw new Error("Failed to start backup");
  }

  return { stream: child.stdout, filename };
}
