import type { AssetKind } from "@/lib/types";

function basename(filename: string): string {
  return filename.replace(/\\/g, "/").split("/").pop() || filename;
}

const MEDIA_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "svg",
  "bmp",
  "ico",
  "tif",
  "tiff",
  "heic",
  "mp4",
  "webm",
  "mov",
  "mkv",
  "avi",
  "m4v",
  "mp3",
  "wav",
  "flac",
  "ogg",
  "m4a",
  "aac",
  "aiff",
]);

const CAD_EXT = new Set([
  "step",
  "stp",
  "iges",
  "igs",
  "stl",
  "obj",
  "dxf",
  "dwg",
  "3dm",
  "fcstd",
  "f3d",
  "ipt",
  "iam",
  "sldprt",
  "sldasm",
  "prt",
  "asm",
  "catpart",
  "catproduct",
  "x_t",
  "x_b",
  "brep",
  "glb",
  "gltf",
  "3mf",
  "fbx",
  "sat",
  "sab",
]);

const DOC_EXT = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "odt",
  "ods",
  "odp",
  "rtf",
  "txt",
  "md",
  "markdown",
  "csv",
  "pages",
  "numbers",
  "key",
  "epub",
]);

const CODE_EXT = new Set([
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "py",
  "rs",
  "go",
  "c",
  "h",
  "cpp",
  "hpp",
  "cc",
  "cs",
  "java",
  "kt",
  "kts",
  "swift",
  "rb",
  "php",
  "sh",
  "bash",
  "zsh",
  "ps1",
  "sql",
  "html",
  "htm",
  "css",
  "scss",
  "sass",
  "less",
  "json",
  "jsonc",
  "yaml",
  "yml",
  "toml",
  "xml",
  "graphql",
  "gql",
  "lock",
  "gradle",
  "cmake",
  "mk",
  "gitignore",
  "dockerignore",
  "editorconfig",
  "env",
  "ini",
  "cfg",
  "conf",
  "vue",
  "svelte",
  "lua",
  "r",
  "m",
  "mm",
  "scala",
  "clj",
  "ex",
  "exs",
  "erl",
  "hs",
  "zig",
  "nim",
  "dart",
  "proto",
]);

const BACKUP_EXT = new Set(["zip", "rar", "7z", "tar", "gz", "tgz"]);

const CODE_NAMES = new Set([
  "makefile",
  "dockerfile",
  "cmakelists.txt",
  "license",
  "procfile",
  "gemfile",
  "rakefile",
  "vagrantfile",
]);

export function extensionOf(filename: string): string {
  const base = basename(filename).toLowerCase();
  const parts = base.split(".");
  if (parts.length < 2) return "";
  if (base.endsWith(".tar.gz")) return "tar";
  return parts.at(-1) ?? "";
}

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  ts: "text/plain",
  tsx: "text/plain",
  jsx: "text/javascript",
  py: "text/x-python",
  rs: "text/plain",
  go: "text/plain",
  xml: "application/xml",
  yaml: "text/yaml",
  yml: "text/yaml",
  stl: "model/stl",
  obj: "model/obj",
  step: "application/step",
  stp: "application/step",
  dxf: "image/vnd.dxf",
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
  tar: "application/x-tar",
  gz: "application/gzip",
  tgz: "application/gzip",
};

export function mimeFromFilename(filename: string): string {
  const ext = extensionOf(filename);
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

export function inferKind(filename: string): AssetKind {
  const base = basename(filename).toLowerCase();
  if (CODE_NAMES.has(base)) return "code";
  const ext = extensionOf(filename);
  if (MEDIA_EXT.has(ext)) return "media";
  if (CAD_EXT.has(ext)) return "cad";
  if (BACKUP_EXT.has(ext)) return "backup";
  if (CODE_EXT.has(ext)) return "code";
  if (DOC_EXT.has(ext)) return "document";
  return "document";
}

export function isPreviewableImage(mime: string, filename: string): boolean {
  if (mime.startsWith("image/") && mime !== "image/heic" && mime !== "image/tiff") {
    return true;
  }
  const ext = extensionOf(filename);
  return ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp", "ico"].includes(
    ext,
  );
}

export function isPreviewableVideo(mime: string, filename: string): boolean {
  if (mime.startsWith("video/")) return true;
  return ["mp4", "webm", "ogg", "mov", "m4v"].includes(extensionOf(filename));
}

export function isPreviewableAudio(mime: string, filename: string): boolean {
  if (mime.startsWith("audio/")) return true;
  return ["mp3", "wav", "ogg", "flac", "m4a", "aac"].includes(extensionOf(filename));
}

export function isPdf(mime: string, filename: string): boolean {
  return mime === "application/pdf" || extensionOf(filename) === "pdf";
}

export function isTextLike(mime: string, filename: string): boolean {
  if (mime.startsWith("text/")) return true;
  const ext = extensionOf(filename);
  return (
    CODE_EXT.has(ext) &&
    !["zip", "tar", "gz", "tgz", "7z", "rar"].includes(ext)
  ) || ["md", "markdown", "txt", "csv", "json", "xml", "yml", "yaml"].includes(ext);
}

export function isMarkdown(filename: string): boolean {
  return ["md", "markdown"].includes(extensionOf(filename));
}

export function isStlOrObj(filename: string): boolean {
  return ["stl", "obj"].includes(extensionOf(filename));
}

export function isArchive(filename: string): boolean {
  return BACKUP_EXT.has(extensionOf(filename));
}

export function languageFromFilename(filename: string): string {
  const ext = extensionOf(filename);
  const map: Record<string, string> = {
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    ts: "typescript",
    tsx: "typescript",
    jsx: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    c: "c",
    h: "c",
    cpp: "cpp",
    hpp: "cpp",
    cc: "cpp",
    cs: "csharp",
    java: "java",
    kt: "kotlin",
    rb: "ruby",
    php: "php",
    sh: "bash",
    bash: "bash",
    ps1: "powershell",
    sql: "sql",
    html: "xml",
    htm: "xml",
    css: "css",
    scss: "scss",
    json: "json",
    jsonc: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "ini",
    xml: "xml",
    md: "markdown",
    markdown: "markdown",
    txt: "plaintext",
    csv: "plaintext",
    dockerfile: "dockerfile",
  };
  const base = basename(filename).toLowerCase();
  if (base === "dockerfile") return "dockerfile";
  if (base === "makefile") return "makefile";
  return map[ext] ?? "plaintext";
}
