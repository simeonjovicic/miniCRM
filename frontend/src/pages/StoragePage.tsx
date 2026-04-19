import { useEffect, useState, useRef } from "react";
import { storageApi, type StorageFile } from "../services/api";

function getFileType(name: string): "image" | "video" | "audio" | "pdf" | "text" | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "avi", "mkv"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  if (["txt", "md", "json", "csv", "xml", "html", "css", "js", "ts", "tsx", "jsx", "py", "sh", "yml", "yaml", "toml", "ini", "cfg", "log", "env", "sql"].includes(ext)) return "text";
  return null;
}

function FilePreviewModal({ file, path, onClose }: { file: StorageFile; path: string; onClose: () => void }) {
  const filePath = path ? `${path}/${file.name}` : file.name;
  const url = storageApi.previewUrl(filePath);
  const downloadLink = storageApi.downloadUrl(filePath);
  const type = getFileType(file.name);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);

  useEffect(() => {
    if (type === "text") {
      setTextLoading(true);
      fetch(url)
        .then((r) => r.text())
        .then(setTextContent)
        .catch(() => setTextContent("Fehler beim Laden der Datei."))
        .finally(() => setTextLoading(false));
    }
  }, [url, type]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 flex flex-col items-center max-w-[90vw] max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-3 flex items-center gap-3 glass rounded-xl px-4 py-2">
          <span className="text-[13px] font-medium text-text-bright">{file.name}</span>
          <a
            href={downloadLink}
            download
            className="rounded-lg p-1 text-accent hover:bg-accent-light transition-all"
            title="Download"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          </a>
          <button onClick={onClose} className="rounded-lg p-1 text-text-secondary hover:text-text-bright transition-all">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="glass rounded-2xl overflow-hidden">
          {type === "image" && (
            <img src={url} alt={file.name} className="max-w-[85vw] max-h-[75vh] object-contain" />
          )}
          {type === "video" && (
            <video src={url} controls autoPlay className="max-w-[85vw] max-h-[75vh]" />
          )}
          {type === "audio" && (
            <div className="px-8 py-6">
              <audio src={url} controls autoPlay className="w-[400px]" />
            </div>
          )}
          {type === "pdf" && (
            <iframe src={url} className="w-[80vw] h-[75vh] bg-white" title={file.name} />
          )}
          {type === "text" && (
            <div className="w-[70vw] max-h-[75vh] overflow-auto p-5">
              {textLoading ? (
                <span className="text-[13px] text-text-secondary">Laden...</span>
              ) : (
                <pre className="text-[12px] text-text-bright whitespace-pre-wrap break-words font-mono leading-relaxed">
                  {textContent}
                </pre>
              )}
            </div>
          )}
          {!type && (
            <div className="px-8 py-12 text-center">
              <p className="text-[13px] text-text-secondary mb-3">Vorschau nicht verfuegbar</p>
              <a
                href={downloadLink}
                download
                className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-[13px] font-medium text-white"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Herunterladen
              </a>
            </div>
          )}
        </div>

        <p className="mt-2 text-[11px] text-text-secondary">Leertaste oder Esc zum Schliessen</p>
      </div>
    </div>
  );
}

