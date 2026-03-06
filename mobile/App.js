import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert, SafeAreaView } from 'react-native';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import uuid from 'react-native-uuid';
import TransactionQueue from './services/TransactionQueue';

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
      sendToWebView({
        type: 'sync_status',
        status: 'syncing',
        queue_length: status.pending
      });
    } else if (event.type === 'sync_completed') {
      setSyncStatus('synced');
      sendToWebView({
        type: 'sync_status',
        status: 'synced',
        queue_length: status.pending
      });
    } else if (event.type === 'sync_error') {
      setSyncStatus('error');
      sendToWebView({
        type: 'sync_status',
        status: 'error',
        queue_length: status.pending
      });
    } else if (event.type === 'queue_updated') {
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
        <Text style={styles.title}>Réseau Électrique</Text>
        
        <View style={styles.statusContainer}>
          <TouchableOpacity style={styles.exportButton} onPress={handleExportGeoJSON}>
            <Text style={styles.exportText}>📥 GeoJSON</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.exportButton} onPress={handleExportCSV}>
            <Text style={styles.exportText}>📊 CSV</Text>
          </TouchableOpacity>
          
          <View style={[
            styles.statusBadge,
            syncStatus === 'syncing' && styles.statusSyncing,
            syncStatus === 'synced' && styles.statusSynced,
            syncStatus === 'error' && styles.statusError
          ]}>
            <Text style={styles.statusText}>
              {syncStatus === 'syncing' ? '⏳' : syncStatus === 'synced' ? '✓' : '⚠'}
              {' '}{queueStatus.pending} en attente
            </Text>
          </View>

          {queueStatus.failed > 0 && (
            <TouchableOpacity style={styles.retryButton} onPress={handleRetrySync}>
              <Text style={styles.retryText}>Réessayer</Text>
            </TouchableOpacity>
          )}
        </View>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#2196F3',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginRight: 8,
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
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  retryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2196F3',
  },
  exportButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    marginRight: 8,
  },
  exportText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2196F3',
  },
  webview: {
    flex: 1,
  },
});
