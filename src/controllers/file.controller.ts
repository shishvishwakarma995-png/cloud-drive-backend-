import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { sendShareNotification } from '../lib/email';

// Activity Logger Helper
const logActivity = async (
  actorId: string,
  action: string,
  resourceType: 'file' | 'folder',
  resourceId: string,
  resourceName?: string,
  context?: any
) => {
  try {
    await supabase.from('activities').insert({
      actor_id: actorId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      resource_name: resourceName,
      context,
    });
  } catch (err) {
    console.log('Activity log error');
  }
};

// 1. Upload File
export const uploadFile = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;
    const { fileName, fileData, mimeType, fileSize, folderId } = req.body;

    if (!fileName || !fileData || !mimeType) {
      return res.status(400).json({ error: { code: 'MISSING_DATA', message: 'fileName, fileData, mimeType required' } });
    }

    const storagePath = `${ownerId}/${Date.now()}-${fileName}`;
    const buffer = Buffer.from(fileData, 'base64');

    const { error: storageError } = await supabase.storage
      .from('cloud-drive')
      .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

    if (storageError) {
      return res.status(500).json({ error: { code: 'STORAGE_ERROR', message: storageError.message } });
    }

    const { data: urlData } = supabase.storage.from('cloud-drive').getPublicUrl(storagePath);

    const { data: file, error: dbError } = await supabase
      .from('files')
      .insert({
        name: fileName,
        mime_type: mimeType,
        size_bytes: fileSize || buffer.length,
        storage_key: storagePath,
        owner_id: ownerId,
        folder_id: folderId || null,
      })
      .select()
      .single();

    if (dbError || !file) {
      return res.status(500).json({ error: { code: 'DB_ERROR', message: dbError?.message || 'Failed to save file' } });
    }

    await logActivity(ownerId, 'upload', 'file', file.id, fileName);

    return res.status(201).json({ file: { ...file, url: urlData.publicUrl } });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

// 2. Get Files
export const getFiles = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;
    const folderId = req.query.folderId as string | undefined;

    let query = supabase
      .from('files')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (folderId) {
      query = query.eq('folder_id', folderId);
    } else {
      query = query.is('folder_id', null);
    }

    const { data: files, error } = await query;
    if (error) return res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } });

    const filesWithUrl = (files || []).map((file: any) => {
      const { data: urlData } = supabase.storage.from('cloud-drive').getPublicUrl(file.storage_key);
      return { ...file, url: urlData.publicUrl };
    });

    return res.json({ files: filesWithUrl });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

// 3. Soft Delete
export const deleteFile = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const ownerId = req.userId!;

    const { data: file } = await supabase.from('files').select('name').eq('id', id).eq('owner_id', ownerId).single();
    if (!file) return res.status(404).json({ error: 'Not found' });

    await supabase.from('files').update({ is_deleted: true }).eq('id', id).eq('owner_id', ownerId);
    await logActivity(ownerId, 'delete', 'file', id, (file as any).name);

    return res.json({ message: 'Moved to trash' });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
};

// 4. Search
export const search = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;
    const q = req.query.q as string;
    if (!q) return res.json({ files: [], folders: [] });

    const [filesResult, foldersResult] = await Promise.all([
      supabase.from('files').select('*').eq('owner_id', ownerId).eq('is_deleted', false).ilike('name', `%${q}%`),
      supabase.from('folders').select('*').eq('owner_id', ownerId).eq('is_deleted', false).ilike('name', `%${q}%`),
    ]);

    const filesWithUrl = (filesResult.data || []).map((file: any) => {
      const { data: urlData } = supabase.storage.from('cloud-drive').getPublicUrl(file.storage_key);
      return { ...file, url: urlData.publicUrl };
    });

    return res.json({ files: filesWithUrl, folders: foldersResult.data || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Search failed' });
  }
};

// 5. Get Trash
export const getTrash = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;
    const [f, d] = await Promise.all([
      supabase.from('files').select('*').eq('owner_id', ownerId).eq('is_deleted', true),
      supabase.from('folders').select('*').eq('owner_id', ownerId).eq('is_deleted', true),
    ]);
    const filesWithUrl = (f.data || []).map((file: any) => {
      const { data: urlData } = supabase.storage.from('cloud-drive').getPublicUrl(file.storage_key);
      return { ...file, url: urlData.publicUrl };
    });
    return res.json({ files: filesWithUrl, folders: d.data || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Trash fetch failed' });
  }
};

// 6. Restore
export const restoreItem = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const type = req.params.type as string;
    const ownerId = req.userId!;
    const table = type === 'file' ? 'files' : 'folders';
    await supabase.from(table).update({ is_deleted: false }).eq('id', id).eq('owner_id', ownerId);
    return res.json({ message: 'Restored' });
  } catch (err) {
    return res.status(500).json({ error: 'Restore failed' });
  }
};

