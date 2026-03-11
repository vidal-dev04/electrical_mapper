import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert, SafeAreaView, Dimensions, Modal, ScrollView } from 'react-native';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as Clipboard from 'expo-clipboard';
import uuid from 'react-native-uuid';
import TransactionQueue from './services/TransactionQueue';
import { clearAllLocalData } from './utils/clearLocalData';

export default function App() {
  const webViewRef = useRef(null);
  const [queueStatus, setQueueStatus] = useState({ total: 0, pending: 0, failed: 0 });
  const [isMapReady, setIsMapReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState('synced');
  const [exportModal, setExportModal] = useState({ visible: false, type: '', data: null, stats: null });

  useEffect(() => {
    const clientId = uuid.v4();
    const sessionId = uuid.v4();
    
    TransactionQueue.initialize(clientId, sessionId);

    const unsubscribe = TransactionQueue.addListener((event) => {
      handleQueueEvent(event);
    });

    return () => {
      unsubscribe();
      TransactionQueue.stopAutoSync();
    };
  }, []);

  const requestLocationPermission = async () => {
    try {
      console.log('🌍 Requesting location permission...');
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log('📍 Location permission status:', status);
      
      if (status === 'granted') {
        console.log('📡 Getting current position...');
        const location = await Location.getCurrentPositionAsync({});
        console.log('✅ Location obtained:', location.coords.latitude, location.coords.longitude);
        
        // Inject JavaScript directly to center the map
        if (webViewRef.current) {
          const js = `
            console.log('🗺️ Centering map on position');
            if (typeof map !== 'undefined') {
              map.setView([${location.coords.latitude}, ${location.coords.longitude}], 15);
              console.log('✅ Map centered on: ${location.coords.latitude}, ${location.coords.longitude}');
            } else {
              console.log('❌ Map not ready yet');
            }
            true;
          `;
          console.log('💉 Injecting JavaScript to center map');
          webViewRef.current.injectJavaScript(js);
        }
      } else {
        console.log('❌ Location permission denied');
      }
    } catch (error) {
      console.log('❌ Location error:', error);
    }
  };

  const handleQueueEvent = (event) => {
    console.log('Queue event:', event);
    
    const status = TransactionQueue.getQueueStatus();
    setQueueStatus(status);

    if (event.type === 'sync_started') {
      setSyncStatus('syncing');
    } else if (event.type === 'sync_completed') {
      setSyncStatus('synced');
      
      // Notify WebView of successful transactions
      if (event.successfulTransactions && event.successfulTransactions.length > 0) {
        event.successfulTransactions.forEach(txn => {
          if (txn.operation === 'create') {
            sendToWebView({
              type: 'feature_synced',
              feature_id: txn.feature_id
            });
          }
        });
      }
    } else if (event.type === 'sync_error') {
      setSyncStatus('error');
    }

    if (isMapReady) {
      sendToWebView({
        type: 'sync_status',
        status: syncStatus,
        queue_length: event.queue_length
      });
    }
  };

  const handleMessage = async (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      
      switch (message.type) {
        case 'map_ready':
          setIsMapReady(true);
          loadExistingFeatures();
          requestLocationPermission();
          break;

        case 'feature_created':
          await TransactionQueue.enqueue('create', message.data);
          break;

        case 'feature_updated':
          await TransactionQueue.enqueue('update', message.data);
          break;

        case 'feature_deleted':
          await TransactionQueue.enqueue('delete', message.data);
          break;

        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Message handling error:', error);
    }
  };

  const sendToWebView = (message) => {
    console.log('📤 Sending to WebView:', message.type, 'MapReady:', isMapReady);
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify(message));
      console.log('✅ Message sent to WebView');
    } else {
      console.log('❌ WebView ref not available');
    }
  };

  const loadExistingFeatures = async () => {
    try {
      const response = await fetch(`${TransactionQueue.getApiUrl()}/api/features`);
      if (response.ok) {
        const featureCollection = await response.json();
        sendToWebView({
          type: 'load_features',
          features: featureCollection
        });
      }
    } catch (error) {
      console.error('Failed to load features:', error);
    }
  };

  const handleRetrySync = () => {
    TransactionQueue.processQueue();
  };

  const handleClearQueue = () => {
    Alert.alert(
      'Vider la file',
      'Êtes-vous sûr de vouloir supprimer toutes les transactions en attente?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Vider',
          style: 'destructive',
          onPress: () => TransactionQueue.clearQueue()
        }
      ]
    );
  };

  const handleClearFailedTransactions = async () => {
    const count = await TransactionQueue.clearFailedTransactions();
    Alert.alert('Succès', `${count} transactions échouées supprimées`);
  };

  const handleShowQueueState = () => {
    const status = TransactionQueue.getQueueStatus();
    TransactionQueue.logQueueState();
    
    const message = `Total: ${status.total}\nEn attente: ${status.pending}\nÉchouées: ${status.failed}\nEn cours: ${status.processing ? 'Oui' : 'Non'}\n\nDétails complets dans les logs`;
    
    Alert.alert('📊 État de la queue', message);
  };

  const handleClearAllData = () => {
    Alert.alert(
      '⚠️ ATTENTION',
      'Voulez-vous TOUT effacer ?\n\n' +
      '✓ Queue de transactions locale\n' +
      '✓ Toutes les données AsyncStorage\n' +
      '✓ Tous les dessins sur la carte\n' +
      '✓ TOUTES les features de la base de données\n\n' +
      'Cette action est IRRÉVERSIBLE !',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'TOUT EFFACER',
          style: 'destructive',
          onPress: async () => {
            try {
              // 1. Supprimer les données locales
              const success = await clearAllLocalData();
              if (!success) {
                throw new Error('Échec de la suppression des données locales');
              }
              
              // 2. Supprimer les features de la base de données
              const apiUrl = TransactionQueue.getApiUrl();
              const response = await fetch(`${apiUrl}/features/all`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                }
              });
              
              if (!response.ok) {
                console.warn('⚠️ Erreur lors de la suppression BD, mais données locales effacées');
              } else {
                const result = await response.json();
                console.log(`✅ ${result.deletedCount} features supprimées de la BD`);
              }
              
              // 3. Envoyer message au WebView pour effacer tous les dessins
              sendToWebView({
                type: 'clear_all_features'
              });
              
              Alert.alert(
                'Succès',
                'Toutes les données effacées (local + serveur).\nRechargez l\'app.',
                [{ text: 'OK' }]
              );
            } catch (error) {
              console.error('❌ Erreur lors de l\'effacement:', error);
              Alert.alert('Erreur', `Impossible d'effacer les données: ${error.message}`);
            }
          }
        }
      ]
    );
  };

  const handleRefreshMap = async () => {
    try {
      const response = await fetch(`${TransactionQueue.getApiUrl()}/api/features`);
      if (response.ok) {
        const features = await response.json();
        
        sendToWebView({
          type: 'load_features',
          features: features
        });
      }
    } catch (error) {
      console.error('Refresh error:', error);
    }
  };

  const handleExportGeoJSON = async () => {
    try {
      const response = await fetch(`${TransactionQueue.getApiUrl()}/api/export/geojson`);
      if (response.ok) {
        const data = await response.json();
        
        // Calculer les statistiques
        const stats = {
          total: data.features.length,
          equipments: data.features.filter(f => f.properties.equipment_type).length,
          lines: data.features.filter(f => f.properties.line_type).length,
          zones: data.features.filter(f => f.properties.zone_status).length,
          size: (JSON.stringify(data).length / 1024).toFixed(1) + ' KB',
          date: new Date().toLocaleString('fr-FR')
        };
        
        setExportModal({
          visible: true,
          type: 'GeoJSON',
          data: JSON.stringify(data, null, 2),
          stats: stats
        });
      } else {
        Alert.alert('Erreur', 'Impossible d\'exporter les données');
      }
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert('Erreur', error.message);
    }
  };

  const handleExportCSV = async () => {
    try {
      const response = await fetch(`${TransactionQueue.getApiUrl()}/api/export/html`);
      if (response.ok) {
        const html = await response.text();
        
        // Extraire les statistiques du HTML (regex simple)
        const totalMatch = html.match(/Total<\/div>\s*<div class="stat-value">(\d+)<\/div>/);
        const equipMatch = html.match(/Équipements<\/div>\s*<div class="stat-value">(\d+)<\/div>/);
        const linesMatch = html.match(/Lignes<\/div>\s*<div class="stat-value">(\d+)<\/div>/);
        const zonesMatch = html.match(/Zones<\/div>\s*<div class="stat-value">(\d+)<\/div>/);
        
        const stats = {
          total: totalMatch ? parseInt(totalMatch[1]) : 0,
          equipments: equipMatch ? parseInt(equipMatch[1]) : 0,
          lines: linesMatch ? parseInt(linesMatch[1]) : 0,
          zones: zonesMatch ? parseInt(zonesMatch[1]) : 0,
          size: (html.length / 1024).toFixed(1) + ' KB',
          date: new Date().toLocaleString('fr-FR')
        };
        
        setExportModal({
          visible: true,
          type: 'HTML',
          data: html,
          stats: stats
        });
      } else {
        Alert.alert('Erreur', 'Impossible d\'exporter les données');
      }
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert('Erreur', error.message);
    }
  };

  const handleShareExport = async () => {
    try {
      const { type, data } = exportModal;
      let extension, mimeType;
      
      if (type === 'GeoJSON') {
        extension = 'geojson';
        mimeType = 'application/geo+json';
      } else if (type === 'HTML') {
        extension = 'html';
        mimeType = 'text/html';
      } else {
        extension = 'csv';
        mimeType = 'text/csv';
      }
      
      const filename = `reseau_electrique_${Date.now()}.${extension}`;
      
      // Créer un fichier temporaire
      const fileUri = FileSystem.cacheDirectory + filename;
      await FileSystem.writeAsStringAsync(fileUri, data, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      
      // Vérifier si le partage est disponible
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: mimeType,
          dialogTitle: `Partager ${type === 'HTML' ? 'Tableau' : type}`,
          UTI: mimeType
        });
      } else {
        Alert.alert('Erreur', 'Le partage n\'est pas disponible sur cet appareil');
      }
      
      setExportModal({ visible: false, type: '', data: null, stats: null });
    } catch (error) {
      console.error('Share error:', error);
      Alert.alert('Erreur', `Impossible de partager: ${error.message}`);
    }
  };

  const handleCopyExport = async () => {
    try {
      await Clipboard.setStringAsync(exportModal.data);
      Alert.alert('✅ Copié', `${exportModal.type} copié dans le presse-papier`);
      setExportModal({ visible: false, type: '', data: null, stats: null });
    } catch (error) {
      console.error('Copy error:', error);
      Alert.alert('Erreur', `Impossible de copier: ${error.message}`);
    }
  };

  const mapHtml = require('./assets/map.html');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      
      <View style={styles.header}>
        <Text style={styles.title}>RÉSEAU ÉLECTRIQUE</Text>
      </View>
      
      <View style={styles.floatingButtons}>
        <TouchableOpacity style={styles.exportButton} onPress={handleExportGeoJSON}>
          <Text style={styles.exportText}>📥 GeoJSON</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.exportButton} onPress={handleExportCSV}>
          <Text style={styles.exportText}>📊 Tableau</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.exportButton} onPress={handleRefreshMap}>
          <Text style={styles.exportText}>� Actualiser</Text>
        </TouchableOpacity>
        
        {queueStatus.failed > 0 && (
          <TouchableOpacity style={styles.retryButton} onPress={handleRetrySync}>
            <Text style={styles.retryText}>Réessayer</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal
        visible={exportModal.visible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setExportModal({ visible: false, type: '', data: null, stats: null })}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>📤 Export {exportModal.type}</Text>
            
            {exportModal.stats && (
              <View style={styles.statsContainer}>
                <Text style={styles.statsTitle}>✅ {exportModal.stats.total} features trouvées</Text>
                
                {exportModal.type === 'GeoJSON' && (
                  <View style={styles.statsDetail}>
                    <Text style={styles.statsText}>📍 {exportModal.stats.equipments} Équipements</Text>
                    <Text style={styles.statsText}>━  {exportModal.stats.lines} Lignes</Text>
                    <Text style={styles.statsText}>▭  {exportModal.stats.zones} Zones</Text>
                  </View>
                )}
                
                <Text style={styles.statsText}>📅 {exportModal.stats.date}</Text>
                <Text style={styles.statsText}>📦 {exportModal.stats.size}</Text>
              </View>
            )}
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.shareButton]} 
                onPress={handleShareExport}
              >
                <Text style={styles.modalButtonText}>📤 Partager</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalButton, styles.copyButton]} 
                onPress={handleCopyExport}
              >
                <Text style={styles.modalButtonText}>📋 Copier</Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity 
              style={styles.cancelButton}
              onPress={() => setExportModal({ visible: false, type: '', data: null, stats: null })}
            >
              <Text style={styles.cancelButtonText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <WebView
        ref={webViewRef}
        source={mapHtml}
        style={styles.webview}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        allowFileAccess={true}
        allowUniversalAccessFromFileURLs={true}
        mixedContentMode="always"
      />
    </SafeAreaView>
  );
}

