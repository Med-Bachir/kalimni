import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, Platform, PermissionsAndroid } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Screen, T, Avatar } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { useCall } from '../../store/call';
import { localizeDigits } from '../../utils/format';

// Real audio call over Agora. The screen is reused for both sides: the
// caller lands here immediately after inviting (waiting to connect), the
// callee lands here after accepting on IncomingCallScreen. Whoever's engine
// fires onUserJoined for the other party is the signal that audio is live —
// there's no separate "ringing" vs "connected" distinction to track here.
export default function CallScreen({ navigation }) {
  const { t, lang } = useI18n();
  const status = useCall((s) => s.status);
  const partner = useCall((s) => s.partner);
  const agora = useCall((s) => s.agora);
  const call = useCall((s) => s.call);
  const endedReason = useCall((s) => s.endedReason);
  const endCall = useCall((s) => s.end);

  const [connected, setConnected] = useState(false);
  const [remoteUid, setRemoteUid] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [cameraOff, setCameraOff] = useState(false);
  const [RtcView, setRtcView] = useState(null); // RtcSurfaceView once the native module loads
  const [engineError, setEngineError] = useState(null);
  const engineRef = useRef(null);

  const configured = !!agora?.appId;
  const isVideo = call?.media === 'video';

  // Join the Agora channel once we have credentials. Torn down on unmount and
  // whenever the call ends while this screen is still showing the outcome.
  useEffect(() => {
    if (!configured || status === 'ended') return undefined;
    let cancelled = false;

    (async () => {
      if (Platform.OS === 'android') {
        const wanted = [
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          ...(isVideo ? [PermissionsAndroid.PERMISSIONS.CAMERA] : []),
        ];
        const results = await PermissionsAndroid.requestMultiple(wanted);
        const denied = wanted.some((p) => results[p] !== PermissionsAndroid.RESULTS.GRANTED);
        if (denied) {
          if (!cancelled) setEngineError(t(isVideo ? 'call.cameraDenied' : 'call.micDenied'));
          return;
        }
      }
      if (cancelled) return;

      try {
        // Loaded lazily: this native module only exists in a custom dev
        // build, never in Expo Go — see README "Live audio calls". Guarded
        // so tapping "call" under Expo Go shows a message instead of a crash.
        const {
          createAgoraRtcEngine, ChannelProfileType, ClientRoleType, RtcSurfaceView,
        } = require('react-native-agora');

        const engine = createAgoraRtcEngine();
        engineRef.current = engine;
        engine.initialize({ appId: agora.appId, channelProfile: ChannelProfileType.ChannelProfileCommunication });
        engine.registerEventHandler({
          onUserJoined: (_conn, uid) => {
            if (!cancelled) { setConnected(true); setRemoteUid(uid); }
          },
          onUserOffline: () => { if (!cancelled) endCall('remote-ended'); },
          onError: (err) => { if (!cancelled) setEngineError(`Agora error ${err}`); },
        });
        engine.enableAudio();
        if (isVideo) {
          engine.enableVideo();
          engine.startPreview();
          setRtcView(() => RtcSurfaceView);
        }
        engine.setDefaultAudioRouteToSpeakerphone(true);
        engine.joinChannel(agora.token || '', call.channel, agora.uid, {
          channelProfile: ChannelProfileType.ChannelProfileCommunication,
          clientRoleType: ClientRoleType.ClientRoleBroadcaster,
          publishMicrophoneTrack: true,
          publishCameraTrack: isVideo,
          autoSubscribeAudio: true,
          autoSubscribeVideo: isVideo,
        });
      } catch {
        if (!cancelled) setEngineError(t('call.needsDevBuild'));
      }
    })();

    return () => {
      cancelled = true;
      if (engineRef.current) {
        engineRef.current.leaveChannel();
        engineRef.current.release();
        engineRef.current = null;
      }
    };
  }, [configured, status === 'ended']);

  // Call duration, counted from the moment the remote side actually joins.
  useEffect(() => {
    if (!connected) return undefined;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [connected]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    engineRef.current?.muteLocalAudioStream(next);
  };

  const toggleSpeaker = () => {
    const next = !speaker;
    setSpeaker(next);
    engineRef.current?.setEnableSpeakerphone(next);
  };

  const toggleCamera = () => {
    const next = !cameraOff;
    setCameraOff(next);
    engineRef.current?.muteLocalVideoStream(next);
  };

  const flipCamera = () => engineRef.current?.switchCamera();

  // Video actually rendering (dev build, engine up, camera granted).
  const videoLive = isVideo && !!RtcView && !engineError && status !== 'ended';

  const hangUp = () => endCall(status === 'active' ? 'you-ended' : 'you-ended');

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  const statusLine = () => {
    if (status === 'ended') return t(`call.reason.${endedReason || 'you-ended'}`);
    if (engineError) return engineError;
    if (!configured) return t('call.notConfigured');
    if (connected) return localizeDigits(`${mm}:${ss}`, lang);
    return t('call.calling');
  };

  const ControlButton = ({ icon, label, active, onPress, disabled }) => (
    <View style={{ alignItems: 'center', gap: 7 }}>
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        style={{
          width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center',
          backgroundColor: active ? '#fff' : 'rgba(255,255,255,.14)', opacity: disabled ? 0.4 : 1,
        }}
      >
        <Ionicons name={icon} size={23} color={active ? colors.primaryDark : '#fff'} />
      </TouchableOpacity>
      <T size={12} color="rgba(255,255,255,.75)">{label}</T>
    </View>
  );

  return (
    <Screen bg="transparent" edges={['top', 'bottom']} style={{ backgroundColor: colors.ink }}>
      <LinearGradient
        colors={[colors.ink, colors.primaryDark, colors.primary]}
        style={{ flex: 1, padding: 24, paddingBottom: 36 }}
      >
        {/* Video layers: remote fullscreen once connected, self-view before
            that; local PiP floats top-end while both streams are live. */}
        {videoLive && (
          <>
            {connected && remoteUid != null ? (
              <RtcView
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                canvas={{ uid: remoteUid }}
              />
            ) : !cameraOff ? (
              <RtcView
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                canvas={{ uid: 0 }}
              />
            ) : null}
            {connected && remoteUid != null && !cameraOff && (
              <RtcView
                style={{
                  position: 'absolute', top: 70, end: 20, width: 108, height: 158,
                  borderRadius: 14, overflow: 'hidden',
                }}
                zOrderMediaOverlay
                canvas={{ uid: 0 }}
              />
            )}
          </>
        )}

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: 'rgba(255,255,255,.14)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7,
          }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: connected ? colors.online : 'rgba(255,255,255,.5)' }} />
            <T w="600" size={13} color="#fff">{t('call.secure')}</T>
          </View>
        </View>

        {/* Partner — the big avatar hides once real video is on screen */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: videoLive ? 'flex-end' : 'center', gap: 22 }}>
          {!videoLive && <Avatar name={partner?.name} size={126} />}
          <View style={{ alignItems: 'center', gap: 7 }}>
            {!videoLive && (
              <>
                <T w="700" size={26} color="#fff">{partner?.name}</T>
                <T size={14.5} color="rgba(255,255,255,.7)">{t('chat.specialistTitle')}</T>
              </>
            )}
            <View style={{ backgroundColor: 'rgba(20,49,63,.45)', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 6, marginTop: 6 }}>
              <T w="600" size={17} color="#fff">{videoLive ? `${partner?.name} · ${statusLine()}` : statusLine()}</T>
            </View>
          </View>
          {!configured && status !== 'ended' && (
            <View style={{ backgroundColor: 'rgba(255,255,255,.1)', borderRadius: 12, padding: 12, marginHorizontal: 12 }}>
              <T size={12} color="rgba(255,255,255,.75)" style={{ textAlign: 'center', lineHeight: 19 }}>
                {t('call.notConfiguredBody')}
              </T>
            </View>
          )}
        </View>

        {/* Controls */}
        <View style={{ gap: 24 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: isVideo ? 14 : 18 }}>
            <ControlButton
              icon={muted ? 'mic-off' : 'mic'} label={t('call.mute')} active={muted}
              onPress={toggleMute} disabled={!connected}
            />
            <ControlButton
              icon="volume-high" label={t('call.speaker')} active={speaker}
              onPress={toggleSpeaker} disabled={!connected}
            />
            {isVideo && (
              <>
                <ControlButton
                  icon={cameraOff ? 'videocam-off' : 'videocam'} label={t('call.camera')} active={cameraOff}
                  onPress={toggleCamera} disabled={!videoLive}
                />
                <ControlButton
                  icon="camera-reverse-outline" label={t('call.flip')}
                  onPress={flipCamera} disabled={!videoLive || cameraOff}
                />
              </>
            )}
          </View>
          <View style={{ alignItems: 'center' }}>
            <TouchableOpacity
              onPress={hangUp}
              style={{
                width: 72, height: 72, borderRadius: 36, backgroundColor: colors.danger,
                alignItems: 'center', justifyContent: 'center',
                shadowColor: colors.danger, shadowOpacity: 0.35, shadowRadius: 13,
                shadowOffset: { width: 0, height: 10 }, elevation: 8,
              }}
            >
              <Ionicons name="call" size={30} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>
    </Screen>
  );
}