// 7. Permanent Delete
export const permanentDelete = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const type = req.params.type as string;
    const ownerId = req.userId!;
    if (type === 'file') {
      const { data: file } = await supabase.from('files').select('storage_key').eq('id', id).single();
      if (file) await supabase.storage.from('cloud-drive').remove([file.storage_key]);
      await supabase.from('files').delete().eq('id', id).eq('owner_id', ownerId);
    } else {
      await supabase.from('folders').delete().eq('id', id).eq('owner_id', ownerId);
    }
    return res.json({ message: 'Deleted forever' });
  } catch (err) {
    return res.status(500).json({ error: 'Delete failed' });
  }
};

// 8. Recent Files
export const getRecent = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;
    const { data } = await supabase.from('files').select('*').eq('owner_id', ownerId).eq('is_deleted', false).order('created_at', { ascending: false }).limit(10);
    const filesWithUrl = (data || []).map((file: any) => {
      const { data: urlData } = supabase.storage.from('cloud-drive').getPublicUrl(file.storage_key);
      return { ...file, url: urlData.publicUrl };
    });
    return res.json({ files: filesWithUrl });
  } catch (err) {
    return res.status(500).json({ error: 'Recent failed' });
  }
};

// 9. Storage Usage
export const getStorageUsage = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;
    const { data } = await supabase.from('files').select('size_bytes').eq('owner_id', ownerId).eq('is_deleted', false);
    const used = (data || []).reduce((acc, curr) => acc + (curr.size_bytes || 0), 0);
    return res.json({ used, total: 15 * 1024 * 1024 * 1024 });
  } catch (err) {
    return res.status(500).json({ error: 'Storage fetch failed' });
  }
};

// 10. Star Item
export const toggleStar = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const type = req.params.type as string;
    const ownerId = req.userId!;
    const table = type === 'file' ? 'files' : 'folders';
    const { data } = await supabase.from(table).select('is_starred').eq('id', id).single();
    await supabase.from(table).update({ is_starred: !data?.is_starred }).eq('id', id).eq('owner_id', ownerId);
    return res.json({ starred: !data?.is_starred });
  } catch (err) {
    return res.status(500).json({ error: 'Star failed' });
  }
};

// 11. Get Starred
export const getStarred = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;
    const [f, d] = await Promise.all([
      supabase.from('files').select('*').eq('owner_id', ownerId).eq('is_starred', true).eq('is_deleted', false),
      supabase.from('folders').select('*').eq('owner_id', ownerId).eq('is_starred', true).eq('is_deleted', false),
    ]);
    const filesWithUrl = (f.data || []).map((file: any) => {
      const { data: urlData } = supabase.storage.from('cloud-drive').getPublicUrl(file.storage_key);
      return { ...file, url: urlData.publicUrl };
    });
    return res.json({ files: filesWithUrl, folders: d.data || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Starred fetch failed' });
  }
};

// 12. Share Item
export const shareItem = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const type = req.params.type as string;
    const ownerId = req.userId!;
    const { email, permission } = req.body;
    
    const shareData: any = { owner_id: ownerId, shared_with_email: email, permission };
    if (type === 'file') shareData.file_id = id; else shareData.folder_id = id;

    await supabase.from('file_shares').insert(shareData);
    return res.json({ message: 'Shared' });
  } catch (err) {
    return res.status(500).json({ error: 'Share failed' });
  }
};

// 13. Get Shared With Me
export const getSharedWithMe = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;
    const { data: user } = await supabase.from('users').select('email').eq('id', ownerId).single();
    const { data: shares } = await supabase.from('file_shares').select('*, files(*), folders(*)').eq('shared_with_email', user?.email);
    return res.json({ shares });
  } catch (err) {
    return res.status(500).json({ error: 'Shared fetch failed' });
  }
};

// 14. Rename
export const renameFile = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name } = req.body;
    await supabase.from('files').update({ name }).eq('id', id).eq('owner_id', req.userId!);
    return res.json({ message: 'Renamed' });
  } catch (err) {
    return res.status(500).json({ error: 'Rename failed' });
  }
};

// 15. Activity Log
export const getActivityLog = async (req: Request, res: Response) => {
  try {
    const { data } = await supabase.from('activities').select('*').eq('actor_id', req.userId!).order('created_at', { ascending: false });
    return res.json({ activities: data || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Activity fetch failed' });
  }
};

// 16. Create Link
export const createLinkShare = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const type = req.params.type as string;
    const { data } = await supabase.from('link_shares').insert({ resource_id: id, resource_type: type, created_by: req.userId! }).select().single();
    return res.json({ link: data });
  } catch (err) {
    return res.status(500).json({ error: 'Link creation failed' });
  }
};

