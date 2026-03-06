import { useState, useEffect } from 'react';
import { Dimensions } from 'react-native';

/**
 * Hook personnalisé pour gérer la responsivité
 * Détecte les changements d'orientation et de taille d'écran
 */
export const useResponsive = () => {
  const [dimensions, setDimensions] = useState({
    window: Dimensions.get('window'),
    screen: Dimensions.get('screen'),
  });

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window, screen }) => {
      setDimensions({ window, screen });
    });

    return () => subscription?.remove();
  }, []);

  const { width, height } = dimensions.window;
  const isPortrait = height > width;
  const isLandscape = width > height;
  const isSmallScreen = width < 375;
  const isMediumScreen = width >= 375 && width < 768;
  const isTablet = width >= 768;

  return {
    width,
    height,
    isPortrait,
    isLandscape,
    isSmallScreen,
    isMediumScreen,
    isTablet,
    dimensions,
  };
};

/**
 * Utilitaire pour calculer des dimensions responsives
 */
export const getResponsiveSize = (width, baseSize, smallMultiplier = 0.8, tabletMultiplier = 1.2) => {
  if (width < 375) return baseSize * smallMultiplier;
  if (width >= 768) return baseSize * tabletMultiplier;
  return baseSize;
};
