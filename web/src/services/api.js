const API_URL = 'https://electrical-network-backend.onrender.com'

class ApiService {
  constructor() {
    this.clientId = null
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  getAuthHeaders() {
    const token = localStorage.getItem('authToken')
    return token ? {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    } : {
      'Content-Type': 'application/json'
    }
  }

  async fetchFeatures() {
    try {
      const params = new URLSearchParams({ client_id: this.clientId })
      const response = await fetch(`${API_URL}/api/features?${params}`, {
        headers: this.getAuthHeaders()
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      return data.features || []
    } catch (error) {
      console.error('Error fetching features:', error)
      throw error
    }
  }

  async syncTransactions(transactions) {
    try {
      const response = await fetch(`${API_URL}/api/sync`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ transactions })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error syncing transactions:', error)
      throw error
    }
  }

  async exportGeoJSON() {
    try {
      const params = new URLSearchParams({ client_id: this.clientId })
      const response = await fetch(`${API_URL}/api/export/geojson?${params}`, {
        headers: this.getAuthHeaders()
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error exporting GeoJSON:', error)
      throw error
    }
  }

  async exportCSV() {
    try {
      const params = new URLSearchParams({ client_id: this.clientId })
      const response = await fetch(`${API_URL}/api/export/csv?${params}`, {
        headers: this.getAuthHeaders()
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return await response.text()
    } catch (error) {
      console.error('Error exporting CSV:', error)
      throw error
    }
  }

  async exportHTML() {
    try {
      const params = new URLSearchParams({ client_id: this.clientId })
      const response = await fetch(`${API_URL}/api/export/html?${params}`, {
        headers: this.getAuthHeaders()
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return await response.text()
    } catch (error) {
      console.error('Error exporting HTML:', error)
      throw error
    }
  }
}

export default new ApiService()
