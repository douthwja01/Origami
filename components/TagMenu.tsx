"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { isKindTagKey, parseTagName, tagKey } from "@/lib/tag-utils";
import type { TagDTO } from "@/lib/types";

export function TagChips({
  tags,
  onTagClick,
  compact,
}: {
  tags: TagDTO[];
  onTagClick?: (tag: TagDTO) => void;
  compact?: boolean;
}) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-0.5">
      {tags.map((tag) =>
        onTagClick ? (
          <button
            key={tag.id}
            type="button"
            title={tag.required ? "Required from file type" : tag.name}
            onClick={(event) => {
              event.stopPropagation();
              onTagClick(tag);
            }}
            className={`badge ${tag.required ? "badge-required" : ""} ${
              compact ? "" : "badge-lg"
            }`}
          >
            {tag.name}
          </button>
        ) : (
          <span
            key={tag.id}
            className={`badge ${tag.required ? "badge-required" : ""} ${
              compact ? "" : "badge-lg"
            }`}
          >
            {tag.name}
          </span>
        ),
      )}
    </div>
  );
}

type Props = {
  x: number;
  y: number;
  assigned: TagDTO[];
  catalog: TagDTO[];
  onSetNames: (names: string[]) => Promise<void>;
  onClose: () => void;
  onNewFolder?: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
};

export function TagContextMenu({
  x,
  y,
  assigned,
  catalog,
  onSetNames,
  onClose,
  onNewFolder,
  onDownload,
  onDelete,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const node = menuRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const left = Math.min(x, Math.max(8, window.innerWidth - rect.width - 8));
    const top = Math.min(y, Math.max(8, window.innerHeight - rect.height - 8));
    setPos({ left, top });
  }, [x, y]);

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function onPointer(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [onClose]);

  const assignedKeys = useMemo(
    () => new Set(assigned.map((tag) => tag.key)),
    [assigned],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = (catalog.length > 0 ? catalog : assigned).filter(
      (tag) => !tag.required || assignedKeys.has(tag.key),
    );
    const list = q
      ? pool.filter(
          (tag) =>
            tag.name.toLowerCase().includes(q) || tag.key.includes(q),
        )
      : pool;
    return [...list].sort((a, b) => {
      const aOn = assignedKeys.has(a.key) ? 0 : 1;
      const bOn = assignedKeys.has(b.key) ? 0 : 1;
      if (aOn !== bOn) return aOn - bOn;
      return a.key.localeCompare(b.key);
    });
  }, [assigned, assignedKeys, catalog, query]);

  const createName = parseTagName(query);
  const canCreate =
    Boolean(createName) &&
    !isKindTagKey(tagKey(createName!)) &&
    !catalog.some((tag) => tag.key === tagKey(createName!)) &&
    !assigned.some((tag) => tag.key === tagKey(createName!));

  async function setNames(names: string[]) {
    setBusy(true);
    try {
      await onSetNames(names);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(tag: TagDTO) {
    if (tag.required && assignedKeys.has(tag.key)) return;
    const next = assignedKeys.has(tag.key)
      ? assigned.filter((item) => item.key !== tag.key).map((item) => item.name)
      : [...assigned.map((item) => item.name), tag.name];
    await setNames(next);
  }

  async function create() {
    if (!createName) return;
    await setNames([...assigned.map((item) => item.name), createName]);
    setQuery("");
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-[60] w-64 overflow-hidden rounded-lg border border-line bg-raised shadow-2xl"
    >
      <div className="border-b border-line p-2">
        <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted">
          Tags
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canCreate) void create();
            else if (filtered[0]) void toggle(filtered[0]);
          }}
        >
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search or create…"
            className="w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-[13px] outline-none focus:border-accent"
          />
        </form>
      </div>
      <div className="max-h-56 overflow-auto py-1">
        {filtered.length === 0 && !canCreate ? (
          <p className="px-3 py-2 text-[12px] text-muted">
            {query.trim() ? "No matching tags" : "No tags yet"}
          </p>
        ) : (
          filtered.map((tag) => {
            const on = assignedKeys.has(tag.key);
            const locked = tag.required && on;
            return (
              <button
                key={tag.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                disabled={busy || locked}
                title={locked ? "Required from file type" : tag.name}
                onClick={() => void toggle(tag)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-overlay disabled:opacity-50"
              >
                <span
                  className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${
                    on ? "border-accent bg-accent text-canvas" : "border-line"
                  }`}
                >
                  {on ? "✓" : ""}
                </span>
                <span className="min-w-0 truncate">{tag.name}</span>
              </button>
            );
          })
        )}
        {canCreate ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void create()}
            className="flex w-full px-3 py-1.5 text-left text-[13px] text-accent hover:bg-overlay disabled:opacity-50"
          >
            Create “{createName}”
          </button>
        ) : null}
      </div>
      {onNewFolder || onDownload || onDelete ? (
        <div className="border-t border-line py-1">
          {onNewFolder ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onNewFolder();
                onClose();
              }}
              className="flex w-full px-3 py-1.5 text-left text-[13px] hover:bg-overlay"
            >
              New folder
            </button>
          ) : null}
          {onDownload ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onDownload();
                onClose();
              }}
              className="flex w-full px-3 py-1.5 text-left text-[13px] hover:bg-overlay"
            >
              Download
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onDelete();
                onClose();
              }}
              className="flex w-full px-3 py-1.5 text-left text-[13px] text-accent hover:bg-overlay"
            >
              Delete
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
