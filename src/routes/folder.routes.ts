import { Router } from 'express';
import { createFolder, getFolder, getRootContents, updateFolder, deleteFolder } from '../controllers/folder.controller';
import { protect } from '../middleware/auth';

const router = Router();

router.use(protect); // All folder routes are protected

router.get('/root', getRootContents);
router.post('/', createFolder);
router.get('/:id', getFolder);
router.patch('/:id', updateFolder);
router.delete('/:id', deleteFolder);

export default router;