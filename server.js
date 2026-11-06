
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const connectToDB = require('./config/db');

const app = express();

const PORT = Number(process.env.PORT) || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check route
app.get('/', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Kisii University Library API is running!',
        port: PORT
    });
});

// Start server
const startServer = async () => {
    try {
        await connectToDB();

        const server = app.listen(PORT, '127.0.0.1', () => {
            console.log('--------------------------------');
            console.log('DATABASE: Connected');
            console.log(`SERVER: http://127.0.0.1:${PORT}`);
            console.log('STATUS: Running');
            console.log('--------------------------------');
        });

        server.on('error', (error) => {
            console.error('HTTP Server error:', error);
        });

    } catch (error) {
        console.error('Application startup failed:', error.message);
        process.exit(1);
    }
};

startServer();
