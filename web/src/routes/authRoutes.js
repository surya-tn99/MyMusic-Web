const express = require('express');
const passport = require('passport');
const authController = require('../controllers/authController');

const router = express.Router();

// Auth with Google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// Google Auth Callback
router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/login.html' }),
    authController.googleCallback
);

// Logout
router.get('/logout', authController.logout);

// Get Current User
router.get('/current_user', (req, res) => {
    res.json(req.user || {});
});

module.exports = router;
