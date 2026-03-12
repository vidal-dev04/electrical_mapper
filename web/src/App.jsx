import { useState, useEffect, useRef } from 'react'
import apiService from './services/api.js'
import './App.css'

function App() {
  const [message, setMessage] = useState('Initialisation...')
  const [syncStatus, setSyncStatus] = useState('synced')
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const featuresRef = useRef(new Map())
  const [showModal, setShowModal] = useState(false)
  const [currentFeature, setCurrentFeature] = useState(null)
  const [formData, setFormData] = useState({})

  useEffect(() => {
    setMessage('Chargement de Leaflet...')
    
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)

    const geomanLink = document.createElement('link')
    geomanLink.rel = 'stylesheet'
    geomanLink.href = 'https://unpkg.com/@geoman-io/leaflet-geoman-free@latest/dist/leaflet-geoman.css'
    document.head.appendChild(geomanLink)

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => {
      const geomanScript = document.createElement('script')
      geomanScript.src = 'https://unpkg.com/@geoman-io/leaflet-geoman-free@latest/dist/leaflet-geoman.min.js'
      geomanScript.onload = () => {
        setMessage('Initialisation de la carte...')
        initMap()
      }
      document.head.appendChild(geomanScript)
    }
    document.head.appendChild(script)

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
      }
    }
  }, [])

  const generateId = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  const initMap = () => {
    if (!mapContainerRef.current || mapRef.current) return

    try {
      const L = window.L
      
      const map = L.map(mapContainerRef.current, { maxZoom: 20 }).setView([0, 0], 2)
      
      const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map)

      const satelliteLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        attribution: '© Google',
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
      })

      const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenTopoMap (CC-BY-SA)',
        maxZoom: 17
      })

      L.control.layers({
        'OpenStreetMap': osmLayer,
        'Satellite': satelliteLayer,
        'Topographique': topoLayer
      }).addTo(map)

      map.pm.addControls({
        position: 'topleft',
        drawMarker: true,
        drawPolyline: true,
        drawPolygon: true,
        drawRectangle: true,
        drawCircle: true,
        drawCircleMarker: false,
        drawText: false,
        editMode: true,
        dragMode: false,
        cutPolygon: false,
        removalMode: true,
        rotateMode: false
      })

      map.pm.setPathOptions({
        color: '#3388ff',
        weight: 6,
        opacity: 0.8
      })

      // Événements de création de features
      map.on('pm:create', (e) => {
        const layer = e.layer
        const featureId = generateId()
        const geometryType = e.shape === 'Marker' ? 'point' : 
                            e.shape === 'Line' ? 'line' : 
                            e.shape === 'Circle' ? 'circle' : 'polygon'

        layer.feature = {
          id: featureId,
          type: 'Feature',
          properties: {
            feature_type: geometryType,
            created_at: new Date().toISOString()
          }
        }

        featuresRef.current.set(featureId, layer)

        layer.on('click', () => {
          if (!map.pm.globalRemovalModeEnabled()) {
            openPropertiesModal(layer, featureId, geometryType)
          }
        })

        layer.on('pm:edit', () => {
          saveFeature(featureId, layer)
        })

        openPropertiesModal(layer, featureId, geometryType)
      })

      // Événement de suppression
      map.on('pm:remove', (e) => {
        const layer = e.layer
        if (layer.feature && layer.feature.id) {
          featuresRef.current.delete(layer.feature.id)
          deleteFeature(layer.feature.id)
        }
      })

      mapRef.current = map
      setMessage('Chargement des features...')
      loadFeatures(map)
      
      console.log('✅ Carte initialisée')
    } catch (error) {
      setMessage('❌ Erreur: ' + error.message)
      console.error('❌ Erreur initialisation:', error)
    }
  }

  const openPropertiesModal = (layer, featureId, geometryType) => {
    setCurrentFeature({ layer, featureId, geometryType })
    setFormData(layer.feature?.properties || {})
    setShowModal(true)
  }

  const saveFeature = async (featureId, layer, properties = {}) => {
    const feature = layer.feature || {}
    const geometryType = feature.properties?.feature_type || 'point'

    const updatedProperties = {
      ...feature.properties,
      ...properties,
      updated_at: new Date().toISOString()
    }

    layer.feature = {
      ...feature,
      properties: updatedProperties
    }

    const geometry = layer.toGeoJSON().geometry

    const transaction = {
      client_transaction_id: generateId(),
      client_id: apiService.clientId,
      session_id: apiService.clientId,
      operation: feature.properties?.synced ? 'update' : 'create',
      feature_data: {
        id: featureId,
        type: 'Feature',
        geometry: geometry,
        properties: updatedProperties
      }
    }

    try {
      setSyncStatus('syncing')
      const result = await apiService.syncTransactions([transaction])
      
      layer.feature.properties.synced = true
      
      const color = updatedProperties.couleur || '#3388ff'
      layer.setStyle({
        color: color,
        fillColor: color,
        fillOpacity: 0.3,
        weight: geometryType === 'line' ? 6 : 3
      })

      setSyncStatus('synced')
      console.log('✅ Feature sauvegardée:', result)
    } catch (error) {
      console.error('❌ Erreur sauvegarde:', error)
      setSyncStatus('error')
    }
  }

  const deleteFeature = async (featureId) => {
    const transaction = {
      client_transaction_id: generateId(),
      client_id: apiService.clientId,
      session_id: apiService.clientId,
      operation: 'delete',
      feature_data: { id: featureId }
    }

    try {
      setSyncStatus('syncing')
      await apiService.syncTransactions([transaction])
      setSyncStatus('synced')
      console.log('✅ Feature supprimée')
    } catch (error) {
      console.error('❌ Erreur suppression:', error)
      setSyncStatus('error')
    }
  }

  const loadFeatures = async (map) => {
    try {
      const features = await apiService.fetchFeatures()
      const L = window.L
      
      features.forEach(feature => {
        const geoJsonLayer = L.geoJSON(feature.geometry)
        const layer = geoJsonLayer.getLayers()[0]
        
        layer.feature = {
          id: feature.id,
          type: 'Feature',
          properties: { ...feature.properties, synced: true },
          geometry: feature.geometry
        }

        const geometryType = feature.properties.feature_type || 'point'
        const color = feature.properties.couleur || '#3388ff'

        layer.setStyle({
          color: color,
          fillColor: color,
          fillOpacity: 0.3,
          weight: geometryType === 'line' ? 6 : 3
        })

        layer.addTo(map)
        layer.pm.enable()
        featuresRef.current.set(feature.id, layer)

        layer.on('click', () => {
          if (!map.pm.globalRemovalModeEnabled()) {
            openPropertiesModal(layer, feature.id, geometryType)
          }
        })

        layer.on('pm:edit', () => {
          saveFeature(feature.id, layer)
        })
      })

      if (features.length > 0) {
        const group = L.featureGroup(Array.from(featuresRef.current.values()))
        map.fitBounds(group.getBounds().pad(0.1))
      }

      setMessage('✅ Carte prête !')
      console.log(`✅ ${features.length} features chargées`)
    } catch (error) {
      console.error('❌ Erreur chargement features:', error)
      setMessage('✅ Carte prête !')
    }
  }

  const handleSaveModal = () => {
    if (currentFeature) {
      saveFeature(currentFeature.featureId, currentFeature.layer, formData)
      setShowModal(false)
      setCurrentFeature(null)
    }
  }

  const handleLocate = () => {
    if (!mapRef.current) return
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords
          mapRef.current.setView([latitude, longitude], 17)
        },
        (error) => {
          console.error('Erreur géolocalisation:', error)
          alert('Impossible d\'obtenir votre position.')
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      )
    } else {
      alert('Géolocalisation non supportée.')
    }
  }

  const handleRefresh = () => {
    if (mapRef.current) {
      featuresRef.current.forEach(layer => layer.remove())
      featuresRef.current.clear()
      setMessage('🔄 Actualisation...')
      loadFeatures(mapRef.current)
    }
  }

  const handleExportGeoJSON = async () => {
    try {
      const data = await apiService.exportGeoJSON()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `export_${Date.now()}.geojson`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Erreur export:', error)
      alert('Erreur lors de l\'export')
    }
  }

  const handleExportCSV = async () => {
    try {
      const data = await apiService.exportCSV()
      const blob = new Blob([data], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `export_${Date.now()}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Erreur export:', error)
      alert('Erreur lors de l\'export')
    }
  }

  const handleExportHTML = async () => {
    try {
      const data = await apiService.exportHTML()
      const blob = new Blob([data], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `export_${Date.now()}.html`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Erreur export:', error)
      alert('Erreur lors de l\'export')
    }
  }

  const renderFormFields = () => {
    const { geometryType } = currentFeature || {}
    
    switch (geometryType) {
      case 'point':
        return (
          <>
            <SelectField 
              label="Type d'équipement *" 
              name="equipment_type" 
              value={formData.equipment_type} 
              onChange={setFormData}
              required
              options={[
                { value: '', label: '-- Sélectionner --' },
                { value: 'tfo', label: 'Transformateur (Tfo)' },
                { value: 'iacm', label: 'IACM' },
                { value: 'poteau_bt', label: 'Poteau BT' },
                { value: 'poteau_mt', label: 'Poteau MT' }
              ]}
            />
            <SelectField 
              label="Nature" 
              name="nature" 
              value={formData.nature} 
              onChange={setFormData}
              options={[
                { value: '', label: '-- Sélectionner --' },
                { value: 'bois', label: 'Bois' },
                { value: 'petit_jean', label: 'Petit jean' },
                { value: 'beton', label: 'Béton' }
              ]}
            />
            <FormField label="Section (mm²)" name="section" value={formData.section} onChange={setFormData} placeholder="ex: 16, 25, 50" />
            <FormField label="Appartenance" name="owner" value={formData.owner} onChange={setFormData} placeholder="ex: Poste" />
            <FormField label="Description" name="description" value={formData.description} onChange={setFormData} textarea placeholder="Observations, remarques..." />
          </>
        )
      case 'line':
        return (
          <>
            <SelectField 
              label="Type de ligne *" 
              name="line_type" 
              value={formData.line_type} 
              onChange={setFormData}
              required
              options={[
                { value: '', label: '-- Sélectionner --' },
                { value: 'ligne_bt', label: 'Ligne BT (Basse Tension)' },
                { value: 'ligne_hta', label: 'Ligne HTA (Haute Tension)' }
              ]}
            />
            <FormField label="Section (mm²)" name="section" value={formData.section} onChange={setFormData} placeholder="ex: 16, 25, 50" />
            <FormField label="Appartenance" name="owner" value={formData.owner} onChange={setFormData} placeholder="ex: Poste" />
            <FormField label="Description" name="description" value={formData.description} onChange={setFormData} textarea placeholder="Observations, remarques..." />
          </>
        )
      case 'circle':
      case 'polygon':
      case 'rectangle':
        return (
          <>
            <SelectField 
              label="Statut *" 
              name="status" 
              value={formData.status} 
              onChange={setFormData}
              required
              options={[
                { value: '', label: '-- Sélectionner --' },
                { value: 'electrifiee', label: 'Zone électrifiée' },
                { value: 'non_electrifiee', label: 'Zone non électrifiée' }
              ]}
            />
            <FormField label="Nom de la zone" name="zone_name" value={formData.zone_name} onChange={setFormData} placeholder="ex: Quartier Nord, Village A" />
            <FormField label="Population estimée" name="population" value={formData.population} onChange={setFormData} type="number" placeholder="ex: 5000" />
            <FormField label="Description" name="description" value={formData.description} onChange={setFormData} textarea placeholder="Observations, remarques..." />
          </>
        )
      default:
        return (
          <>
            <FormField label="Description" name="description" value={formData.description} onChange={setFormData} textarea placeholder="Observations, remarques..." />
          </>
        )
    }
  }

  return (
    <div className="app">
      <div className="status">{message}</div>
      <div ref={mapContainerRef} className="map-container"></div>
      
      <div className="controls">
        <button onClick={handleLocate} className="control-btn" title="Ma position">
          📍
        </button>
        <button onClick={handleRefresh} className="control-btn" title="Actualiser">
          🔄
        </button>
        <div className="export-group">
          <button onClick={handleExportGeoJSON} className="control-btn export-btn">
            GeoJSON
          </button>
          <button onClick={handleExportCSV} className="control-btn export-btn">
            Tableau
          </button>
          <button onClick={handleExportHTML} className="control-btn export-btn">
            HTML
          </button>
        </div>
      </div>

      <div className={`sync-indicator ${syncStatus}`}>
        {syncStatus === 'synced' && '✓ Synchronisé'}
        {syncStatus === 'syncing' && '⏳ Sync...'}
        {syncStatus === 'error' && '⚠ Erreur'}
      </div>

      {showModal && currentFeature && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Propriétés - {currentFeature.geometryType}</h2>
            <form onSubmit={(e) => { e.preventDefault(); handleSaveModal(); }}>
              {renderFormFields()}
              <FormField label="Remarques" name="remarques" value={formData.remarques} onChange={setFormData} textarea />
              
              <div className="modal-actions">
                <button type="button" onClick={() => setShowModal(false)} className="btn-cancel">
                  Annuler
                </button>
                <button type="submit" className="btn-save">
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function FormField({ label, name, value, onChange, type = 'text', textarea = false, placeholder = '' }) {
  const handleChange = (e) => {
    onChange(prev => ({ ...prev, [name]: e.target.value }))
  }

  return (
    <div className="form-field">
      <label>{label}</label>
      {textarea ? (
        <textarea value={value || ''} onChange={handleChange} rows={3} placeholder={placeholder} />
      ) : (
        <input type={type} value={value || ''} onChange={handleChange} placeholder={placeholder} />
      )}
    </div>
  )
}

function SelectField({ label, name, value, onChange, options, required = false }) {
  const handleChange = (e) => {
    onChange(prev => ({ ...prev, [name]: e.target.value }))
  }

  return (
    <div className="form-field">
      <label>{label}</label>
      <select value={value || ''} onChange={handleChange} required={required}>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}

export default App
