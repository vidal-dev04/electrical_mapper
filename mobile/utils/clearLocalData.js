import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Efface TOUTES les données locales de l'application
 * À utiliser pour repartir complètement à zéro
 */
export const clearAllLocalData = async () => {
  try {
    console.log('🗑️  Suppression des données locales...');
    
    // Supprimer la queue de transactions
    await AsyncStorage.removeItem('@electrical_network:transaction_queue');
    console.log('✅ Queue de transactions supprimée');
    
    // Supprimer toutes les autres clés (au cas où)
    const allKeys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(allKeys);
    console.log(`✅ ${allKeys.length} clés supprimées de AsyncStorage`);
    
    console.log('🎉 Données locales effacées ! Rechargez l\'app.');
    return true;
  } catch (error) {
    console.error('❌ Erreur lors de l\'effacement:', error);
    return false;
  }
};

/**
 * Efface uniquement la queue de transactions
 * Utile pour nettoyer sans tout perdre
 */
export const clearTransactionQueue = async () => {
  try {
    console.log('🗑️  Suppression de la queue...');
    await AsyncStorage.removeItem('@electrical_network:transaction_queue');
    console.log('✅ Queue supprimée !');
    return true;
  } catch (error) {
    console.error('❌ Erreur:', error);
    return false;
  }
};
