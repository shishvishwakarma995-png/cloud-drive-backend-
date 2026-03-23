import { supabase } from './supabase';

export const logActivity = async ({
  actorId,
  action,
  resourceType,
  resourceId,
  resourceName,
  context,
}: {
  actorId: string;
  action: 'upload' | 'rename' | 'delete' | 'restore' | 'move' | 'share' | 'download' | 'star';
  resourceType: 'file' | 'folder';
  resourceId: string;
  resourceName?: string;
  context?: any;
}) => {
  try {
    await supabase.from('activities').insert({
      actor_id: actorId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      resource_name: resourceName,
      context,
    });
  } catch (err: any) {
    console.log('Activity log error:', err.message);
  }
};

export const getActivities = async (actorId: string) => {
  const { data } = await supabase
    .from('activities')
    .select('*')
    .eq('actor_id', actorId)
    .order('created_at', { ascending: false })
    .limit(50);
  return data || [];
};