import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert, SafeAreaView, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import uuid from 'react-native-uuid';
import TransactionQueue from './services/TransactionQueue';
import { clearAllLocalData } from './utils/clearLocalData';

export default function App() {
  const webViewRef = useRef(null);
  const [queueStatus, setQueueStatus] = useState({ total: 0, pending: 0, failed: 0 });
  const [isMapReady, setIsMapReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState('synced');

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
      '✓ Tous les dessins sur la carte\n\n' +
      'Cette action est IRRÉVERSIBLE.\n' +
      'Les données serveur restent intactes.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'TOUT EFFACER',
          style: 'destructive',
          onPress: async () => {
            const success = await clearAllLocalData();
            if (success) {
              // Envoyer message au WebView pour effacer tous les dessins
              sendToWebView({
                type: 'clear_all_features'
              });
              
              Alert.alert(
                'Succès',
                'Données locales et dessins effacés.\nFermez et relancez l\'app.',
                [{ text: 'OK' }]
              );
            } else {
              Alert.alert('Erreur', 'Impossible d\'effacer les données');
            }
          }
        }
      ]
    );
  };

  const handleExportGeoJSON = async () => {
    try {
      const response = await fetch(`${TransactionQueue.getApiUrl()}/api/export/geojson`);
      if (response.ok) {
        const data = await response.json();
        console.log('GeoJSON Export:', JSON.stringify(data, null, 2));
        Alert.alert('Export GeoJSON', `${data.features.length} features exportées. Voir les logs.`);
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
      const response = await fetch(`${TransactionQueue.getApiUrl()}/api/export/csv`);
      if (response.ok) {
        const csv = await response.text();
        console.log('CSV Export:', csv);
        Alert.alert('Export CSV', 'Données exportées. Voir les logs.');
      } else {
        Alert.alert('Erreur', 'Impossible d\'exporter les données');
      }
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert('Erreur', error.message);
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
          <Text style={styles.exportText}>📊 CSV</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.exportButton} onPress={handleShowQueueState}>
          <Text style={styles.exportText}>🔍 Queue</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.exportButton} onPress={handleClearAllData}>
          <Text style={styles.exportText}>🗑️ Effacer</Text>
        </TouchableOpacity>
        
        {queueStatus.failed > 0 && (
          <TouchableOpacity style={styles.retryButton} onPress={handleRetrySync}>
            <Text style={styles.retryText}>Réessayer</Text>
          </TouchableOpacity>
        )}
      </View>

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
});
