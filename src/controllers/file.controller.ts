import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';

export const uploadFile = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;
    const { fileName, fileData, mimeType, fileSize, folderId } = req.body;

    if (!fileName || !fileData || !mimeType) {
      return res.status(400).json({ error: { code: 'MISSING_DATA', message: 'fileName, fileData, mimeType required' } });
    }

    const storagePath = `${ownerId}/${Date.now()}-${fileName}`;
    const buffer = Buffer.from(fileData, 'base64');

    const { data: storageData, error: storageError } = await supabase.storage
      .from('cloud-drive')
      .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

    if (storageError) {
      console.log('Storage error:', storageError);
      return res.status(500).json({ error: { code: 'STORAGE_ERROR', message: storageError.message } });
    }

    const { data: urlData } = supabase.storage
      .from('cloud-drive')
      .getPublicUrl(storagePath);

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
      console.log('DB error:', dbError);
      return res.status(500).json({ error: { code: 'DB_ERROR', message: dbError?.message || 'Failed to save file' } });
    }

    return res.status(201).json({ file: { ...file, url: urlData.publicUrl } });
  } catch (err: any) {
    console.log('Upload error:', err.message);
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

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
      const { data: urlData } = supabase.storage
        .from('cloud-drive')
        .getPublicUrl(file.storage_key);
      return { ...file, url: urlData.publicUrl };
    });

    return res.json({ files: filesWithUrl });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

export const deleteFile = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const ownerId = req.userId!;

    const { data: file } = await supabase
      .from('files')
      .select('storage_key')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .single();

    if (!file) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } });
    }

    await supabase.storage.from('cloud-drive').remove([file.storage_key]);
    await supabase.from('files').update({ is_deleted: true }).eq('id', id).eq('owner_id', ownerId);

    return res.json({ message: 'File deleted' });
  } catch (err: any) {
    console.log('Delete error:', err.message);
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

export const search = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;
    const q = req.query.q as string;

    if (!q || q.trim().length < 1) return res.json({ files: [], folders: [] });

    const [filesResult, foldersResult] = await Promise.all([
      supabase.from('files').select('*').eq('owner_id', ownerId).eq('is_deleted', false).ilike('name', `%${q}%`).limit(10),
      supabase.from('folders').select('*').eq('owner_id', ownerId).eq('is_deleted', false).ilike('name', `%${q}%`).limit(10),
    ]);

    const filesWithUrl = (filesResult.data || []).map((file: any) => {
      const { data: urlData } = supabase.storage.from('cloud-drive').getPublicUrl(file.storage_key);
      return { ...file, url: urlData.publicUrl };
    });

    return res.json({ files: filesWithUrl, folders: foldersResult.data || [] });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

// GET TRASH (deleted files + folders)
export const getTrash = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;

    const [filesResult, foldersResult] = await Promise.all([
      supabase.from('files').select('*').eq('owner_id', ownerId).eq('is_deleted', true).order('updated_at', { ascending: false }),
      supabase.from('folders').select('*').eq('owner_id', ownerId).eq('is_deleted', true).order('updated_at', { ascending: false }),
    ]);

    const filesWithUrl = (filesResult.data || []).map((file: any) => {
      const { data: urlData } = supabase.storage.from('cloud-drive').getPublicUrl(file.storage_key);
      return { ...file, url: urlData.publicUrl };
    });

    return res.json({
      files: filesWithUrl,
      folders: foldersResult.data || [],
    });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

// RESTORE from trash
export const restoreItem = async (req: Request, res: Response) => {
  try {
    const { type, id } = req.params;
    const ownerId = req.userId!;

    const table = type === 'file' ? 'files' : 'folders';

    await supabase
      .from(table)
      .update({ is_deleted: false })
      .eq('id', id)
      .eq('owner_id', ownerId);

    return res.json({ message: 'Restored successfully' });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

// PERMANENT DELETE
export const permanentDelete = async (req: Request, res: Response) => {
  try {
    const { type, id } = req.params;
    const ownerId = req.userId!;

    if (type === 'file') {
      const { data: file } = await supabase
        .from('files')
        .select('storage_key')
        .eq('id', id)
        .eq('owner_id', ownerId)
        .single();

      if (file) {
        await supabase.storage.from('cloud-drive').remove([file.storage_key]);
        await supabase.from('files').delete().eq('id', id).eq('owner_id', ownerId);
      }
    } else {
      await supabase.from('folders').delete().eq('id', id).eq('owner_id', ownerId);
    }

    return res.json({ message: 'Permanently deleted' });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

// GET RECENT FILES
export const getRecent = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;

    const { data: files, error } = await supabase
      .from('files')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(20);

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

// GET STORAGE USAGE
export const getStorageUsage = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;

    const { data, error } = await supabase
      .from('files')
      .select('size_bytes')
      .eq('owner_id', ownerId)
      .eq('is_deleted', false);

    if (error) return res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } });

    const usedBytes = (data || []).reduce((sum: number, file: any) => sum + (file.size_bytes || 0), 0);
    const totalBytes = 15 * 1024 * 1024 * 1024; // 15 GB

    return res.json({
      used: usedBytes,
      total: totalBytes,
      usedGB: (usedBytes / (1024 * 1024 * 1024)).toFixed(2),
      totalGB: 15,
      percentage: Math.min(Math.round((usedBytes / totalBytes) * 100), 100),
    });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

// STAR / UNSTAR
export const toggleStar = async (req: Request, res: Response) => {
  try {
    const { type, id } = req.params; // type = 'file' ya 'folder'
    const ownerId = req.userId!;

    const table = type === 'file' ? 'files' : 'folders';

    // Pehle current value dekho
    const { data: item } = await supabase
      .from(table)
      .select('is_starred')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .single();

    if (!item) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Item not found' } });

    // Toggle karo — tha true to false, tha false to true
    const { error } = await supabase
      .from(table)
      .update({ is_starred: !item.is_starred })
      .eq('id', id)
      .eq('owner_id', ownerId);

    if (error) return res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } });

    return res.json({ is_starred: !item.is_starred });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

// GET STARRED
export const getStarred = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;

    const [filesResult, foldersResult] = await Promise.all([
      supabase.from('files').select('*').eq('owner_id', ownerId).eq('is_starred', true).eq('is_deleted', false).order('updated_at', { ascending: false }),
      supabase.from('folders').select('*').eq('owner_id', ownerId).eq('is_starred', true).eq('is_deleted', false).order('updated_at', { ascending: false }),
    ]);

    const filesWithUrl = (filesResult.data || []).map((file: any) => {
      const { data: urlData } = supabase.storage.from('cloud-drive').getPublicUrl(file.storage_key);
      return { ...file, url: urlData.publicUrl };
    });

    return res.json({
      files: filesWithUrl,
      folders: foldersResult.data || [],
    });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};