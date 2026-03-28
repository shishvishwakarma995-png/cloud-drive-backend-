import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { sendShareNotification } from '../lib/email';

// Helper to safely extract single string from query/params (handles string | string[] | ParsedQs | undefined)
const getString = (value: any): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
    return value[0];
  }
  return undefined;
};

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
    console.error('Activity log error:', err);
  }
};

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

export const getFiles = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;
    const folderId = getString(req.query.folderId);

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

export const deleteFile = async (req: Request, res: Response) => {
  try {
    const id = getString(req.params.id);
    const ownerId = req.userId!;

    if (!id) {
      return res.status(400).json({ error: { code: 'INVALID_ID', message: 'File ID required' } });
    }

    const { data: file } = await supabase
      .from('files')
      .select('storage_key, name')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .single();

    if (!file) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } });
    }

    await supabase.storage.from('cloud-drive').remove([(file as any).storage_key]);
    await supabase.from('files').update({ is_deleted: true }).eq('id', id).eq('owner_id', ownerId);

    await logActivity(ownerId, 'delete', 'file', id, (file as any).name);

    return res.json({ message: 'File deleted' });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

export const search = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;
    const q = getString(req.query.q);

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

    return res.json({ files: filesWithUrl, folders: foldersResult.data || [] });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

export const restoreItem = async (req: Request, res: Response) => {
  try {
    const type = getString(req.params.type);
    const id = getString(req.params.id);
    const ownerId = req.userId!;

    if (!type || !id) {
      return res.status(400).json({ error: { code: 'INVALID_PARAMS', message: 'Type and ID required' } });
    }

    const table = type === 'file' ? 'files' : 'folders';

    const { data: item } = await supabase.from(table).select('name').eq('id', id).eq('owner_id', ownerId).single();
    await supabase.from(table).update({ is_deleted: false }).eq('id', id).eq('owner_id', ownerId);

    await logActivity(ownerId, 'restore', type as 'file' | 'folder', id, (item as any)?.name);

    return res.json({ message: 'Restored successfully' });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

export const permanentDelete = async (req: Request, res: Response) => {
  try {
    const type = getString(req.params.type);
    const id = getString(req.params.id);
    const ownerId = req.userId!;

    if (!type || !id) {
      return res.status(400).json({ error: { code: 'INVALID_PARAMS', message: 'Type and ID required' } });
    }

    if (type === 'file') {
      const { data: file } = await supabase.from('files').select('storage_key').eq('id', id).eq('owner_id', ownerId).single();
      if (file) {
        await supabase.storage.from('cloud-drive').remove([(file as any).storage_key]);
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

export const getRecent = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;
    const { data: files, error } = await supabase.from('files').select('*').eq('owner_id', ownerId).eq('is_deleted', false).order('created_at', { ascending: false }).limit(20);
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

export const getStorageUsage = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;
    const { data, error } = await supabase.from('files').select('size_bytes').eq('owner_id', ownerId).eq('is_deleted', false);
    if (error) return res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } });
    const usedBytes = (data || []).reduce((sum: number, file: any) => sum + (file.size_bytes || 0), 0);
    const totalBytes = 15 * 1024 * 1024 * 1024;
    return res.json({
      used: usedBytes, total: totalBytes,
      usedGB: (usedBytes / (1024 * 1024 * 1024)).toFixed(2),
      totalGB: 15,
      percentage: Math.min(Math.round((usedBytes / totalBytes) * 100), 100),
    });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

export const toggleStar = async (req: Request, res: Response) => {
  try {
    const type = getString(req.params.type);
    const id = getString(req.params.id);
    const ownerId = req.userId!;

    if (!type || !id) {
      return res.status(400).json({ error: { code: 'INVALID_PARAMS', message: 'Type and ID required' } });
    }

    const table = type === 'file' ? 'files' : 'folders';
    const { data: item } = await supabase.from(table).select('is_starred, name').eq('id', id).eq('owner_id', ownerId).single();
    if (!item) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Item not found' } });
    const { error } = await supabase.from(table).update({ is_starred: !(item as any).is_starred }).eq('id', id).eq('owner_id', ownerId);
    if (error) return res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } });

    await logActivity(ownerId, 'star', type as 'file' | 'folder', id, (item as any).name);

    return res.json({ is_starred: !(item as any).is_starred });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

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
    return res.json({ files: filesWithUrl, folders: foldersResult.data || [] });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

export const shareItem = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;
    const type = getString(req.params.type);
    const id = getString(req.params.id);
    const { email, permission = 'view' } = req.body;

    if (!type || !id) {
      return res.status(400).json({ error: { code: 'INVALID_PARAMS', message: 'Type and ID required' } });
    }

    if (!email) return res.status(400).json({ error: { code: 'MISSING_EMAIL', message: 'Email required' } });
    
    const table = type === 'file' ? 'files' : 'folders';
    const { data: item } = await supabase.from(table).select('id, name').eq('id', id).eq('owner_id', ownerId).single();
    if (!item) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Item not found' } });
    
    const { data: sharedUser } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
    
    // 🔴 SECURITY FIX: Validate user exists before sharing
    if (!sharedUser) {
      return res.status(400).json({ error: { code: 'USER_NOT_FOUND', message: 'User with this email does not exist' } });
    }

    let existingQuery = supabase.from('file_shares').select('id').eq('owner_id', ownerId).eq('shared_with_email', email);
    if (type === 'file') existingQuery = existingQuery.eq('file_id', id);
    else existingQuery = existingQuery.eq('folder_id', id);
    
    const { data: existing } = await existingQuery.maybeSingle();
    if (existing) {
      await supabase.from('file_shares').update({ permission }).eq('id', existing.id);
      return res.json({ message: 'Share updated' });
    }

    const shareData: any = { owner_id: ownerId, shared_with_email: email, shared_with_id: sharedUser.id, permission };
    if (type === 'file') shareData.file_id = id;
    else shareData.folder_id = id;

    const { error } = await supabase.from('file_shares').insert(shareData);
    if (error) return res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } });

    const { data: ownerData } = await supabase.from('users').select('name').eq('id', ownerId).single();

    await sendShareNotification({
      toEmail: email,
      fromName: (ownerData as any)?.name || 'Someone',
      fileName: (item as any).name,
      permission,
      shareUrl: `${process.env.CORS_ORIGIN}/dashboard/shared`,
    });

    await logActivity(ownerId, 'share', type as 'file' | 'folder', id, (item as any).name, { sharedWith: email, permission });

    return res.json({ message: 'Shared successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

export const getSharedWithMe = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;
    const { data: userData } = await supabase.from('users').select('email').eq('id', ownerId).single();
    if (!userData) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    const { data: shares } = await supabase.from('file_shares').select(`id, permission, created_at, file_id, folder_id, files (id, name, mime_type, size_bytes, storage_key, created_at), folders (id, name, created_at)`).eq('shared_with_email', (userData as any).email).order('created_at', { ascending: false });
    const files: any[] = [];
    const folders: any[] = [];
    (shares || []).forEach((share: any) => {
      if (share.files) {
        const { data: urlData } = supabase.storage.from('cloud-drive').getPublicUrl(share.files.storage_key);
        files.push({ ...share.files, url: urlData.publicUrl, permission: share.permission, share_id: share.id });
      }
      if (share.folders) folders.push({ ...share.folders, permission: share.permission, share_id: share.id });
    });
    return res.json({ files, folders });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

export const removeShare = async (req: Request, res: Response) => {
  try {
    const shareId = getString(req.params.shareId);
    const ownerId = req.userId!;

    if (!shareId) {
      return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Share ID required' } });
    }

    await supabase.from('file_shares').delete().eq('id', shareId).eq('owner_id', ownerId);
    return res.json({ message: 'Share removed' });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

export const moveFile = async (req: Request, res: Response) => {
  try {
    const id = getString(req.params.id);
    const { folderId } = req.body;
    const ownerId = req.userId!;

    if (!id) {
      return res.status(400).json({ error: { code: 'INVALID_ID', message: 'File ID required' } });
    }

    const { data: file } = await supabase.from('files').select('name').eq('id', id).eq('owner_id', ownerId).single();
    const { error } = await supabase.from('files').update({ folder_id: folderId || null }).eq('id', id).eq('owner_id', ownerId);
    if (error) return res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } });

    await logActivity(ownerId, 'move', 'file', id, (file as any)?.name);

    return res.json({ message: 'File moved successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

export const renameFile = async (req: Request, res: Response) => {
  try {
    const id = getString(req.params.id);
    const { name } = req.body;
    const ownerId = req.userId!;

    if (!id) {
      return res.status(400).json({ error: { code: 'INVALID_ID', message: 'File ID required' } });
    }

    if (!name || !name.trim()) return res.status(400).json({ error: { code: 'MISSING_NAME', message: 'Name required' } });

    const { data: oldFile } = await supabase.from('files').select('name').eq('id', id).eq('owner_id', ownerId).single();
    const { data: file, error } = await supabase.from('files').update({ name: name.trim() }).eq('id', id).eq('owner_id', ownerId).select().single();
    if (error || !file) return res.status(500).json({ error: { code: 'DB_ERROR', message: 'Failed to rename file' } });

    await logActivity(ownerId, 'rename', 'file', id, name.trim(), { oldName: (oldFile as any)?.name });

    return res.json({ file });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

export const createLinkShare = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;
    const type = getString(req.params.type);
    const id = getString(req.params.id);
    const { expiresIn, password } = req.body;

    if (!type || !id) {
      return res.status(400).json({ error: { code: 'INVALID_PARAMS', message: 'Type and ID required' } });
    }

    const table = type === 'file' ? 'files' : 'folders';
    const { data: item } = await supabase.from(table).select('id, name').eq('id', id).eq('owner_id', ownerId).single();
    if (!item) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Item not found' } });

    let expires_at = null;
    if (expiresIn && expiresIn !== 'never') {
      const date = new Date();
      date.setDate(date.getDate() + parseInt(expiresIn));
      expires_at = date.toISOString();
    }

    let password_hash = null;
    if (password) {
      password_hash = await bcrypt.hash(password, 10);
    }

    const { data: existing } = await supabase
      .from('link_shares')
      .select('*')
      .eq('resource_type', type)
      .eq('resource_id', id)
      .eq('created_by', ownerId)
      .maybeSingle();

    if (existing) {
      const { data: updated } = await supabase
        .from('link_shares')
        .update({ expires_at, password_hash })
        .eq('id', existing.id)
        .select()
        .single();
      return res.json({ link: updated });
    }

    const { data: link, error } = await supabase
      .from('link_shares')
      .insert({ resource_type: type, resource_id: id, created_by: ownerId, expires_at, password_hash })
      .select()
      .single();

    if (error || !link) {
      return res.status(500).json({ error: { code: 'DB_ERROR', message: error?.message || 'Failed to create link' } });
    }

    return res.json({ link });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

export const accessLinkShare = async (req: Request, res: Response) => {
  try {
    const token = getString(req.params.token);

    if (!token) {
      return res.status(400).json({ error: { code: 'INVALID_TOKEN', message: 'Token required' } });
    }

    const { password } = req.body;

    const { data: link } = await supabase.from('link_shares').select('*').eq('token', token).single();
    if (!link) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Link not found' } });

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return res.status(410).json({ error: { code: 'EXPIRED', message: 'This link has expired' } });
    }

    if (link.password_hash) {
      if (!password) return res.status(401).json({ error: { code: 'PASSWORD_REQUIRED', message: 'Password required' } });
      const valid = await bcrypt.compare(password, link.password_hash);
      if (!valid) return res.status(401).json({ error: { code: 'WRONG_PASSWORD', message: 'Wrong password' } });
    }

    if (link.resource_type === 'file') {
      const { data: file } = await supabase.from('files').select('id, name, mime_type, size_bytes, storage_key, created_at').eq('id', link.resource_id).eq('is_deleted', false).single();
      if (!file) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } });
      const { data: urlData } = supabase.storage.from('cloud-drive').getPublicUrl((file as any).storage_key);
      return res.json({ type: 'file', item: { ...file, url: urlData.publicUrl } });
    } else {
      const { data: folder } = await supabase.from('folders').select('id, name, created_at').eq('id', link.resource_id).eq('is_deleted', false).single();
      if (!folder) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Folder not found' } });
      return res.json({ type: 'folder', item: folder });
    }
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

export const deleteLinkShare = async (req: Request, res: Response) => {
  try {
    const id = getString(req.params.id);
    const ownerId = req.userId!;

    if (!id) {
      return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Link ID required' } });
    }

    await supabase.from('link_shares').delete().eq('id', id).eq('created_by', ownerId);
    return res.json({ message: 'Link deleted' });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

export const getMyLinks = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;
    const { data: links } = await supabase.from('link_shares').select('*').eq('created_by', ownerId).order('created_at', { ascending: false });
    return res.json({ links: links || [] });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

export const getSharesList = async (req: Request, res: Response) => {
  try {
    const type = getString(req.params.type);
    const id = getString(req.params.id);
    const ownerId = req.userId!;

    if (!type || !id) {
      return res.status(400).json({ error: { code: 'INVALID_PARAMS', message: 'Type and ID required' } });
    }

    const query = type === 'file'
      ? supabase.from('file_shares').select('*').eq('file_id', id).eq('owner_id', ownerId)
      : supabase.from('file_shares').select('*').eq('folder_id', id).eq('owner_id', ownerId);

    const { data: shares } = await query.order('created_at', { ascending: false });
    return res.json({ shares: shares || [] });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

export const getActivityLog = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;
    const { data: activities } = await supabase
      .from('activities')
      .select('*')
      .eq('actor_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(50);
    return res.json({ activities: activities || [] });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
};