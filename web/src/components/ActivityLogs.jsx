import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import '../styles/ActivityLogs.css';

function ActivityLogs() {
  const { token } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(100);

  useEffect(() => {
    loadLogs();
  }, [limit]);

  const loadLogs = async () => {
    try {
      const response = await fetch(`https://electrical-network-backend.onrender.com/api/auth/logs?limit=${limit}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs);
      }
    } catch (error) {
      console.error('Error loading logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionLabel = (action) => {
    const labels = {
      'login': '🔓 Connexion',
      'logout': '🔒 Déconnexion',
      'user_created': '➕ Utilisateur créé',
      'user_deleted': '🗑️ Utilisateur supprimé',
      'password_reset': '🔑 Mot de passe réinitialisé',
      'password_reset_by_admin': '🔑 MDP réinitialisé (admin)',
      'feature_created': '📍 Feature créée',
      'feature_updated': '✏️ Feature modifiée',
      'feature_deleted': '🗑️ Feature supprimée'
    };
    return labels[action] || action;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return <div className="loading">Chargement des logs...</div>;
  }

  return (
    <div className="activity-logs">
      <div className="logs-header">
        <h3>📝 Logs d'activité</h3>
        <div className="logs-controls">
          <label>
            Afficher :
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              <option value={50}>50 derniers</option>
              <option value={100}>100 derniers</option>
              <option value={200}>200 derniers</option>
              <option value={500}>500 derniers</option>
            </select>
          </label>
          <button onClick={loadLogs} className="btn-refresh">
            🔄 Actualiser
          </button>
        </div>
      </div>

      <div className="logs-container">
        {logs.length === 0 ? (
          <div className="no-logs">Aucun log disponible</div>
        ) : (
          <table className="logs-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Utilisateur</th>
                <th>Action</th>
                <th>Détails</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td className="log-date">{formatDate(log.createdAt)}</td>
                  <td className="log-user">
                    {log.username || 'Système'}
                    {log.fullName && <span className="user-fullname"> ({log.fullName})</span>}
                  </td>
                  <td className="log-action">{getActionLabel(log.action)}</td>
                  <td className="log-details">
                    {log.details && Object.keys(log.details).length > 0 ? (
                      <code>{JSON.stringify(log.details, null, 2)}</code>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="log-ip">{log.ipAddress || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default ActivityLogs;
