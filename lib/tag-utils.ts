import type { TagDTO } from "@/lib/types";

export const TAG_NAME_MAX = 32;
export const TAGS_PER_ITEM_MAX = 20;

export function tagKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function parseTagName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > TAG_NAME_MAX) return null;
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(name)) return null;
  return name;
}

export function parseTagNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw Object.assign(new Error("names must be an array of tag names"), {
      status: 400,
    });
  }
  const seen = new Set<string>();
  const names: string[] = [];
  for (const entry of value) {
    const name = parseTagName(entry);
    if (!name) {
      throw Object.assign(
        new Error(`Each tag must be 1–${TAG_NAME_MAX} characters`),
        { status: 400 },
      );
    }
    const key = tagKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  if (names.length > TAGS_PER_ITEM_MAX) {
    throw Object.assign(
      new Error(`At most ${TAGS_PER_ITEM_MAX} tags per item`),
      { status: 400 },
    );
  }
  return names;
}

export function itemMatchesTagQuery(
  name: string,
  itemTags: TagDTO[],
  query: string,
  tagKeyFilter: string | null,
): boolean {
  if (tagKeyFilter && !itemTags.some((tag) => tag.key === tagKeyFilter)) {
    return false;
  }
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (name.toLowerCase().includes(q)) return true;
  return itemTags.some(
    (tag) => tag.name.toLowerCase().includes(q) || tag.key.includes(q),
  );
}

export function isKindTagKey(key: string): boolean {
  return key === "media" || key === "code" || key === "document" || key === "cad";
}

export function kindTagName(kind: "media" | "code" | "document" | "cad"): string {
  switch (kind) {
    case "media":
      return "Media";
    case "code":
      return "Code";
    case "document":
      return "Documents";
    case "cad":
      return "CAD";
  }
}

export function firstTagSortKey(itemTags: TagDTO[]): string {
  if (itemTags.length === 0) return "\uFFFF";
  return [...itemTags].map((tag) => tag.key).sort()[0];
}
