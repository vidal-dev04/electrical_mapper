import authService from '../services/authService.js';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  const verification = authService.verifyToken(token);

  if (!verification.valid) {
    return res.status(403).json({ error: verification.error });
  }

  req.user = verification.data;
  next();
};

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    next();
  };
};
