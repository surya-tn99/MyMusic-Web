exports.googleCallback = (req, res) => {
    // Successful authentication, redirect to home.
    // In a real SPA or separate frontend, you might redirect with a token.
    // Here, the session is established.
    res.redirect('/');
};



exports.logout = (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.redirect('/login.html');
    });
};
