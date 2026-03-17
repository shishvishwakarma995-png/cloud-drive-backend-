import { Router } from 'express';
import {
  register, login, logout, getMe,
  forgotPassword, resetPassword,
  updateProfile, changePassword
} from '../controllers/auth.controller';
import { protect } from '../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', protect, getMe);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.patch('/profile', protect, updateProfile);
router.patch('/change-password', protect, changePassword);

export default router;