export default function StoragePage() {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Preview
  const [previewFile, setPreviewFile] = useState<StorageFile | null>(null);

  // New folder
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const newFolderRef = useRef<HTMLInputElement>(null);

  // Rename
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  // Upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  function reload() {
    setLoading(true);
    setError("");
    storageApi
      .list(path)
      .then(setFiles)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
  }, [path]);

  useEffect(() => {
    if (showNewFolder) newFolderRef.current?.focus();
  }, [showNewFolder]);

  useEffect(() => {
    if (renamingFile) renameRef.current?.focus();
  }, [renamingFile]);

  const breadcrumbs = path ? path.split("/").filter(Boolean) : [];

  function navigateTo(folder: string) {
    setPath(path ? `${path}/${folder}` : folder);
  }

  function navigateToBreadcrumb(index: number) {
    setPath(breadcrumbs.slice(0, index + 1).join("/"));
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    try {
      await storageApi.createFolder(path, newFolderName.trim());
      setNewFolderName("");
      setShowNewFolder(false);
      reload();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleRename(oldName: string) {
    if (!renameValue.trim() || renameValue === oldName) {
      setRenamingFile(null);
      return;
    }
    try {
      await storageApi.rename(path, oldName, renameValue.trim());
      setRenamingFile(null);
      reload();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleDelete(file: StorageFile) {
    if (!confirm(`"${file.name}" wirklich loeschen?`)) return;
    try {
      await storageApi.delete(path, file.name);
      reload();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = e.target.files;
    if (!selectedFiles?.length) return;
    setUploading(true);
    setError("");
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        await storageApi.upload(path, selectedFiles[i]);
      }
      reload();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function startRename(file: StorageFile) {
    setRenamingFile(file.name);
    setRenameValue(file.name);
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  function formatDate(ts: number) {
    return new Date(ts).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function fileIcon(file: StorageFile) {
    if (file.directory) {
      return (
        <svg className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
        </svg>
      );
    }
    return (
      <svg className="h-5 w-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-text-bright">Storage</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            Dateien auf dem Server
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Upload button */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn-shimmer flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium text-white disabled:opacity-50 transition-all"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            {uploading ? "Uploading..." : "Upload"}
          </button>
          {/* New folder button */}
          <button
            onClick={() => {
              setShowNewFolder(true);
              setNewFolderName("");
            }}
            className="glass flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium text-text-bright transition-all hover:bg-white/70"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
            Neuer Ordner
          </button>
        </div>
      </div>

      {/* Breadcrumbs */}
      <div className="mb-4 flex items-center gap-1 text-[13px]">
        <button
          onClick={() => setPath("")}
          className={`rounded px-2 py-1 transition-all ${
            !path
              ? "font-medium text-accent"
              : "text-text-secondary hover:text-text-bright"
          }`}
        >
          hango
        </button>
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="text-text-secondary">/</span>
            <button
              onClick={() => navigateToBreadcrumb(i)}
              className={`rounded px-2 py-1 transition-all ${
                i === breadcrumbs.length - 1
                  ? "font-medium text-accent"
                  : "text-text-secondary hover:text-text-bright"
              }`}
            >
              {crumb}
            </button>
          </span>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-xl border border-status-churned/30 bg-status-churned/10 px-4 py-2.5 text-[13px] text-status-churned">
          {error}
          <button onClick={() => setError("")} className="ml-2 font-medium underline">
            OK
          </button>
        </div>
      )}

      {/* File list */}
      <div className="glass rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[13px] text-text-secondary">
            Laden...
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/40 text-left text-[11px] font-medium uppercase tracking-wider text-text-secondary">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3 w-28">Groesse</th>
                <th className="px-4 py-3 w-44">Geaendert</th>
                <th className="px-4 py-3 w-36"></th>
              </tr>
            </thead>
            <tbody>
              {/* New folder row */}
              {showNewFolder && (
                <tr className="border-b border-white/40 bg-accent/5">
                  <td className="px-4 py-2" colSpan={4}>
                    <div className="flex items-center gap-2">
                      <svg className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                      </svg>
                      <input
                        ref={newFolderRef}
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleCreateFolder();
                          if (e.key === "Escape") setShowNewFolder(false);
                        }}
                        placeholder="Ordnername..."
                        className="glass-input flex-1 rounded-lg px-2.5 py-1 text-[13px] text-text-bright outline-none"
                      />
                      <button
                        onClick={handleCreateFolder}
                        className="rounded-lg bg-accent px-3 py-1 text-[12px] font-medium text-white"
                      >
                        Erstellen
                      </button>
                      <button
                        onClick={() => setShowNewFolder(false)}
                        className="rounded-lg px-3 py-1 text-[12px] font-medium text-text-secondary hover:text-text-bright"
                      >
                        Abbrechen
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {files.length === 0 && !showNewFolder ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-[13px] text-text-secondary">
                    Keine Dateien vorhanden
                  </td>
                </tr>
              ) : (
                files.map((file) => (
                  <tr
                    key={file.name}
                    className="border-b border-white/30 last:border-0 hover:bg-white/40 transition-colors group"
                  >
                    <td className="px-4 py-2.5">
                      {renamingFile === file.name ? (
                        <div className="flex items-center gap-2">
                          {fileIcon(file)}
                          <input
                            ref={renameRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRename(file.name);
                              if (e.key === "Escape") setRenamingFile(null);
                            }}
                            onBlur={() => handleRename(file.name)}
                            className="glass-input flex-1 rounded-lg border-accent! px-2.5 py-0.5 text-[13px] text-text-bright outline-none"
                          />
                        </div>
                      ) : file.directory ? (
                        <button
                          onClick={() => navigateTo(file.name)}
                          className="flex items-center gap-2.5 text-[13px] font-medium text-text-bright hover:text-accent transition-colors"
                        >
                          {fileIcon(file)}
                          {file.name}
                        </button>
                      ) : (
                        <button
                          onClick={() => setPreviewFile(file)}
                          className="flex items-center gap-2.5 text-[13px] text-text-bright hover:text-accent transition-colors cursor-pointer"
                        >
                          {fileIcon(file)}
                          {file.name}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[13px] text-text-secondary">
                      {file.directory ? "\u2014" : formatSize(file.size)}
                    </td>
                    <td className="px-4 py-2.5 text-[13px] text-text-secondary">
                      {formatDate(file.lastModified)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Rename */}
                        <button
                          onClick={() => startRename(file)}
                          title="Umbenennen"
                          className="rounded-lg p-1.5 text-text-secondary hover:bg-border/50 hover:text-text-bright transition-all"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                          </svg>
                        </button>
                        {/* Preview (files only) */}
                        {!file.directory && (
                          <button
                            onClick={() => setPreviewFile(file)}
                            title="Vorschau"
                            className="rounded-lg p-1.5 text-text-secondary hover:bg-border/50 hover:text-text-bright transition-all"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </button>
                        )}
                        {/* Download (files only) */}
                        {!file.directory && (
                          <a
                            href={storageApi.downloadUrl(
                              path ? `${path}/${file.name}` : file.name,
                            )}
                            title="Download"
                            className="rounded-lg p-1.5 text-accent hover:bg-accent-light transition-all"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                          </a>
                        )}
                        {/* Delete */}
                        <button
                          onClick={() => handleDelete(file)}
                          title="Loeschen"
                          className="rounded-lg p-1.5 text-text-secondary hover:bg-status-churned/10 hover:text-status-churned transition-all"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Quick Look preview modal */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          path={path}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}
