import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.routes';
import folderRoutes from './routes/folder.routes';
import fileRoutes from './routes/file.routes';
import { accessLinkShare } from './controllers/file.controller';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Rate limiters
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many requests, please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many auth attempts, please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,
  message: { error: { code: 'RATE_LIMIT', message: 'Upload limit reached, please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
});

app.set('trust proxy', 1); 
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

// Apply rate limiting
app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/files/upload', uploadLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/files', fileRoutes);

// Public route
app.get('/api/public/share/:token', accessLinkShare);
app.post('/api/public/share/:token', accessLinkShare);

app.get('/', (req, res) => {
  res.json({ message: '🚀 Cloud Drive API is running!' });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});

export default app;