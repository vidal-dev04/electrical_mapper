import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db/pool.js';

const JWT_SECRET = process.env.JWT_SECRET || 'electrical-mapper-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';

class AuthService {
  async login(username, password) {
    try {
      const result = await pool.query(
        `SELECT id, username, password_hash, full_name, role, is_active 
         FROM users 
         WHERE username = $1`,
        [username]
      );

      if (result.rows.length === 0) {
        return { success: false, error: 'Nom d\'utilisateur ou mot de passe incorrect' };
      }

      const user = result.rows[0];

      if (!user.is_active) {
        return { success: false, error: 'Compte désactivé' };
      }

      const passwordMatch = await bcrypt.compare(password, user.password_hash);

      if (!passwordMatch) {
        return { success: false, error: 'Nom d\'utilisateur ou mot de passe incorrect' };
      }

      await pool.query(
        'UPDATE users SET last_login = NOW() WHERE id = $1',
        [user.id]
      );

      await this.logActivity(user.id, 'login', null, null, { username });

      const token = jwt.sign(
        {
          userId: user.id,
          username: user.username,
          role: user.role
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      return {
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.full_name,
          role: user.role
        }
      };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Erreur serveur' };
    }
  }

  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      return { valid: true, data: decoded };
    } catch (error) {
      return { valid: false, error: 'Token invalide ou expiré' };
    }
  }

  async getUserById(userId) {
    try {
      const result = await pool.query(
        `SELECT id, username, full_name, role, is_active, created_at, last_login 
         FROM users 
         WHERE id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];
      return {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
        isActive: user.is_active,
        createdAt: user.created_at,
        lastLogin: user.last_login
      };
    } catch (error) {
      console.error('Get user error:', error);
      return null;
    }
  }

  async createUser(username, password, fullName, role) {
    try {
      const passwordHash = await bcrypt.hash(password, 10);

      const result = await pool.query(
        `INSERT INTO users (username, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, username, full_name, role`,
        [username, passwordHash, fullName, role]
      );

      return { success: true, user: result.rows[0] };
    } catch (error) {
      console.error('Create user error:', error);
      if (error.code === '23505') {
        return { success: false, error: 'Nom d\'utilisateur déjà utilisé' };
      }
      return { success: false, error: 'Erreur lors de la création' };
    }
  }

  async resetPassword(userId, newPassword) {
    try {
      const passwordHash = await bcrypt.hash(newPassword, 10);

      await pool.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [passwordHash, userId]
      );

      await this.logActivity(userId, 'password_reset', 'user', userId, {});

      return { success: true };
    } catch (error) {
      console.error('Reset password error:', error);
      return { success: false, error: 'Erreur lors de la réinitialisation' };
    }
  }

  async deleteUser(userId) {
    try {
      await pool.query(
        'UPDATE users SET is_active = false WHERE id = $1',
        [userId]
      );

      await this.logActivity(userId, 'user_deleted', 'user', userId, {});

      return { success: true };
    } catch (error) {
      console.error('Delete user error:', error);
      return { success: false, error: 'Erreur lors de la suppression' };
    }
  }

  async getAllUsers() {
    try {
      const result = await pool.query(
        `SELECT id, username, full_name, role, is_active, created_at, last_login 
         FROM users 
         ORDER BY created_at DESC`
      );

      return result.rows.map(user => ({
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
        isActive: user.is_active,
        createdAt: user.created_at,
        lastLogin: user.last_login
      }));
    } catch (error) {
      console.error('Get all users error:', error);
      return [];
    }
  }

  async logActivity(userId, action, entityType, entityId, details, ipAddress = null) {
    try {
      await pool.query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, action, entityType, entityId, JSON.stringify(details), ipAddress]
      );
    } catch (error) {
      console.error('Log activity error:', error);
    }
  }

  async getActivityLogs(userId = null, limit = 100) {
    try {
      let query = `
        SELECT al.*, u.username, u.full_name 
        FROM activity_logs al
        LEFT JOIN users u ON al.user_id = u.id
      `;
      const params = [];

      if (userId) {
        query += ' WHERE al.user_id = $1';
        params.push(userId);
      }

      query += ' ORDER BY al.created_at DESC LIMIT $' + (params.length + 1);
      params.push(limit);

      const result = await pool.query(query, params);

      return result.rows.map(log => ({
        id: log.id,
        userId: log.user_id,
        username: log.username,
        fullName: log.full_name,
        action: log.action,
        entityType: log.entity_type,
        entityId: log.entity_id,
        details: log.details,
        ipAddress: log.ip_address,
        createdAt: log.created_at
      }));
    } catch (error) {
      console.error('Get activity logs error:', error);
      return [];
    }
  }

  async getStats() {
    try {
      const usersCount = await pool.query('SELECT COUNT(*) FROM users WHERE is_active = true');
      
      const featuresCount = await pool.query(`
        SELECT 
          u.id, u.username, u.full_name, COUNT(ef.id) as feature_count
        FROM users u
        LEFT JOIN electrical_features ef ON u.id = ef.user_id AND ef.deleted_at IS NULL
        WHERE u.is_active = true
        GROUP BY u.id, u.username, u.full_name
      `);

      const totalFeatures = await pool.query(
        'SELECT COUNT(*) FROM electrical_features WHERE deleted_at IS NULL'
      );

      const orphanFeatures = await pool.query(
        'SELECT COUNT(*) FROM electrical_features WHERE user_id IS NULL AND deleted_at IS NULL'
      );

      return {
        totalUsers: parseInt(usersCount.rows[0].count),
        totalFeatures: parseInt(totalFeatures.rows[0].count),
        orphanFeatures: parseInt(orphanFeatures.rows[0].count),
        featuresByUser: featuresCount.rows.map(row => ({
          userId: row.id,
          username: row.username,
          fullName: row.full_name,
          featureCount: parseInt(row.feature_count)
        }))
      };
    } catch (error) {
      console.error('Get stats error:', error);
      return null;
    }
  }
}

export default new AuthService();
