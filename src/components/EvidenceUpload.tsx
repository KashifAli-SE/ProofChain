'use client';

import { useRef, useState } from 'react';

interface EvidenceUploadProps {
  batchId: string;
  onUploaded: () => void;
}

export function EvidenceUpload({ batchId, onUploaded }: EvidenceUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    setSuccess(null);

    let uploaded = 0;
    let failed = 0;

    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append('file', file);

      try {
        const res = await fetch(`/api/batches/${batchId}/evidence`, {
          method: 'POST',
          body: form,
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          failed++;
          setError(`${file.name}: ${json.error?.message ?? 'Upload failed'}`);
        } else {
          uploaded++;
        }
      } catch {
        failed++;
        setError(`Network error uploading ${file.name}`);
      }
    }

    setUploading(false);
    if (uploaded > 0) {
      setSuccess(`${uploaded} file${uploaded > 1 ? 's' : ''} uploaded`);
      onUploaded();
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="mt-4">
      <div
        className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 px-6 py-8 text-center hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleFiles(e.dataTransfer.files);
        }}
      >
        <svg
          className="mx-auto mb-2 h-8 w-8 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </svg>
        <p className="text-sm font-medium text-gray-700">
          {uploading ? 'Uploading…' : 'Click to upload or drag and drop'}
        </p>
        <p className="mt-1 text-xs text-gray-500">PDF or plain text · max 10 MB each · multiple files allowed</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt,application/pdf,text/plain"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
      {success && !error && (
        <p className="mt-2 text-sm text-green-600">✓ {success}</p>
      )}
    </div>
  );
}
