const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const routes = require('./routes');

const session = require('express-session');
const passport = require('./config/passport');
const authRoutes = require('./routes/authRoutes');
const { ensureAuthenticated } = require('./middlewares/authMiddleware');

const app = express();

// Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disabled for simplicity with external scripts/styles if needed
}));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session Support
app.use(session({
    secret: process.env.SESSION_SECRET || 'supersecretkey',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Passport Middleware
app.use(passport.initialize());
app.use(passport.session());

// Static Files (Frontend)
app.use(express.static('public'));
app.use('/downloads', express.static(path.join(__dirname, '../downloads')));

// Favicon
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/assert/favicon.png'));
});

// Root Redirect
app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        // If logged in, go to a dashboard (we'll need to create one, or just send a message for now)
        // For now, let's just send a success message/dashboard placeholder
        res.send(`<h1>Welcome ${req.user.displayName || 'User'}</h1><a href="/auth/logout">Logout</a>`);
    } else {
        res.redirect('/login.html');
    }
});

// Routes
// Mount Auth Routes
app.use('/auth', authRoutes);

// Protect API routes if needed, or protect specific endpoints
// app.use('/api', ensureAuthenticated, routes);
app.use('/api', routes); // Temporary: Bypass auth for debugging

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        status: 'error',
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

app.use((req, res) => {
    res.status(404).json({
        status: 'error',
        message: 'Route not found'
    });
});

module.exports = app;
