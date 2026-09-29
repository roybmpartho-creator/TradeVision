import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Pressable,
  NativeEventEmitter,
  NativeModules,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAnalyzeChart, type ChartAnalysis } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

type SignalLog = ChartAnalysis & { id: string; createdAt: string };
type OverlayState = 'idle' | 'analyzing' | 'result' | 'warning';
type NativeCapture = { imageBase64: string; mimeType: 'image/png' | 'image/jpeg' | 'image/webp' };
type NativeOverlayModule = {
  hasOverlayPermission: () => Promise<boolean>;
  hasScreenCapturePermission: () => Promise<boolean>;
  requestOverlayPermission: () => Promise<boolean>;
  requestScreenCapturePermission: () => Promise<boolean>;
  startOverlay: () => Promise<boolean>;
  stopOverlay: () => Promise<boolean>;
  captureNow: () => void;
  setOverlayState: (state: string, label?: string, message?: string | null) => void;
};

const LOGS_KEY = 'overlay-signal-logs';
const NO_CHART_MESSAGE = 'No active trading chart detected. Please switch to your chart.';
const nativeOverlay = Platform.OS === 'android'
  ? (NativeModules.OverlayModule as NativeOverlayModule | undefined)
  : undefined;
const DEMO_LOGS: SignalLog[] = [
  { id: 'demo-1', chartDetected: true, asset: 'XAUUSD', timeframe: 'M1', signal: 'GREEN', confidence: 94, reason: 'Lower-wick rejection at intraday support with bullish body expansion.', createdAt: '09:41:18' },
  { id: 'demo-2', chartDetected: true, asset: 'EURUSD', timeframe: 'M1', signal: 'RED', confidence: 91, reason: 'Upper-wick rejection below resistance suggests short-term exhaustion.', createdAt: '09:36:04' },
  { id: 'demo-3', chartDetected: true, asset: 'OTC', timeframe: 'M1', signal: 'GREEN', confidence: 88, reason: 'Momentum is holding above the demand zone into the close.', createdAt: '09:29:52' },
];

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function SignalDesk() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [overlayState, setOverlayState] = useState<OverlayState>('idle');
  const [signal, setSignal] = useState<ChartAnalysis | null>(null);
  const [logs, setLogs] = useState<SignalLog[]>(DEMO_LOGS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { mutateAsync: analyzeChart, isPending } = useAnalyzeChart();

  const processCapture = async (capture: NativeCapture) => {
    setSignal(null);
    setErrorMessage(null);
    setOverlayState('analyzing');
    nativeOverlay?.setOverlayState('analyzing', 'ANALYZING...', null);

    try {
      const result = await analyzeChart({
        data: {
          imageBase64: capture.imageBase64,
          mimeType: capture.mimeType,
        },
      });

      if (!result.chartDetected || !result.signal) {
        setOverlayState('warning');
        setErrorMessage(NO_CHART_MESSAGE);
        nativeOverlay?.setOverlayState('warning', 'NO CHART', NO_CHART_MESSAGE);
        if (Platform.OS === 'android') {
          ToastAndroid.show(NO_CHART_MESSAGE, ToastAndroid.LONG);
        }
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }

      setSignal(result);
      setOverlayState('result');
      nativeOverlay?.setOverlayState(
        result.signal === 'GREEN' ? 'green' : 'red',
        `${result.signal} ${result.confidence}%`,
        null,
      );
      setLogs((previous) => [
        {
          ...result,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: formatTime(new Date()),
        },
        ...previous.filter((entry) => !entry.id.startsWith('demo-')),
      ].slice(0, 12));
      await Haptics.notificationAsync(
        result.signal === 'GREEN'
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      );
    } catch {
      setOverlayState('idle');
      nativeOverlay?.setOverlayState('idle', 'SCAN', null);
      setErrorMessage('We could not read that chart. Choose a clearer screenshot and try again.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  useEffect(() => {
    AsyncStorage.getItem(LOGS_KEY).then((stored) => {
      if (stored) {
        try {
          setLogs(JSON.parse(stored) as SignalLog[]);
        } catch {
          setLogs(DEMO_LOGS);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (!nativeOverlay) return;
    const emitter = new NativeEventEmitter();
    const captureSubscription = emitter.addListener('OverlayCapture', (capture: NativeCapture) => {
      void processCapture(capture);
    });
    const statusSubscription = emitter.addListener('OverlayStatus', (status: { enabled: boolean; state: OverlayState }) => {
      setOverlayEnabled(status.enabled);
      setOverlayState(status.state);
    });

    let screenCapturePrompted = false;
    const requestScreenCaptureIfReady = async () => {
      if (screenCapturePrompted || !(await nativeOverlay.hasOverlayPermission()) || await nativeOverlay.hasScreenCapturePermission()) return;
      screenCapturePrompted = true;
      const granted = await nativeOverlay.requestScreenCapturePermission();
      if (!granted) {
        setErrorMessage('Screen capture permission is required to scan the active chart.');
      }
    };
    const requestInitialOverlayPermission = async () => {
      const alreadyGranted = await nativeOverlay.hasOverlayPermission();
      if (!alreadyGranted) {
        await nativeOverlay.requestOverlayPermission();
        setErrorMessage('Allow Display over other apps, then return here to enable the overlay.');
      } else {
        await requestScreenCaptureIfReady();
      }
    };
    void requestInitialOverlayPermission();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void requestScreenCaptureIfReady();
    });

    return () => {
      captureSubscription.remove();
      statusSubscription.remove();
      appStateSubscription.remove();
    };
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(LOGS_KEY, JSON.stringify(logs)).catch(() => undefined);
  }, [logs]);

  const overlayLabel = useMemo(() => {
    if (overlayState === 'analyzing' || isPending) return 'ANALYZING...';
    if (overlayState === 'warning') return 'NO CHART';
    if (signal?.signal === 'RED') return `RED ${signal.confidence}%`;
    if (signal?.signal === 'GREEN') return `GREEN ${signal.confidence}%`;
    return 'SCAN';
  }, [isPending, overlayState, signal]);

  const handleOverlayToggle = async () => {
    if (!overlayEnabled) {
      if (!nativeOverlay) {
        setOverlayEnabled(true);
        return;
      }
      if (!(await nativeOverlay.hasOverlayPermission())) {
        await nativeOverlay.requestOverlayPermission();
        setErrorMessage('Allow Display over other apps, then return here to enable the overlay.');
        return;
      }
      if (!(await nativeOverlay.hasScreenCapturePermission())) {
        const granted = await nativeOverlay.requestScreenCapturePermission();
        if (!granted) {
          setErrorMessage('Screen capture permission is required to scan the active chart.');
          return;
        }
      }
      await nativeOverlay.startOverlay();
      setOverlayEnabled(true);
      return;
    }

    if (nativeOverlay) {
      await nativeOverlay.stopOverlay();
    }
    setOverlayEnabled(false);
    setOverlayState('idle');
    setSignal(null);
  };

  const handleScan = async () => {
    setSignal(null);
    setErrorMessage(null);
    setOverlayState('analyzing');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (nativeOverlay && overlayEnabled) {
      nativeOverlay.captureNow();
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      base64: true,
      quality: 0.85,
    });

    if (picked.canceled || !picked.assets[0]?.base64) {
      setOverlayState('idle');
      return;
    }

    await processCapture({
      imageBase64: picked.assets[0].base64,
      mimeType: (picked.assets[0].mimeType ?? 'image/jpeg') as NativeCapture['mimeType'],
    });
  };

  const renderLog = ({ item }: { item: SignalLog }) => {
    const isGreen = item.signal === 'GREEN';
    return (
      <View style={[styles.logRow, { borderBottomColor: colors.border }]}>
        <View style={[styles.signalDot, { backgroundColor: isGreen ? colors.green : colors.red }]} />
        <View style={styles.logMain}>
          <View style={styles.logTitleRow}>
            <Text style={[styles.logAsset, { color: colors.foreground }]}>{item.asset}</Text>
            <Text style={[styles.logTime, { color: colors.mutedForeground }]}>{item.createdAt}</Text>
          </View>
          <Text numberOfLines={1} style={[styles.logReason, { color: colors.mutedForeground }]}>{item.reason}</Text>
        </View>
        <View style={[styles.logBadge, { backgroundColor: isGreen ? 'rgba(115,210,181,0.14)' : 'rgba(240,109,106,0.14)' }]}>
          <Text style={[styles.logSignal, { color: isGreen ? colors.green : colors.red }]}>{item.signal}</Text>
          <Text style={[styles.logConfidence, { color: colors.foreground }]}>{item.confidence}%</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 18 }]}>
      <FlatList
        data={logs}
        renderItem={renderLog}
        keyExtractor={(item) => item.id}
        scrollEnabled={logs.length > 0}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 132 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 350); }} tintColor={colors.primary} />}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <View>
                <Text style={[styles.eyebrow, { color: colors.primary }]}>SIGNAL DESK / LIVE</Text>
                <Text style={[styles.title, { color: colors.foreground }]}>Trading assistant</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: colors.muted }]}>
                <View style={[styles.statusDot, { backgroundColor: colors.green }]} />
                <Text style={[styles.statusText, { color: colors.secondaryForeground }]}>READY</Text>
              </View>
            </View>

            <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.heroTop}>
                <View>
                  <Text style={[styles.cardEyebrow, { color: colors.mutedForeground }]}>NEXT CANDLE ENGINE</Text>
                  <Text style={[styles.heroTitle, { color: colors.foreground }]}>Fast reads. Clear calls.</Text>
                </View>
                <View style={[styles.heroIcon, { backgroundColor: colors.secondary }]}>
                  <Feather name="activity" size={20} color={colors.primary} />
                </View>
              </View>
              <View style={styles.wave}>
                {[26, 34, 20, 48, 32, 62, 42, 72, 54, 86, 70, 92, 64, 78, 54, 69, 49, 61, 44, 56].map((height, index) => (
                  <View key={index} style={[styles.waveBar, { height, backgroundColor: index > 9 ? colors.primary : colors.blue, opacity: index % 3 === 0 ? 0.45 : 0.85 }]} />
                ))}
              </View>
              <Text style={[styles.heroHint, { color: colors.mutedForeground }]}>Upload a chart screenshot to run a fresh directional read.</Text>
              <Pressable testID="scan-button" onPress={handleScan} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 }]}>
                <Feather name="crosshair" size={18} color={colors.primaryForeground} />
                <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Scan chart</Text>
              </Pressable>
            </View>

            <View style={[styles.overlayCard, { backgroundColor: colors.surfaceStrong, borderColor: overlayEnabled ? colors.primary : colors.border }]}>
              <View style={styles.overlayCopy}>
                <View style={[styles.overlayGlyph, { backgroundColor: overlayEnabled ? 'rgba(115,210,181,0.14)' : colors.muted }]}>
                  <Feather name="maximize" size={18} color={overlayEnabled ? colors.primary : colors.mutedForeground} />
                </View>
                <View style={styles.overlayText}>
                  <Text style={[styles.overlayTitle, { color: colors.foreground }]}>Floating overlay</Text>
                  <Text style={[styles.overlaySubtitle, { color: colors.mutedForeground }]}>
                    {overlayEnabled ? 'Overlay preview is active' : 'Keep signals above your chart'}
                  </Text>
                </View>
              </View>
              <Pressable testID="overlay-toggle" accessibilityRole="switch" accessibilityState={{ checked: overlayEnabled }} onPress={() => { void handleOverlayToggle(); void Haptics.selectionAsync(); }} style={[styles.switch, { backgroundColor: overlayEnabled ? colors.primary : colors.input }]}>
                <View style={[styles.switchThumb, { backgroundColor: colors.foreground, transform: [{ translateX: overlayEnabled ? 18 : 0 }] }]} />
              </Pressable>
            </View>

            {overlayEnabled && (
              <View style={styles.previewBlock}>
                <View style={styles.sectionHeading}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Overlay preview</Text>
                  <Text style={[styles.previewHint, { color: colors.mutedForeground }]}>Tap to rescan</Text>
                </View>
                <Pressable testID="floating-scan" onPress={handleScan} style={({ pressed }) => [
                  styles.floatingButton,
                  { backgroundColor: signal?.signal === 'GREEN' ? colors.green : signal?.signal === 'RED' ? colors.red : overlayState === 'analyzing' || overlayState === 'warning' ? colors.amber : colors.card, borderColor: signal || overlayState === 'analyzing' || overlayState === 'warning' ? 'transparent' : colors.border, opacity: pressed ? 0.82 : 1 },
                ]}>
                  {overlayState === 'analyzing' || isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name={signal ? 'trending-up' : overlayState === 'warning' ? 'alert-triangle' : 'crosshair'} size={18} color={signal || overlayState === 'warning' ? '#FFFFFF' : colors.primary} />}
                  <Text style={[styles.floatingLabel, { color: signal || overlayState === 'analyzing' || overlayState === 'warning' ? '#FFFFFF' : colors.foreground }]}>{overlayLabel}</Text>
                  {signal && <Text style={styles.floatingAsset}>{signal.asset} · {signal.timeframe}</Text>}
                </Pressable>
                {signal && <Text style={[styles.reason, { color: colors.mutedForeground }]}>{signal.reason}</Text>}
              </View>
            )}

            {errorMessage && (
              <View style={[styles.errorBox, { backgroundColor: 'rgba(240,109,106,0.12)', borderColor: 'rgba(240,109,106,0.35)' }]}>
                <Feather name="alert-circle" size={16} color={colors.red} />
                <Text style={[styles.errorText, { color: colors.red }]}>{errorMessage}</Text>
              </View>
            )}

            <View style={styles.logsHeader}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Live signal logs</Text>
                <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>Your recent chart reads</Text>
              </View>
              <View style={[styles.countPill, { backgroundColor: colors.muted }]}>
                <Text style={[styles.countText, { color: colors.primary }]}>{logs.length.toString().padStart(2, '0')}</Text>
              </View>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="bar-chart-2" size={22} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Your completed scans will appear here.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6, marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.7 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 20 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  heroCard: { borderWidth: 1, borderRadius: 22, padding: 18, marginBottom: 12 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardEyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, marginBottom: 7 },
  heroTitle: { fontSize: 21, fontWeight: '600', letterSpacing: -0.4 },
  heroIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  wave: { height: 92, flexDirection: 'row', alignItems: 'flex-end', gap: 5, paddingVertical: 16, marginTop: 6 },
  waveBar: { flex: 1, borderRadius: 5, minHeight: 12 },
  heroHint: { fontSize: 13, lineHeight: 19, marginBottom: 17 },
  primaryButton: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 },
  primaryButtonText: { fontSize: 14, fontWeight: '700', letterSpacing: 0.1 },
  overlayCard: { borderWidth: 1, borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 },
  overlayCopy: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  overlayGlyph: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  overlayText: { flex: 1 },
  overlayTitle: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  overlaySubtitle: { fontSize: 12 },
  switch: { width: 42, height: 25, borderRadius: 14, padding: 3, justifyContent: 'center' },
  switchThumb: { width: 19, height: 19, borderRadius: 10 },
  previewBlock: { marginBottom: 26 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.25 },
  previewHint: { fontSize: 11 },
  floatingButton: { minHeight: 62, borderRadius: 18, borderWidth: 1, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', gap: 10 },
  floatingLabel: { fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  floatingAsset: { marginLeft: 'auto', color: '#FFFFFF', opacity: 0.85, fontSize: 11, fontWeight: '600' },
  reason: { fontSize: 12, lineHeight: 18, marginTop: 9, paddingHorizontal: 3 },
  errorBox: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 22 },
  errorText: { flex: 1, fontSize: 12, lineHeight: 18 },
  logsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  sectionSubtitle: { fontSize: 12, marginTop: 5 },
  countPill: { minWidth: 31, height: 28, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  countText: { fontSize: 12, fontWeight: '700' },
  logRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, gap: 10 },
  signalDot: { width: 7, height: 7, borderRadius: 4 },
  logMain: { flex: 1 },
  logTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  logAsset: { fontSize: 14, fontWeight: '700' },
  logTime: { fontSize: 11 },
  logReason: { fontSize: 11, lineHeight: 16 },
  logBadge: { borderRadius: 10, minWidth: 51, alignItems: 'center', paddingVertical: 6, paddingHorizontal: 7 },
  logSignal: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 2 },
  logConfidence: { fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 36, gap: 10 },
  emptyText: { fontSize: 13 },
});
