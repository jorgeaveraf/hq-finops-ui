import { useRef, useState, type DragEvent } from 'react'
import { Paperclip, Upload, X } from 'lucide-react'
import clsx from 'clsx'

type FileUploadProps = {
  label: string
  description?: string
  files: File[]
  onChange: (files: File[]) => void
  required?: boolean
  accept?: string
  hidden?: boolean
}

export function FileUpload({ label, description, files, onChange, required, accept, hidden }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleSelect = (fileList: FileList | null) => {
    if (!fileList) return
    const next = [...files, ...Array.from(fileList)]
    onChange(next)
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    handleSelect(e.dataTransfer?.files ?? null)
  }

  return (
    <div className={clsx(hidden && 'hidden')}>
      <p className="label mb-2">{label}</p>
      <div
        data-testid="file-upload-dropzone"
        className={clsx(
          'border-2 border-dashed border-slate-200 rounded-xl bg-white/60 hover:border-hq-teal/50 transition cursor-pointer p-4',
          isDragging && 'border-hq-teal bg-hq-teal/5',
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          required={required && files.length === 0}
          className="hidden"
          onChange={(e) => handleSelect(e.target.files)}
        />
        <div className="flex items-center gap-3 text-slate-600">
          <div className="h-10 w-10 rounded-full bg-hq-teal/10 text-hq-teal flex items-center justify-center">
            <Upload className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Drop CSV files or click to browse</p>
            <p className="text-xs text-slate-500">{description ?? 'CSV only. Multiple files allowed.'}</p>
          </div>
        </div>
      </div>
      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((file, idx) => (
            <li
              key={`${file.name}-${idx}`}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-slate-400" />
                <span>{file.name}</span>
                <span className="text-xs text-slate-500">
                  {(file.size / 1024).toFixed(1)} KB
                </span>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-rose-500"
                onClick={() => onChange(files.filter((_, i) => i !== idx))}
                aria-label="Remove file"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
