import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { PurchasesPackage } from 'react-native-purchases';

export interface UpgradeSheetProps {
  visible: boolean;
  onClose: () => void;
  reason?: 'dump_limit' | 'email' | 'rhythm' | 'coming_up' | 'history';
}

const BENEFITS = [
  { icon: '✦', text: 'Unlimited brain dumps' },
  { icon: '✉', text: 'Draft emails in seconds' },
  { icon: '∿', text: 'Your weekly Rhythm' },
  { icon: '◎', text: 'Your full history' },
];

export function UpgradeSheet({ visible, onClose, reason }: UpgradeSheetProps) {
  const { packages, purchasePackage, restorePurchases, isWeb } = useSubscription();
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Find the Monthly package from the default offering
  const monthlyPackage: PurchasesPackage | null = (() => {
    for (const pkg of packages) {
      const id = pkg.identifier?.toLowerCase() ?? '';
      if (id.includes('monthly') || id === '$rc_monthly') {
        return pkg;
      }
    }
    return packages.length > 0 ? packages[0] : null;
  })();

  const priceString = (() => {
    if (!monthlyPackage) return 'See pricing';
    const price = monthlyPackage.product?.priceString;
    if (!price) return 'See pricing';
    // Append /month if not already present
    if (String(price).toLowerCase().includes('month')) return String(price);
    return `${String(price)}/month`;
  })();

  const handleSubscribe = async () => {
    if (!monthlyPackage) {
      setErrorMessage('No subscription plan available. Please try again later.');
      return;
    }
    console.log('[UpgradeSheet] Subscribe pressed — reason:', reason, '| package:', monthlyPackage.identifier);
    setErrorMessage(null);
    setPurchasing(true);
    try {
      const success = await purchasePackage(monthlyPackage);
      if (success) {
        console.log('[UpgradeSheet] Purchase successful');
        onClose();
      }
    } catch (err: unknown) {
      console.error('[UpgradeSheet] Purchase error:', err);
      setErrorMessage('Something went wrong. Try again or restore below.');
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    console.log('[UpgradeSheet] Restore purchases pressed');
    setErrorMessage(null);
    setRestoring(true);
    try {
      const success = await restorePurchases();
      if (success) {
        console.log('[UpgradeSheet] Restore successful');
        onClose();
      } else {
        setErrorMessage("Couldn't restore. Contact support if you believe you have an active subscription.");
      }
    } catch (err: unknown) {
      console.error('[UpgradeSheet] Restore error:', err);
      setErrorMessage("Couldn't restore. Contact support if you believe you have an active subscription.");
    } finally {
      setRestoring(false);
    }
  };

  const handleNotYet = () => {
    console.log('[UpgradeSheet] "Not yet" pressed — reason:', reason);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          {/* Drag handle */}
          <View style={styles.dragHandle} />

          {/* Title */}
          <Text style={styles.title}>
            {"You've been getting a lot out of your head."}
          </Text>
          <Text style={styles.subtitle}>
            {"Ready for unlimited?"}
          </Text>

          {/* Benefits */}
          <View style={styles.benefitsList}>
            {BENEFITS.map((b, i) => (
              <View key={i} style={styles.benefitRow}>
                <Text style={styles.benefitIcon}>{b.icon}</Text>
                <Text style={styles.benefitText}>{b.text}</Text>
              </View>
            ))}
          </View>

          {/* Price */}
          <Text style={styles.priceLine}>{priceString}</Text>

          {/* Error message */}
          {errorMessage !== null && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {/* Subscribe button */}
          <TouchableOpacity
            style={[styles.subscribeButton, (purchasing || isWeb) && styles.subscribeButtonDisabled]}
            onPress={handleSubscribe}
            disabled={purchasing || isWeb}
            activeOpacity={0.85}
          >
            {purchasing ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.subscribeButtonText}>One moment…</Text>
              </View>
            ) : (
              <Text style={styles.subscribeButtonText}>Subscribe</Text>
            )}
          </TouchableOpacity>

          {/* Not yet */}
          <TouchableOpacity onPress={handleNotYet} activeOpacity={0.7} style={styles.notYetButton}>
            <Text style={styles.notYetText}>Not yet</Text>
          </TouchableOpacity>

          {/* Restore */}
          <TouchableOpacity onPress={handleRestore} disabled={restoring} activeOpacity={0.7} style={styles.restoreButton}>
            {restoring ? (
              <ActivityIndicator size="small" color="#9E8E87" />
            ) : (
              <Text style={styles.restoreText}>Already subscribed? Restore</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(63, 49, 44, 0.45)',
  },
  sheet: {
    backgroundColor: '#FFFDFC',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 28,
    paddingBottom: 40,
    paddingTop: 8,
    gap: 0,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E8DDD5',
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Nunito_600SemiBold',
    color: '#3F312C',
    textAlign: 'center',
    lineHeight: 30,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Nunito_400Regular',
    color: '#9E8E87',
    textAlign: 'center',
    marginBottom: 24,
  },
  benefitsList: {
    gap: 14,
    marginBottom: 24,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  benefitIcon: {
    fontSize: 18,
    color: '#C98B95',
    width: 24,
    textAlign: 'center',
  },
  benefitText: {
    fontSize: 15,
    fontFamily: 'Nunito_400Regular',
    color: '#3F312C',
    flex: 1,
  },
  priceLine: {
    fontSize: 15,
    fontFamily: 'Nunito_600SemiBold',
    color: '#8B4A52',
    textAlign: 'center',
    marginBottom: 20,
  },
  errorBox: {
    backgroundColor: '#C8846022',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#C8846044',
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
    fontFamily: 'Nunito_400Regular',
    color: '#C08060',
    textAlign: 'center',
    lineHeight: 18,
  },
  subscribeButton: {
    backgroundColor: '#8B4A52',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8B4A52',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
    marginBottom: 14,
  },
  subscribeButtonDisabled: {
    opacity: 0.6,
  },
  subscribeButtonText: {
    fontSize: 17,
    fontFamily: 'Nunito_600SemiBold',
    color: '#FFFFFF',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  notYetButton: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 8,
  },
  notYetText: {
    fontSize: 15,
    fontFamily: 'Nunito_400Regular',
    color: '#9E8E87',
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  restoreText: {
    fontSize: 13,
    fontFamily: 'Nunito_400Regular',
    color: '#9E8E87',
    textDecorationLine: 'underline',
  },
});
