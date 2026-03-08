import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { z } from 'zod';

const createFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().uuid().nullable().optional(),
});

const updateFolderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parentId: z.string().uuid().nullable().optional(),
});

interface BreadcrumbItem {
  id: string;
  name: string;
}

interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
}

// Helper: Build breadcrumb
const buildBreadcrumb = async (folderId: string, ownerId: string): Promise<BreadcrumbItem[]> => {
  const breadcrumb: BreadcrumbItem[] = [];
  let currentId: string | null = folderId;

  while (currentId) {
    const { data } = await supabase
      .from('folders')
      .select('id, name, parent_id')
      .eq('id', currentId)
      .eq('owner_id', ownerId)
      .single();

    const row = data as FolderRow | null;
    if (!row) break;
    breadcrumb.unshift({ id: row.id, name: row.name });
    currentId = row.parent_id;
  }

  return breadcrumb;
};

// CREATE FOLDER
export const createFolder = async (req: Request, res: Response) => {
  try {
    const { name, parentId } = createFolderSchema.parse(req.body);
    const ownerId = req.userId!;

    const { data: existing } = await supabase
      .from('folders')
      .select('id')
      .eq('owner_id', ownerId)
      .eq('name', name)
      .eq('is_deleted', false)
      .is('parent_id', parentId || null)
      .single();

    if (existing) {
      return res.status(400).json({
        error: { code: 'DUPLICATE_NAME', message: 'Folder with this name already exists' }
      });
    }

    const { data: folder, error } = await supabase
      .from('folders')
      .insert({
        name,
        owner_id: ownerId,
        parent_id: parentId || null,
      })
      .select()
      .single();

    if (error || !folder) {
      return res.status(500).json({
        error: { code: 'DB_ERROR', message: 'Failed to create folder' }
      });
    }

    return res.status(201).json({ folder });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.errors } });
    }
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

// GET ROOT CONTENTS
export const getRootContents = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;

    const { data: folders } = await supabase
      .from('folders')
      .select('*')
      .eq('owner_id', ownerId)
      .is('parent_id', null)
      .eq('is_deleted', false)
      .order('name');

    const { data: files } = await supabase
      .from('files')
      .select('*')
      .eq('owner_id', ownerId)
      .is('folder_id', null)
      .eq('is_deleted', false)
      .order('name');

    return res.json({
      children: {
        folders: folders || [],
        files: files || [],
      },
      breadcrumb: [],
    });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

// GET FOLDER CONTENTS
export const getFolder = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const ownerId = req.userId!;

    const { data: folder, error: folderError } = await supabase
      .from('folders')
      .select('*')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .eq('is_deleted', false)
      .single();

    if (folderError || !folder) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Folder not found' }
      });
    }

    const { data: folders } = await supabase
      .from('folders')
      .select('*')
      .eq('parent_id', id)
      .eq('owner_id', ownerId)
      .eq('is_deleted', false)
      .order('name');

    const { data: files } = await supabase
      .from('files')
      .select('*')
      .eq('folder_id', id)
      .eq('owner_id', ownerId)
      .eq('is_deleted', false)
      .order('name');

    const breadcrumb = await buildBreadcrumb(id, ownerId);

    return res.json({
      folder,
      children: {
        folders: folders || [],
        files: files || [],
      },
      breadcrumb,
    });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

// UPDATE FOLDER
export const updateFolder = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const ownerId = req.userId!;
    const updates = updateFolderSchema.parse(req.body);

    const { data: folder, error } = await supabase
      .from('folders')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', ownerId)
      .select()
      .single();

    if (error || !folder) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Folder not found' }
      });
    }

    return res.json({ folder });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.errors } });
    }
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

// DELETE FOLDER
export const deleteFolder = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const ownerId = req.userId!;

    const { error } = await supabase
      .from('folders')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', ownerId);

    if (error) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Folder not found' }
      });
    }

    return res.json({ message: 'Folder moved to trash' });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};
