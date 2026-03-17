import { Router } from 'express';
import { createFolder, getFolder, getRootContents, updateFolder, deleteFolder, moveFolder } from '../controllers/folder.controller';
import { protect } from '../middleware/auth';

const router = Router();

router.use(protect);

router.get('/root', getRootContents);
router.post('/', createFolder);
router.get('/:id', getFolder);
router.patch('/:id', updateFolder);
router.delete('/:id', deleteFolder);
router.patch('/:id/move', moveFolder);

export default router;