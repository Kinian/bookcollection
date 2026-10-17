export type BookStatus = 'toread' | 'reading' | 'read' | 'abandoned';

export interface Book {
  id: string;
  isbn?: string;
  title: string;
  subtitle?: string;
  authors: string[];
  coverUrl?: string;
  description?: string;
  pageCount?: number;
  categories: string[];
  publisher?: string;
  publishedDate?: string;
  language?: string;
  status: BookStatus;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  rating?: number; // 1..5
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export type BookInput = Omit<Book, 'id' | 'createdAt' | 'updatedAt'>;

export const STATUS_LABEL: Record<BookStatus, string> = {
  toread: 'À lire',
  reading: 'En cours',
  read: 'Lu',
  abandoned: 'Abandonné',
};
