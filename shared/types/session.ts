type UploadedFile = {
  id: string
  path: string
  uploadedAt: number
  filename: string,
  size: number
}

export type Session = {
  sessionId: string
  connected: boolean
  lastSeen: number
  files: UploadedFile[]
  cleanupTimeout?: ReturnType<typeof setTimeout>
}