const { width, height } = Dimensions.get('window');
const isSmallScreen = width < 375;
const isTablet = width >= 768;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: height * 0.015,
    backgroundColor: '#2196F3',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  title: {
    fontSize: isSmallScreen ? 18 : isTablet ? 24 : 20,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  floatingButtons: {
    position: 'absolute',
    bottom: 20,
    right: 10,
    zIndex: 1000,
    flexDirection: 'column',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
    justifyContent: 'flex-end',
  },
  statusBadge: {
    paddingHorizontal: isSmallScreen ? 8 : 12,
    paddingVertical: isSmallScreen ? 4 : 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginRight: width * 0.02,
    marginTop: height * 0.005,
  },
  statusSyncing: {
    backgroundColor: '#fff3cd',
  },
  statusSynced: {
    backgroundColor: '#d4edda',
  },
  statusError: {
    backgroundColor: '#f8d7da',
  },
  statusText: {
    fontSize: isSmallScreen ? 10 : isTablet ? 14 : 12,
    fontWeight: '600',
    color: '#333',
  },
  retryButton: {
    paddingHorizontal: isSmallScreen ? 8 : 12,
    paddingVertical: isSmallScreen ? 4 : 6,
    borderRadius: 12,
    backgroundColor: '#fff',
    marginTop: height * 0.005,
  },
  retryText: {
    fontSize: isSmallScreen ? 10 : isTablet ? 14 : 12,
    fontWeight: '600',
    color: '#2196F3',
  },
  exportButton: {
    paddingHorizontal: isSmallScreen ? 8 : 12,
    paddingVertical: isSmallScreen ? 6 : 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.95)',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  exportText: {
    fontSize: isSmallScreen ? 9 : isTablet ? 13 : 11,
    fontWeight: '600',
    color: '#2196F3',
  },
  webview: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#2196F3',
  },
  statsContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  statsDetail: {
    marginLeft: 12,
    marginBottom: 12,
  },
  statsText: {
    fontSize: 15,
    marginVertical: 4,
    color: '#555',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginHorizontal: 6,
    alignItems: 'center',
  },
  shareButton: {
    backgroundColor: '#4CAF50',
  },
  copyButton: {
    backgroundColor: '#2196F3',
  },
  modalButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
  },
});
