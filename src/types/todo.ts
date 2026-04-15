export interface Todo {
  id: string
  title: string
  completed: boolean
  completedAt?: string
  completedBy?: string
  dueDate?: string
  assignedTo?: string
  sortOrder: number
  createdBy: string
  createdAt: string
  updatedAt: string
}
