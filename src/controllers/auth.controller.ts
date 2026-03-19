import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { supabase } from '../lib/supabase';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../lib/jwt';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'none' as const,
};

// REGISTER
export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, name } = registerSchema.parse(req.body);

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) {
      return res.status(400).json({ error: { code: 'EMAIL_EXISTS', message: 'Email already registered' } });
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      return res.status(500).json({ error: { code: 'AUTH_ERROR', message: authError?.message || 'Failed to create account' } });
    }

    const { data: user, error: dbError } = await supabase
      .from('users')
      .insert({ id: authData.user.id, email, name })
      .select()
      .single();

    if (dbError || !user) {
      return res.status(500).json({ error: { code: 'DB_ERROR', message: 'Failed to save user' } });
    }

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    res.cookie('access_token', accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
    res.cookie('refresh_token', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });

    return res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name },
      accessToken,
    });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.errors } });
    }
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

// LOGIN
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError || !authData.user) {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Wrong email or password' } });
    }

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (!user) {
      return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    res.cookie('access_token', accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
    res.cookie('refresh_token', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });

    return res.json({
      user: { id: user.id, email: user.email, name: user.name },
      accessToken,
    });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.errors } });
    }
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

// LOGOUT
export const logout = async (req: Request, res: Response) => {
  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
  return res.json({ message: 'Logged out successfully' });
};

// GET ME
export const getMe = async (req: Request, res: Response) => {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('id, email, name, image_url, created_at')
      .eq('id', req.userId!)
      .single();

    if (!user) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    return res.json({ user });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

// REFRESH TOKEN
export const refreshToken = async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.refresh_token;
    if (!token) {
      return res.status(401).json({ error: { code: 'NO_REFRESH_TOKEN', message: 'No refresh token' } });
    }
    const decoded = verifyRefreshToken(token);
    const newAccessToken = generateAccessToken(decoded.userId);
    res.cookie('access_token', newAccessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
    return res.json({ message: 'Token refreshed' });
  } catch (err) {
    return res.status(401).json({ error: { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid or expired refresh token' } });
  }
};

// FORGOT PASSWORD
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: { code: 'MISSING_EMAIL', message: 'Email required' } });

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.CORS_ORIGIN}/reset-password`,
    });

    return res.json({ message: 'If this email exists, a reset link has been sent.' });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

// RESET PASSWORD
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { accessToken, newPassword } = req.body;

    if (!accessToken || !newPassword) {
      return res.status(400).json({ error: { code: 'MISSING_DATA', message: 'Token and password required' } });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: { code: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters' } });
    }

    const { data: userData } = await supabase.auth.getUser(accessToken);
    if (!userData.user) {
      return res.status(400).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } });
    }

    const { error } = await supabase.auth.admin.updateUserById(userData.user.id, { password: newPassword });

    if (error) return res.status(400).json({ error: { code: 'RESET_FAILED', message: error.message } });

    return res.json({ message: 'Password updated successfully' });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
  }
};

// UPDATE PROFILE
export const updateProfile = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;
    const { name, imageData } = req.body;

    const updates: any = {};
    if (name) updates.name = name;

    if (imageData) {
      const buffer = Buffer.from(imageData, 'base64');
      const storagePath = `avatars/${ownerId}/avatar.jpg`;

      await supabase.storage.from('cloud-drive').remove([storagePath]);

      const { error: uploadError } = await supabase.storage
        .from('cloud-drive')
        .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true });

      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from('cloud-drive')
          .getPublicUrl(storagePath);
        updates.image_url = urlData.publicUrl;
      }
    }

    const { data: user, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', ownerId)
      .select('id, email, name, image_url, created_at')
      .single();

    if (error || !user) {
      return res.status(500).json({ error: { code: 'DB_ERROR', message: 'Failed to update profile' } });
    }

    return res.json({ user });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

// CHANGE PASSWORD
export const changePassword = async (req: Request, res: Response) => {
  try {
    const ownerId = req.userId!;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: { code: 'MISSING_DATA', message: 'Both passwords required' } });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: { code: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters' } });
    }

    const { data: user } = await supabase
      .from('users')
      .select('email')
      .eq('id', ownerId)
      .single();

    if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (authError) {
      return res.status(400).json({ error: { code: 'WRONG_PASSWORD', message: 'Current password is incorrect' } });
    }

    const { error } = await supabase.auth.admin.updateUserById(ownerId, { password: newPassword });

    if (error) return res.status(500).json({ error: { code: 'UPDATE_FAILED', message: error.message } });

    return res.json({ message: 'Password changed successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
};
// OAUTH LOGIN
export const oauthLogin = async (req: Request, res: Response) => {
  try {
    const { accessToken, email, name } = req.body;

    if (!accessToken || !email) {
      return res.status(400).json({ error: { code: 'MISSING_DATA', message: 'Token and email required' } });
    }

    // Verify token with Supabase
    const { data: userData, error } = await supabase.auth.getUser(accessToken);
    if (error || !userData.user) {
      return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid token' } });
    }

    // Check if user exists
    let { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', userData.user.id)
      .maybeSingle();

    // Create user if not exists
    if (!user) {
      const { data: newUser, error: dbError } = await supabase
        .from('users')
        .insert({
          id: userData.user.id,
          email,
          name: name || email.split('@')[0],
        })
        .select()
        .single();

      if (dbError || !newUser) {
        return res.status(500).json({ error: { code: 'DB_ERROR', message: 'Failed to create user' } });
      }
      user = newUser;
    }

    const jwtAccessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    res.cookie('access_token', jwtAccessToken, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 15 * 60 * 1000 });
    res.cookie('refresh_token', refreshToken, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 7 * 24 * 60 * 60 * 1000 });

    return res.json({
      user: { id: user.id, email: user.email, name: user.name },
      accessToken: jwtAccessToken,
    });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
};