import { useState, useEffect, useRef } from 'react'
import { useAuth } from './contexts/AuthContext.jsx'
import LoginPage from './components/LoginPage.jsx'
import Dashboard from './components/Dashboard.jsx'
import apiService from './services/api.js'
import './App.css'

function App() {
  const { user, loading, isAuthenticated, isSuperviseur, logout } = useAuth()
  const [message, setMessage] = useState('Initialisation...')
  const [syncStatus, setSyncStatus] = useState('synced')
  const [showDashboard, setShowDashboard] = useState(false)
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const featuresRef = useRef(new Map())
  const locationMarkerRef = useRef(null)
  const watchIdRef = useRef(null)
  const [showModal, setShowModal] = useState(false)
  const [currentFeature, setCurrentFeature] = useState(null)
  const [formData, setFormData] = useState({})
  const [showImportModal, setShowImportModal] = useState(false)
  const [importData, setImportData] = useState(null)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, importing: false })
  const [errorModal, setErrorModal] = useState({ show: false, title: '', message: '' })
  const [userName, setUserName] = useState('')
  const [showUserModal, setShowUserModal] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!isAuthenticated) return
    
    apiService.clientId = user?.username || null
    
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
      // Arrêter le suivi GPS
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [isAuthenticated])

  const generateId = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  const getFeatureColor = (geometryType, properties) => {
    if (!properties) return '#3388ff'
    
    // ÉQUIPEMENTS (Points)
    if (geometryType === 'point') {
      const equipType = properties.equipment_type || properties.type
      if (!equipType) return '#3388ff'
      
      const type = equipType.toString().toLowerCase()
      if (type === 'tfo') return '#9c27b0' // Violet - Transformateur
      if (type === 'iacm') return '#4caf50' // Vert - IACM
      if (type === 'poteau_bt') return '#ff8800' // Orange - Poteau BT
      if (type === 'poteau_mt') return '#0066ff' // Bleu - Poteau MT
      
      return '#3388ff'
    }
    
    // LIGNES
    if (geometryType === 'line') {
      const lineType = properties.line_type || properties.type
      if (!lineType) return '#3388ff'
      
      const type = lineType.toString().toLowerCase()
      if (type === 'ligne_bt') return '#ff8800' // Orange - Ligne BT
      if (type === 'ligne_hta') return '#ff0000' // Rouge - Ligne HTA
      
      return '#3388ff'
    }
    
    // ZONES (Polygones/Rectangles/Cercles)
    if (geometryType === 'polygon' || geometryType === 'circle' || geometryType === 'rectangle') {
      const zoneStatus = properties.status
      if (!zoneStatus) return '#3388ff'
      
      const status = zoneStatus.toString().toLowerCase()
      if (status === 'electrifiee') return '#4caf50' // Vert - Électrifiée
      if (status === 'non_electrifiee') return '#ff0000' // Rouge - Non électrifiée
      
      return '#3388ff'
    }
    
    return '#3388ff'
  }

  const initMap = () => {
    if (!mapContainerRef.current || mapRef.current) return

    try {
      const L = window.L
      
      const map = L.map(mapContainerRef.current, { maxZoom: 20 }).setView([0, 0], 2)
      
      const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: ' OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map)

      const satelliteLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        attribution: ' Google',
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
      })

      const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: ' OpenTopoMap (CC-BY-SA)',
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

        const color = getFeatureColor(geometryType, layer.feature.properties)

        // setStyle() ne fonctionne que sur les polylines/polygones, pas sur les markers
        if (layer.setStyle && typeof layer.setStyle === 'function') {
          layer.setStyle({
            color: color,
            fillColor: color,
            fillOpacity: 0.3,
            weight: geometryType === 'line' ? 6 : 3
          })
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
      
      console.log(' Carte initialisée')
    } catch (error) {
      setMessage(' Erreur: ' + error.message)
      console.error(' Erreur initialisation:', error)
    }
  }

  const openPropertiesModal = (layer, featureId, geometryType) => {
    const properties = layer.feature?.properties || {}
    console.log(' Propriétés chargées:', properties)
    console.log(' Type de géométrie:', geometryType)
    setCurrentFeature({ layer, featureId, geometryType })
    setFormData(properties)
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

    // Appliquer la couleur selon le type
    const color = getFeatureColor(geometryType, updatedProperties)
    if (layer.setStyle && typeof layer.setStyle === 'function') {
      layer.setStyle({
        color: color,
        fillColor: color,
        fillOpacity: 0.3,
        weight: geometryType === 'line' ? 6 : 3
      })
    }

    layer.feature = {
      ...feature,
      properties: updatedProperties
    }

    // Pour les cercles, sauvegarder le rayon et le centre
    let geometry
    if (geometryType === 'circle' && layer.getRadius) {
      const latLng = layer.getLatLng()
      geometry = {
        type: 'Point',
        coordinates: [latLng.lng, latLng.lat]
      }
      updatedProperties.radius = layer.getRadius()
      updatedProperties.circle = true
    } else {
      geometry = layer.toGeoJSON().geometry
    }

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

      setSyncStatus('synced')
      console.log(' Feature sauvegardée:', result)
    } catch (error) {
      console.error(' Erreur sauvegarde:', error)
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
      console.log(' Feature supprimée')
    } catch (error) {
      console.error(' Erreur suppression:', error)
      setSyncStatus('error')
    }
  }

  const loadFeatures = async (map) => {
    try {
      const features = await apiService.fetchFeatures()
      const L = window.L
      
      features.forEach(feature => {
        let layer
        let geometryType = 'point'
        
        // Vérifier si c'est un cercle (Point avec radius)
        if (feature.geometry.type === 'Point' && feature.properties.circle && feature.properties.radius) {
          geometryType = 'circle'
          const coords = feature.geometry.coordinates
          layer = L.circle([coords[1], coords[0]], {
            radius: feature.properties.radius
          })
        } else {
          // Géométrie normale (GeoJSON)
          const geoJsonLayer = L.geoJSON(feature.geometry)
          layer = geoJsonLayer.getLayers()[0]
          
          // Déterminer le type de géométrie basé sur geometry.type
          if (feature.geometry.type === 'Point') {
            geometryType = 'point'
          } else if (feature.geometry.type === 'LineString') {
            geometryType = 'line'
          } else if (feature.geometry.type === 'Polygon') {
            geometryType = 'polygon'
          }
        }
        
        layer.feature = {
          id: feature.id,
          type: 'Feature',
          properties: { ...feature.properties, feature_type: geometryType, synced: true },
          geometry: feature.geometry
        }

        const color = getFeatureColor(geometryType, feature.properties)

        // setStyle() ne fonctionne que sur les polylines/polygones, pas sur les markers
        if (layer.setStyle && typeof layer.setStyle === 'function') {
          layer.setStyle({
            color: color,
            fillColor: color,
            fillOpacity: 0.3,
            weight: geometryType === 'line' ? 6 : 3
          })
        }

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

      setMessage('✅ ELECTRICAL NETWORK MAPPER')
      console.log(`✅ ${features.length} features chargées`)
    } catch (error) {
      console.error('❌ Erreur chargement features:', error)
      setMessage('✅ ELECTRICAL NETWORK MAPPER')
    }
  }

  const handleSaveModal = () => {
    if (currentFeature) {
      saveFeature(currentFeature.featureId, currentFeature.layer, formData)
      setShowModal(false)
      setCurrentFeature(null)
    }
  }

  const startLocationTracking = () => {
    if (!mapRef.current || !navigator.geolocation) {
      alert('Géolocalisation non supportée.')
      return
    }

    const L = window.L

    // Arrêter le suivi précédent si existant
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current)
    }

    // Démarrer le suivi en temps réel
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords

        // Créer ou mettre à jour le marqueur de position
        if (!locationMarkerRef.current) {
          // Créer le marqueur bleu avec un cercle
          locationMarkerRef.current = L.circleMarker([latitude, longitude], {
            radius: 8,
            fillColor: '#4285F4',
            color: '#ffffff',
            weight: 3,
            opacity: 1,
            fillOpacity: 0.9
          }).addTo(mapRef.current)

          // Ajouter un cercle de précision
          L.circle([latitude, longitude], {
            radius: accuracy,
            fillColor: '#4285F4',
            color: '#4285F4',
            weight: 1,
            opacity: 0.3,
            fillOpacity: 0.1
          }).addTo(mapRef.current)

          // Centrer la carte sur la position
          mapRef.current.setView([latitude, longitude], 17)
        } else {
          // Mettre à jour la position du marqueur
          locationMarkerRef.current.setLatLng([latitude, longitude])
        }
      },
      (error) => {
        console.error('Erreur géolocalisation:', error)
        alert('Impossible d\'obtenir votre position.')
      },
      { 
        enableHighAccuracy: true, 
        timeout: 10000, 
        maximumAge: 0 
      }
    )
  }

  const handleLocate = () => {
    if (!mapRef.current) return
    startLocationTracking()
  }

  const handleRefresh = () => {
    if (mapRef.current) {
      featuresRef.current.forEach(layer => layer.remove())
      featuresRef.current.clear()
      setMessage('🔄 Actualisation...')
      loadFeatures(mapRef.current)
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleUserNameSubmit = (e) => {
    e.preventDefault()
    const name = e.target.userName.value.trim()
    if (name) {
      setUserName(name)
      localStorage.setItem('userName', name)
      apiService.clientId = name
      setShowUserModal(false)
    }
  }

  const handleChangeUser = () => {
    setShowUserModal(true)
  }

  const validateGeoJSON = (geojson) => {
    const errors = []
    
    if (!geojson || typeof geojson !== 'object') {
      errors.push('Fichier invalide')
      return { valid: false, errors }
    }
    
    if (geojson.type !== 'FeatureCollection') {
      errors.push('Le fichier doit être une FeatureCollection')
      return { valid: false, errors }
    }
    
    if (!geojson.features || !Array.isArray(geojson.features)) {
      errors.push('Aucune feature trouvée')
      return { valid: false, errors }
    }
    
    if (geojson.features.length === 0) {
      errors.push('Le fichier est vide')
      return { valid: false, errors }
    }
    
    if (geojson.features.length > 1000) {
      errors.push('Limite de 1000 features dépassée (' + geojson.features.length + ' features)')
      return { valid: false, errors }
    }
    
    const geometryTypes = new Set()
    const supportedTypes = ['Point', 'LineString', 'Polygon']
    
    geojson.features.forEach(f => {
      if (f.geometry && f.geometry.type) {
        if (f.geometry.type === 'Point' && f.properties?.circle) {
          geometryTypes.add('Circle')
        } else if (supportedTypes.includes(f.geometry.type)) {
          geometryTypes.add(f.geometry.type)
        } else {
          errors.push('Type de géométrie non supporté: ' + f.geometry.type)
        }
      }
    })
    
    if (errors.length > 0) {
      return { valid: false, errors }
    }
    
    if (geometryTypes.size === 0) {
      errors.push('Aucun type de géométrie valide détecté')
      return { valid: false, errors }
    }
    
    if (geometryTypes.size > 1) {
      errors.push('Plusieurs types de géométrie détectés: ' + Array.from(geometryTypes).join(', ') + '. Un seul type par fichier.')
      return { valid: false, errors }
    }
    
    const detectedType = Array.from(geometryTypes)[0]
    return { valid: true, errors: [], geometryType: detectedType }
  }

  const detectImportMode = (features) => {
    if (features.length === 0) return 'external'
    
    const firstFeature = features[0]
    const props = firstFeature.properties || {}
    
    if (props.equipment_type || props.line_type || props.status) {
      return 'native'
    }
    
    return 'external'
  }

  const mapGeometryType = (geoType) => {
    const mapping = {
      'Point': 'point',
      'LineString': 'line',
      'Polygon': 'polygon',
      'Circle': 'circle'
    }
    return mapping[geoType] || 'point'
  }

  const normalizeFeatureType = (featureType, geometryType) => {
    if (!featureType) return mapGeometryType(geometryType)
    
    const mobileToWebMapping = {
      'Marker': 'point',
      'Line': 'line',
      'Polygon': 'polygon',
      'Rectangle': 'polygon',
      'Circle': 'circle'
    }
    
    return mobileToWebMapping[featureType] || featureType.toLowerCase()
  }

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    try {
      const text = await file.text()
      const geojson = JSON.parse(text)
      
      const validation = validateGeoJSON(geojson)
      
      if (!validation.valid) {
        setErrorModal({
          show: true,
          title: 'Erreur de validation',
          message: validation.errors.join('\n')
        })
        event.target.value = ''
        return
      }
      
      const mode = detectImportMode(geojson.features)
      const featureType = mapGeometryType(validation.geometryType)
      
      setImportData({
        fileName: file.name,
        features: geojson.features,
        geometryType: validation.geometryType,
        featureType: featureType,
        mode: mode,
        total: geojson.features.length
      })
      
      setShowImportModal(true)
      event.target.value = ''
      
    } catch (error) {
      setErrorModal({
        show: true,
        title: 'Erreur de lecture du fichier',
        message: error.message
      })
      event.target.value = ''
    }
  }

  const processImport = async () => {
    if (!importData) return
    
    setImportProgress({ current: 0, total: importData.total, importing: true })
    
    const features = importData.features
    const batchSize = 50
    let successCount = 0
    let errorCount = 0
    const errors = []
    
    for (let i = 0; i < features.length; i += batchSize) {
      const batch = features.slice(i, Math.min(i + batchSize, features.length))
      
      const transactions = batch.map(feature => {
        const featureId = generateId()
        let properties = { ...feature.properties }
        
        let geoType = feature.geometry.type
        if (geoType === 'Point' && feature.properties?.circle) {
          geoType = 'Circle'
        }
        
        if (importData.mode === 'native') {
          properties.feature_type = normalizeFeatureType(properties.feature_type, geoType)
        } else {
          properties.feature_type = mapGeometryType(geoType)
        }
        
        let geometry = feature.geometry
        
        if (feature.properties?.circle && feature.properties?.radius) {
          properties.circle = true
          properties.radius = feature.properties.radius
        }
        
        return {
          client_transaction_id: generateId(),
          client_id: apiService.clientId,
          session_id: apiService.clientId,
          operation: 'create',
          feature_data: {
            id: featureId,
            type: 'Feature',
            geometry: geometry,
            properties: properties
          }
        }
      })
      
      try {
        await apiService.syncTransactions(transactions)
        successCount += transactions.length
      } catch (error) {
        for (const transaction of transactions) {
          try {
            await apiService.syncTransactions([transaction])
            successCount++
          } catch (err) {
            errorCount++
            errors.push({
              id: transaction.feature_data.id,
              error: err.message
            })
          }
        }
      }
      
      setImportProgress({ current: successCount + errorCount, total: importData.total, importing: true })
    }
    
    setImportProgress({ current: importData.total, total: importData.total, importing: false })
    
    let resultMessage = `✅ ${successCount}/${importData.total} features importées`
    if (errorCount > 0) {
      resultMessage += `\n❌ ${errorCount} erreurs`
      if (errors.length > 0 && errors.length <= 5) {
        resultMessage += ':\n' + errors.map(e => `  • ${e.error}`).join('\n')
      }
    }
    
    setErrorModal({
      show: true,
      title: errorCount > 0 ? 'Import terminé avec erreurs' : 'Import réussi',
      message: resultMessage
    })
    
    setShowImportModal(false)
    setImportData(null)
    
    if (mapRef.current && successCount > 0) {
      featuresRef.current.forEach(layer => layer.remove())
      featuresRef.current.clear()
      await loadFeatures(mapRef.current)
    }
  }

  const getGeometryTypeLabel = (type) => {
    const labels = {
      'Point': 'Équipements (Points)',
      'LineString': 'Lignes',
      'Polygon': 'Zones (Polygones)',
      'Circle': 'Zones (Cercles)'
    }
    return labels[type] || type
  }


  const getModeLabel = (mode) => {
    if (mode === 'native') {
      return 'Export de votre app → Import direct'
    }
    return 'GeoJSON externe → Mapping automatique'
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

  if (loading) {
    return (
      <div className="app loading-screen">
        <div className="loading-message">⏳ Chargement...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage />
  }

  if (isSuperviseur && showDashboard) {
    return <Dashboard onClose={() => setShowDashboard(false)} />
  }

  return (
    <div className="app">
      <div className="user-bar">
        <span className="user-name">
          👤 {user?.fullName || user?.username} {isSuperviseur && '(Superviseur)'}
        </span>
        <div className="user-actions">
          {isSuperviseur && (
            <button onClick={() => setShowDashboard(true)} className="dashboard-btn" title="Tableau de bord">
              📊
            </button>
          )}
          <button onClick={logout} className="logout-btn" title="Déconnexion">
            🚪
          </button>
        </div>
      </div>
      <div className="status">{message}</div>
      <div ref={mapContainerRef} className="map-container"></div>
      
      <div className="controls">
        <button onClick={handleLocate} className="control-btn" title="Ma position">
          📍
        </button>
        <button onClick={handleRefresh} className="control-btn" title="Actualiser">
          🔄
        </button>
        <button onClick={handleImportClick} className="control-btn import-btn" title="Importer GeoJSON">
          📂
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".geojson,.json"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
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

      {showUserModal && (
        <div className="modal-overlay">
          <div className="modal-content user-modal" onClick={(e) => e.stopPropagation()}>
            <h2>👤 Bienvenue</h2>
            <p className="user-modal-subtitle">Pour tracer vos actions, entrez votre nom :</p>
            <form onSubmit={handleUserNameSubmit}>
              <div className="form-field">
                <input
                  type="text"
                  name="userName"
                  autoFocus
                  required
                  defaultValue={userName}
                />
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn-save">
                  Valider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {errorModal.show && (
        <div className="modal-overlay" onClick={() => setErrorModal({ show: false, title: '', message: '' })}>
          <div className="modal-content error-modal" onClick={(e) => e.stopPropagation()}>
            <div className="error-header">
              <h2>{errorModal.title.includes('réussi') ? '✅' : '❌'} {errorModal.title}</h2>
            </div>
            <div className="error-body">
              <p style={{ whiteSpace: 'pre-line' }}>{errorModal.message}</p>
            </div>
            <div className="modal-actions">
              <button 
                type="button" 
                onClick={() => setErrorModal({ show: false, title: '', message: '' })} 
                className="btn-save"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && importData && (
        <div className="modal-overlay" onClick={() => !importProgress.importing && setShowImportModal(false)}>
          <div className="modal-content import-modal" onClick={(e) => e.stopPropagation()}>
            <h2>📂 Import GeoJSON</h2>
            
            {!importProgress.importing ? (
              <>
                <div className="import-info">
                  <div className="info-row">
                    <strong>Fichier :</strong> {importData.fileName}
                  </div>
                  <div className="info-row">
                    <strong>Type :</strong> {getGeometryTypeLabel(importData.geometryType)}
                  </div>
                  <div className="info-row">
                    <strong>Total :</strong> {importData.total} features
                  </div>
                  <div className="info-row">
                    <strong>Import par batch de :</strong> 50 features
                  </div>
                  <div className="info-row mode-info">
                    <strong>Mode :</strong> {getModeLabel(importData.mode)}
                  </div>
                </div>
                
                <div className="preview-section">
                  <h3>📋 Aperçu ({Math.min(3, importData.features.length)} premiers)</h3>
                  <div className="preview-list">
                    {importData.features.slice(0, 3).map((feature, idx) => {
                      const props = feature.properties || {}
                      const coords = feature.geometry.coordinates
                      let coordStr = ''
                      if (feature.geometry.type === 'Point') {
                        coordStr = `${coords[1].toFixed(4)}, ${coords[0].toFixed(4)}`
                      } else {
                        coordStr = `${coords[0]?.length || 0} points`
                      }
                      
                      let label = props.name || props.nom || props.equipment_type || props.line_type || props.type || 'Feature'
                      
                      return (
                        <div key={idx} className="preview-item">
                          <div className="preview-label">{idx + 1}. {label}</div>
                          <div className="preview-coords">{coordStr}</div>
                        </div>
                      )
                    })}
                    {importData.features.length > 3 && (
                      <div className="preview-more">... et {importData.features.length - 3} autres</div>
                    )}
                  </div>
                </div>
                
                <div className="modal-actions">
                  <button type="button" onClick={() => setShowImportModal(false)} className="btn-cancel">
                    Annuler
                  </button>
                  <button type="button" onClick={processImport} className="btn-save">
                    ✅ Importer ({importData.total})
                  </button>
                </div>
              </>
            ) : (
              <div className="import-progress">
                <h3>⏳ Import en cours...</h3>
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                  ></div>
                </div>
                <div className="progress-text">
                  {importProgress.current} / {importProgress.total} features
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showModal && currentFeature && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>
              {currentFeature.geometryType === 'point' && 'Équipement'}
              {currentFeature.geometryType === 'line' && 'Ligne'}
              {(currentFeature.geometryType === 'polygon' || currentFeature.geometryType === 'circle' || currentFeature.geometryType === 'rectangle') && 'Zone'}
            </h2>
            <form onSubmit={(e) => { e.preventDefault(); handleSaveModal(); }}>
              {renderFormFields()}
              
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
