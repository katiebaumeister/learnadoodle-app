// Express server setup for Schedule Rules & AI Planner API
import express from 'express';
import cors from 'cors';
import { setupAPIRoutes } from './lib/apiRoutes.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
setupAPIRoutes(app);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'schedule-rules-api',
    version: '1.0.0'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
// Check if this is the main module (ES modules equivalent of require.main === module)
const isMainModule = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('server.js');

if (isMainModule || process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 Schedule Rules API server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`📅 ICS Calendar feeds available at: http://localhost:${PORT}/api/ics/`);
    console.log(`🤖 AI Planner endpoints: http://localhost:${PORT}/api/planner/`);
    console.log(`🤖 AI Rescheduling endpoints: http://localhost:${PORT}/api/ai/`);
  });
}

export default app;
