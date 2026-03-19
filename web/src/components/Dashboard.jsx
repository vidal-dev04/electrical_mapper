import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import UserManagement from './UserManagement';
import ActivityLogs from './ActivityLogs';
import '../styles/Dashboard.css';

function Dashboard({ onClose }) {
  const { token } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('stats');

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await fetch('https://electrical-network-backend.onrender.com/api/auth/stats', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>📊 Tableau de bord - Superviseur</h1>
        <button onClick={onClose} className="close-dashboard-btn">
          ✕ Retour à la carte
        </button>
      </div>

      <div className="dashboard-tabs">
        <button
          className={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          📊 Statistiques
        </button>
        <button
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          👥 Gestion utilisateurs
        </button>
        <button
          className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          📝 Logs d'activité
        </button>
      </div>

      <div className="dashboard-content">
        {activeTab === 'stats' && (
          <div className="stats-section">
            {loading ? (
              <div className="loading">Chargement des statistiques...</div>
            ) : stats ? (
              <>
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-icon">👥</div>
                    <div className="stat-value">{stats.totalUsers}</div>
                    <div className="stat-label">Utilisateurs actifs</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">🗺️</div>
                    <div className="stat-value">{stats.totalFeatures}</div>
                    <div className="stat-label">Features totales</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">⚠️</div>
                    <div className="stat-value">{stats.orphanFeatures}</div>
                    <div className="stat-label">Features anciennes</div>
                  </div>
                </div>

                <div className="features-by-user">
                  <h3>📊 Répartition par utilisateur</h3>
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th>Utilisateur</th>
                        <th>Nom complet</th>
                        <th>Features créées</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.featuresByUser.map(user => (
                        <tr key={user.userId}>
                          <td>{user.username}</td>
                          <td>{user.fullName}</td>
                          <td className="feature-count">{user.featureCount}</td>
                        </tr>
                      ))}
                      <tr className="total-row">
                        <td colSpan="2"><strong>Features anciennes (non assignées)</strong></td>
                        <td className="feature-count"><strong>{stats.orphanFeatures}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="error">Erreur de chargement des statistiques</div>
            )}
          </div>
        )}

        {activeTab === 'users' && <UserManagement />}
        {activeTab === 'logs' && <ActivityLogs />}
      </div>
    </div>
  );
}

export default Dashboard;
