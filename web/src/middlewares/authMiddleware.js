exports.ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }

  // Check if it's an API request (AJAX/Fetch) or expects JSON
  if (req.path.startsWith('/api') || req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Please log in' });
  }

  // Redirect to login page for standard browser navigation
  res.redirect('/login.html');
};
