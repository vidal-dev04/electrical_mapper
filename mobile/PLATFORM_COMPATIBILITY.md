# 📱 Compatibilité Android/iOS - React Native

## ✅ Problèmes corrigés dans ce projet

### 1. **gap property** (CRITIQUE)
❌ **Problème** : `gap` dans flexbox n'est pas supporté sur Android < API 29 (Android 10)
```javascript
// ❌ NE PAS FAIRE
statusContainer: {
  flexDirection: 'row',
  gap: 8,  // Crash sur Android 9 et inférieur
}
```

✅ **Solution appliquée** : Utiliser `marginRight` ou `marginLeft`
```javascript
// ✅ CORRECT
statusContainer: {
  flexDirection: 'row',
}
statusBadge: {
  marginRight: 8,  // Compatible tous Android/iOS
}
```

### 2. **borderStyle: 'dashed'/'dotted'** (CRITIQUE)
❌ **Problème connu** : Android crash avec `borderStyle: 'dashed'` ou `'dotted'`
```javascript
// ❌ NE JAMAIS FAIRE sur Android
borderStyle: 'dashed',  // Crash: attend boolean, reçoit string
```

✅ **Statut** : Non utilisé dans ce projet ✓

### 3. **Shadow properties** (ATTENTION)
⚠️ **Comportement différent** mais non bloquant :
- `elevation` → Android uniquement
- `shadowColor/shadowOffset/shadowOpacity/shadowRadius` → iOS uniquement

```javascript
// ✅ CORRECT : Utiliser les deux pour support cross-platform
header: {
  elevation: 4,              // Android
  shadowColor: '#000',       // iOS
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.2,
  shadowRadius: 2,
}
```

### 4. **fontWeight** (MINEUR)
⚠️ Valeurs supportées différentes :
- iOS : 'normal', 'bold', '100'-'900'
- Android : 'normal', 'bold' (numériques parfois ignorés)

✅ **Recommandation** : Utiliser 'bold' ou '600'/'700' (safe)

## 🚫 Propriétés à ÉVITER complètement

### Android

| Propriété | Problème | Alternative |
|-----------|----------|-------------|
| `gap` | Crash Android < 10 | `margin` |
| `borderStyle: 'dashed'` | Crash/Boolean error | Bordure solid ou image |
| `borderStyle: 'dotted'` | Crash/Boolean error | Bordure solid ou image |
| `transform: perspective()` | Incohérent | Éviter |

### iOS

| Propriété | Problème | Alternative |
|-----------|----------|-------------|
| `elevation` | Ignoré (Android-only) | Utiliser shadow* |
| `textAlignVertical` | Ignoré | Padding manuel |

## ✅ Bonnes pratiques appliquées

### 1. Utiliser Platform API pour différences critiques
```javascript
import { Platform, StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  container: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
      },
      android: {
        elevation: 4,
      },
    }),
  },
});
```

### 2. Tester sur versions Android minimales
- **Min SDK recommandée** : API 26 (Android 8.0) pour éviter bugs
- **Target SDK** : Dernière version stable

### 3. Éviter propriétés expérimentales
- `gap` → Stable seulement React Native 0.71+ avec Android 10+
- `aspectRatio` → OK mais tester
- `position: 'sticky'` → Non supporté

## 🧪 Checklist de test

Avant déploiement production :

- [ ] Tester sur Android 8.0 minimum (API 26)
- [ ] Tester sur iPhone 6s minimum (iOS 12+)
- [ ] Vérifier les ombres sur les deux plateformes
- [ ] Vérifier les espacements (pas de `gap`)
- [ ] Vérifier les bordures (uniquement `solid`)
- [ ] Tester en mode RTL (right-to-left) si applicable

## 📋 Configuration Expo/React Native de ce projet

**Versions utilisées** :
- React Native : `0.73.2`
- Expo : `~50.0.0`

**Support Android** :
- Min SDK : 21 (Android 5.0) recommandé → mettre 26 en prod
- Target SDK : 34 (Android 14)

**Support iOS** :
- Min version : iOS 13.0
- Target : iOS 17

## 🔧 Si vous ajoutez des styles, vérifiez :

1. **Compatibilité** : https://reactnative.dev/docs/style
2. **Platform differences** : https://reactnative.dev/docs/platform-specific-code
3. **Test Android physique** : Les émulateurs masquent certains bugs

## 🚨 Red flags dans le code

Rechercher ces patterns dangereux :
```bash
# Rechercher gap (dangereux Android <10)
grep -r "gap:" mobile/

# Rechercher borderStyle dashed/dotted
grep -r "borderStyle.*dashed\|dotted" mobile/

# Rechercher transform complexes
grep -r "perspective\|skew" mobile/
```

## ✅ État actuel du projet

**Tous les styles sont compatibles Android/iOS** ✓

- Pas de `gap` utilisé
- Pas de `borderStyle: dashed/dotted`
- Shadows avec fallback Android/iOS
- Propriétés standards uniquement

---

**Document maintenu pour garantir la stabilité cross-platform** 📱✅
