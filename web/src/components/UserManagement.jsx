import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import '../styles/UserManagement.css';

function UserManagement() {
  const { token } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    fullName: '',
    role: 'agent'
  });
  const [resetPassword, setResetPassword] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await fetch('https://electrical-network-backend.onrender.com/api/auth/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();

    try {
      const response = await fetch('https://electrical-network-backend.onrender.com/api/auth/users', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        alert('✅ Utilisateur créé avec succès');
        setShowAddModal(false);
        setFormData({ username: '', password: '', fullName: '', role: 'agent' });
        loadUsers();
      } else {
        const data = await response.json();
        alert('❌ ' + (data.error || 'Erreur lors de la création'));
      }
    } catch (error) {
      console.error('Error creating user:', error);
      alert('❌ Erreur de connexion');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();

    if (!selectedUser) return;

    try {
      const response = await fetch(`https://electrical-network-backend.onrender.com/api/auth/users/${selectedUser.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newPassword: resetPassword })
      });

      if (response.ok) {
        alert('✅ Mot de passe réinitialisé avec succès');
        setShowResetModal(false);
        setSelectedUser(null);
        setResetPassword('');
      } else {
        const data = await response.json();
        alert('❌ ' + (data.error || 'Erreur lors de la réinitialisation'));
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      alert('❌ Erreur de connexion');
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!confirm(`Êtes-vous sûr de vouloir désactiver l'utilisateur "${username}" ?`)) {
      return;
    }

    try {
      const response = await fetch(`https://electrical-network-backend.onrender.com/api/auth/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        alert('✅ Utilisateur désactivé avec succès');
        loadUsers();
      } else {
        const data = await response.json();
        alert('❌ ' + (data.error || 'Erreur lors de la suppression'));
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('❌ Erreur de connexion');
    }
  };

  const openResetModal = (user) => {
    setSelectedUser(user);
    setShowResetModal(true);
  };

  if (loading) {
    return <div className="loading">Chargement des utilisateurs...</div>;
  }

  return (
    <div className="user-management">
      <div className="um-header">
        <h3>👥 Gestion des utilisateurs</h3>
        <button onClick={() => setShowAddModal(true)} className="btn-add-user">
          ➕ Ajouter un utilisateur
        </button>
      </div>

      <table className="users-table">
        <thead>
          <tr>
            <th>Nom d'utilisateur</th>
            <th>Nom complet</th>
            <th>Rôle</th>
            <th>Dernière connexion</th>
            <th>Statut</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id} className={!user.isActive ? 'inactive' : ''}>
              <td>{user.username}</td>
              <td>{user.fullName}</td>
              <td>
                <span className={`role-badge ${user.role}`}>
                  {user.role === 'superviseur' ? '👔 Superviseur' : '👤 Agent'}
                </span>
              </td>
              <td>{user.lastLogin ? new Date(user.lastLogin).toLocaleString('fr-FR') : 'Jamais'}</td>
              <td>
                <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                  {user.isActive ? '🟢 Actif' : '🔴 Inactif'}
                </span>
              </td>
              <td>
                <div className="action-buttons">
                  <button 
                    onClick={() => openResetModal(user)} 
                    className="btn-reset"
                    title="Réinitialiser le mot de passe"
                  >
                    🔑
                  </button>
                  {user.isActive && (
                    <button 
                      onClick={() => handleDeleteUser(user.id, user.username)} 
                      className="btn-delete"
                      title="Désactiver"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>➕ Ajouter un utilisateur</h2>
            <form onSubmit={handleAddUser}>
              <div className="form-field">
                <label>Nom d'utilisateur</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="ex: agent3"
                  required
                />
              </div>
              <div className="form-field">
                <label>Mot de passe</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Mot de passe sécurisé"
                  required
                />
              </div>
              <div className="form-field">
                <label>Nom complet</label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="ex: Agent 3"
                  required
                />
              </div>
              <div className="form-field">
                <label>Rôle</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                >
                  <option value="agent">Agent</option>
                  <option value="superviseur">Superviseur</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-cancel">
                  Annuler
                </button>
                <button type="submit" className="btn-save">
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showResetModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowResetModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>🔑 Réinitialiser le mot de passe</h2>
            <p>Utilisateur : <strong>{selectedUser.username}</strong> ({selectedUser.fullName})</p>
            <form onSubmit={handleResetPassword}>
              <div className="form-field">
                <label>Nouveau mot de passe</label>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="Nouveau mot de passe"
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setShowResetModal(false)} className="btn-cancel">
                  Annuler
                </button>
                <button type="submit" className="btn-save">
                  Réinitialiser
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserManagement;
