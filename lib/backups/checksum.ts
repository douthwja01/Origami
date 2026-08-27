import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { assetTags, assets, projects, tags } from "@/lib/db/schema";
import { absoluteFromStorage, hashFileSha256 } from "@/lib/vault/vault";

const PAYLOAD_VERSION = "origami-project-v1";
const HASH_CONCURRENCY = 4;

type ProjectMeta = {
  code: string;
  title: string;
  startDate: string;
  status: string;
  parentId: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
};

type AssetFingerprint = {
  id: string;
  kind: string;
  filename: string;
  sizeBytes: number;
  contentHash: string;
  tagKeys: string[];
};

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index]);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Streaming SHA-256 of a project's metadata and vault files, used to decide backups. */
export class ProjectChecksum {
  private value: string | null = null;

  private constructor(
    private readonly meta: ProjectMeta,
    private readonly files: Array<typeof assets.$inferSelect>,
  ) {}

  static async forProject(projectId: string): Promise<ProjectChecksum> {
    const db = getDb();
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) {
      throw Object.assign(new Error("Project not found"), { status: 404 });
    }
    const fileRows = await db
      .select()
      .from(assets)
      .where(eq(assets.projectId, projectId));
    return new ProjectChecksum(
      {
        code: project.code,
        title: project.title,
        startDate: project.startDate,
        status: project.status,
        parentId: project.parentId,
        githubUrl: project.githubUrl,
        websiteUrl: project.websiteUrl,
      },
      fileRows,
    );
  }

  static digest(meta: ProjectMeta, fingerprints: AssetFingerprint[]): string {
    const lines = [
      PAYLOAD_VERSION,
      `code:${meta.code}`,
      `title:${meta.title}`,
      `startDate:${meta.startDate}`,
      `status:${meta.status}`,
      `parentId:${meta.parentId ?? ""}`,
      `githubUrl:${meta.githubUrl ?? ""}`,
      `websiteUrl:${meta.websiteUrl ?? ""}`,
      "assets:",
    ];
    const sorted = [...fingerprints].sort((a, b) => a.id.localeCompare(b.id));
    for (const file of sorted) {
      lines.push(
        `${file.id}\t${file.kind}\t${file.filename}\t${file.sizeBytes}\t${file.contentHash}\t${file.tagKeys.join(",")}`,
      );
    }
    return sha256Text(`${lines.join("\n")}\n`);
  }

  async evaluate(): Promise<string> {
    if (this.value) return this.value;
    const db = getDb();
    await mapPool(this.files, HASH_CONCURRENCY, async (row) => {
      if (row.contentHash) return;
      try {
        const digest = await hashFileSha256(absoluteFromStorage(row.storagePath));
        await db
          .update(assets)
          .set({ contentHash: digest })
          .where(eq(assets.id, row.id));
        row.contentHash = digest;
      } catch {
        row.contentHash = "";
      }
    });
    const tagMap = new Map<string, string[]>();
    if (this.files.length > 0) {
      const tagRows = await db
        .select({
          assetId: assetTags.assetId,
          key: tags.key,
        })
        .from(assetTags)
        .innerJoin(tags, eq(assetTags.tagId, tags.id))
        .where(
          inArray(
            assetTags.assetId,
            this.files.map((row) => row.id),
          ),
        );
      for (const row of tagRows) {
        const list = tagMap.get(row.assetId) ?? [];
        list.push(row.key);
        tagMap.set(row.assetId, list);
      }
      for (const list of tagMap.values()) list.sort();
    }
    this.value = ProjectChecksum.digest(
      this.meta,
      this.files.map((row) => ({
        id: row.id,
        kind: row.kind,
        filename: row.filename,
        sizeBytes: Number(row.sizeBytes),
        contentHash: row.contentHash || "",
        tagKeys: tagMap.get(row.id) ?? [],
      })),
    );
    return this.value;
  }

  async differsFrom(previous: string | null | undefined): Promise<boolean> {
    return (await this.evaluate()) !== (previous ?? null);
  }
}
