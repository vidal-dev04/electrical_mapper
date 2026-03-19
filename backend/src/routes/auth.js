import express from 'express';
import authService from '../services/authService.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username et password requis' });
    }

    const result = await authService.login(username, password);

    if (!result.success) {
      return res.status(401).json({ error: result.error });
    }

    res.json({
      token: result.token,
      user: result.user
    });
  } catch (error) {
    console.error('Login route error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Verify token
router.get('/verify', authenticateToken, async (req, res) => {
  try {
    const user = await authService.getUserById(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Verify route error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Logout (optionnel, côté client suffit)
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    await authService.logActivity(req.user.userId, 'logout', null, null, {});
    res.json({ message: 'Déconnexion réussie' });
  } catch (error) {
    console.error('Logout route error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get all users (superviseur only)
router.get('/users', authenticateToken, requireRole('superviseur'), async (req, res) => {
  try {
    const users = await authService.getAllUsers();
    res.json({ users });
  } catch (error) {
    console.error('Get users route error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Create user (superviseur only)
router.post('/users', authenticateToken, requireRole('superviseur'), async (req, res) => {
  try {
    const { username, password, fullName, role } = req.body;

    if (!username || !password || !fullName || !role) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    if (!['agent', 'superviseur'].includes(role)) {
      return res.status(400).json({ error: 'Rôle invalide' });
    }

    const result = await authService.createUser(username, password, fullName, role);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    await authService.logActivity(req.user.userId, 'user_created', 'user', result.user.id, {
      username, fullName, role
    });

    res.status(201).json({ user: result.user });
  } catch (error) {
    console.error('Create user route error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Reset password (superviseur only)
router.post('/users/:userId/reset-password', authenticateToken, requireRole('superviseur'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'Nouveau mot de passe requis' });
    }

    const result = await authService.resetPassword(userId, newPassword);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    await authService.logActivity(req.user.userId, 'password_reset_by_admin', 'user', userId, {});

    res.json({ message: 'Mot de passe réinitialisé' });
  } catch (error) {
    console.error('Reset password route error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Delete user (superviseur only)
router.delete('/users/:userId', authenticateToken, requireRole('superviseur'), async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId === req.user.userId) {
      return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
    }

    const result = await authService.deleteUser(userId);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    await authService.logActivity(req.user.userId, 'user_deleted', 'user', userId, {});

    res.json({ message: 'Utilisateur supprimé' });
  } catch (error) {
    console.error('Delete user route error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get stats (superviseur only)
router.get('/stats', authenticateToken, requireRole('superviseur'), async (req, res) => {
  try {
    const stats = await authService.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Get stats route error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get activity logs
router.get('/logs', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.role === 'agent' ? req.user.userId : null;
    const limit = parseInt(req.query.limit) || 100;

    const logs = await authService.getActivityLogs(userId, limit);
    res.json({ logs });
  } catch (error) {
    console.error('Get logs route error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
