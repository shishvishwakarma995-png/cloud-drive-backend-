import { Router } from 'express';
import {
  uploadFile, getFiles, deleteFile, search,
  getTrash, restoreItem, permanentDelete,
  getRecent, getStorageUsage,
  toggleStar, getStarred
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
router.patch('/restore/:type/:id', restoreItem);
router.delete('/permanent/:type/:id', permanentDelete);
router.patch('/star/:type/:id', toggleStar);

export default router;