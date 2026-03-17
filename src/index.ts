import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import folderRoutes from './routes/folder.routes';
import fileRoutes from './routes/file.routes';
import { accessLinkShare } from './controllers/file.controller';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

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

app.use('/api/auth', authRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/files', fileRoutes);

// Public route — bina login ke access hoga
app.get('/api/public/share/:token', accessLinkShare);
app.post('/api/public/share/:token', accessLinkShare);

app.get('/', (req, res) => {
  res.json({ message: '🚀 Cloud Drive API is running!' });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});

export default app;