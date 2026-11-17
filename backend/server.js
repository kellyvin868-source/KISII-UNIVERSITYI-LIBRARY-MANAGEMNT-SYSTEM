
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const connectToDB = require('./config/db');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const path = require('node:path');
const swaggerUi = require('swagger-ui-express');

const memberRoute=require('./routes/memberRoute');
const aiRoute=require('./routes/aiRoute');
const bookRoute=require('./routes/bookRoute');
const authorRoute=require('./routes/authorRoute');
const categoryRoute=require('./routes/categoryRoute');
const memberManagementRoute=require('./routes/memberManagementRoute');
const loanRoute=require('./routes/loanRoute');
const reservationRoute=require('./routes/reservationRoute');
const fineRoute=require('./routes/fineRoute');
const paymentRoute=require('./routes/paymentRoute');
const externalRoute=require('./routes/externalRoute');
const notificationRoute=require('./routes/notificationRoute');
const { processPendingNotifications } = require('./services/notificationService');
const { processOverdueLoans } = require('./services/loanService');
const { expireReadyReservations } = require('./services/reservationService');

const app = express();

const PORT = Number(process.env.PORT) || 4000;

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Health check route
app.get('/', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Kisii University Library API is running!',
        port: PORT
    });
});

app.get('/health/ready', (req, res) => {
    const ready = mongoose.connection.readyState === 1;
    return res.status(ready ? 200 : 503).json({
        success: ready,
        status: ready ? 'ready' : 'not-ready',
        database: ready ? 'connected' : 'disconnected'
    });
});

app.get('/openapi.yaml', (req, res) => {
    res.sendFile(path.join(__dirname, 'openapi.yaml'));
});
app.use('/docs', swaggerUi.serve, swaggerUi.setup(undefined, {
    swaggerOptions: { url: '/openapi.yaml' },
    customSiteTitle: 'Kisii University Library API'
}));

app.use('/api/auth',memberRoute);
app.use('/v1/auth',memberRoute);
app.use('/v1/books',bookRoute);
app.use('/v1/authors',authorRoute);
app.use('/v1/categories',categoryRoute);
app.use('/v1/members',memberManagementRoute);
app.use('/v1/loans',loanRoute);
app.use('/v1/reservations',reservationRoute);
app.use('/v1/fines',fineRoute);
app.use('/v1/payments',paymentRoute);
app.use('/v1/external',externalRoute);
app.use('/v1/notifications',notificationRoute);
app.use('/v1/ai',aiRoute);

// Start server
const startServer = async () => {
    try {
        await connectToDB();

        const server = app.listen(PORT, process.env.HOST || '0.0.0.0', () => {
            console.log('--------------------------------');
            console.log('DATABASE: Connected');
            console.log(`SERVER: http://127.0.0.1:${PORT}`);
            console.log('STATUS: Running');
            console.log('--------------------------------');
        });
        const notificationWorker = setInterval(() => {
            processPendingNotifications().catch((error) => {
                console.error('Notification worker failed:', error);
            });
        }, 30000);
        notificationWorker.unref();
        const circulationWorker = setInterval(() => {
            Promise.all([processOverdueLoans(), expireReadyReservations()]).catch((error) => {
                console.error('Circulation worker failed:', error);
            });
        }, 60 * 60 * 1000);
        circulationWorker.unref();
        Promise.all([processPendingNotifications(), processOverdueLoans(), expireReadyReservations()])
            .catch((error) => console.error('Initial background processing failed:', error));

        server.on('error', (error) => {
            console.error('HTTP Server error:', error);
        });

    } catch (error) {
        console.error('Application startup failed:', error.message);
        process.exit(1);
    }
};

if (require.main === module) {
    startServer();
}

module.exports = { app, startServer };
