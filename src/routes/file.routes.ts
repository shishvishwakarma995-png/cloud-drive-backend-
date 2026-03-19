import { Router } from 'express';
import {
  uploadFile, getFiles, deleteFile, search,
  getTrash, restoreItem, permanentDelete,
  getRecent, getStorageUsage,
  toggleStar, getStarred,
  shareItem, getSharedWithMe, removeShare,
  moveFile, renameFile,
  createLinkShare, accessLinkShare, deleteLinkShare, getMyLinks,
  getSharesList
} from '../controllers/file.controller';
import { protect } from '../middleware/auth';

const router = Router();

router.use(protect);

router.post('/upload', uploadFile);
router.get('/', getFiles);
router.delete('/:id', deleteFile);
router.get('/search', search);
router.get('/trash', getTrash);
router.get('/recent', getRecent);
router.get('/storage', getStorageUsage);
router.get('/starred', getStarred);
router.get('/shared-with-me', getSharedWithMe);
router.get('/my-links', getMyLinks);
router.patch('/restore/:type/:id', restoreItem);
router.delete('/permanent/:type/:id', permanentDelete);
router.patch('/star/:type/:id', toggleStar);
router.post('/share/:type/:id', shareItem);
router.delete('/share/:shareId', removeShare);
router.get('/shares/:type/:id', getSharesList);
router.patch('/:id/move', moveFile);
router.patch('/:id/rename', renameFile);
router.post('/link/:type/:id', createLinkShare);
router.delete('/link/:id', deleteLinkShare);

export default router;