"use client";

import { useEffect, useState } from "react";
import hljs from "highlight.js";
import { marked } from "marked";
import { languageFromFilename } from "@/lib/vault/kinds";
import "highlight.js/styles/github-dark.css";

export function CodeViewer({
  url,
  filename,
  markdown,
}: {
  url: string;
  filename: string;
  markdown: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const [html, setHtml] = useState<string>("");
  const [mode, setMode] = useState<"preview" | "source">(markdown ? "preview" : "source");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load file");
        return res.text();
      })
      .then(async (value) => {
        if (cancelled) return;
        setText(value);
        if (markdown) {
          setHtml(await marked.parse(value));
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [url, markdown]);

  if (error) return <p className="p-4 text-[13px] text-accent">{error}</p>;
  if (text === null) return <p className="p-4 text-[13px] text-muted">Loading file…</p>;

  const highlighted = hljs.highlight(text, {
    language: hljs.getLanguage(languageFromFilename(filename))
      ? languageFromFilename(filename)
      : "plaintext",
    ignoreIllegals: true,
  }).value;

  return (
    <div>
      {markdown ? (
        <div className="flex gap-2 border-b border-line px-3 py-2 text-[12px]">
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={mode === "preview" ? "text-ink" : "text-muted"}
          >
            Preview
          </button>
          <button
            type="button"
            onClick={() => setMode("source")}
            className={mode === "source" ? "text-ink" : "text-muted"}
          >
            Source
          </button>
        </div>
      ) : null}
      {markdown && mode === "preview" ? (
        <div
          className="markdown-body px-5 py-4"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-auto p-4 text-[12px] leading-relaxed">
          <code
            className="hljs"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </pre>
      )}
    </div>
  );
}
