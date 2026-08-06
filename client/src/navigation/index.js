import React, { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

import { colors } from '../theme/colors';
import { useAuth } from '../store/auth';
import { useI18n } from '../i18n';
import { useRealtime } from '../hooks/useRealtime';
import { useCallSignaling } from '../hooks/useCallSignaling';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { api } from '../api/client';

// Auth + intake
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import PendingApprovalScreen from '../screens/auth/PendingApprovalScreen';
import DisclaimerScreen from '../screens/intake/DisclaimerScreen';
import QuestionnaireScreen from '../screens/intake/QuestionnaireScreen';
import ResultScreen from '../screens/intake/ResultScreen';
// Patient
import HomeScreen from '../screens/patient/HomeScreen';
import LibraryScreen from '../screens/patient/LibraryScreen';
import ArticleScreen from '../screens/patient/ArticleScreen';
import BreathingScreen from '../screens/patient/BreathingScreen';
import CalmScreen from '../screens/patient/CalmScreen';
import GroundingScreen from '../screens/patient/GroundingScreen';
import BubblesScreen from '../screens/patient/BubblesScreen';
import ReframeScreen from '../screens/patient/ReframeScreen';
import SpiritQuizScreen from '../screens/patient/SpiritQuizScreen';
import SpiritHomeScreen from '../screens/patient/SpiritHomeScreen';
import BadgesScreen from '../screens/patient/BadgesScreen';
import PatientChatTab from '../screens/patient/PatientChatTab';
import AICompanionScreen from '../screens/patient/AICompanionScreen';
import ProfileScreen from '../screens/patient/ProfileScreen';
import PersonalDataScreen from '../screens/patient/PersonalDataScreen';
import HistoryScreen from '../screens/patient/HistoryScreen';
import PrivacyScreen from '../screens/patient/PrivacyScreen';
import SafetyPlanScreen from '../screens/patient/SafetyPlanScreen';
import CompanionMemoryScreen from '../screens/patient/CompanionMemoryScreen';
import JournalLockScreen from '../screens/patient/JournalLockScreen';
import SessionPrepScreen, { SessionTakeawayScreen } from '../screens/patient/SessionPrepScreen';
import { useSafetyPlan } from '../store/safetyPlan';
import { useJournalLock } from '../store/journalLock';
import CrisisScreen from '../screens/shared/CrisisScreen';
import CallScreen from '../screens/shared/CallScreen';
import IncomingCallScreen from '../screens/shared/IncomingCallScreen';
import ChatScreen from '../screens/shared/ChatScreen';
// Specialist
import PatientsScreen from '../screens/specialist/PatientsScreen';
import ConversationsScreen from '../screens/specialist/ConversationsScreen';
import PatientDetailScreen from '../screens/specialist/PatientDetailScreen';
import SpecialistProfileScreen from '../screens/specialist/SpecialistProfileScreen';
// Admin
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import AdminUsersScreen from '../screens/admin/AdminUsersScreen';
import AdminRequestsScreen from '../screens/admin/AdminRequestsScreen';
import AdminContentScreen from '../screens/admin/AdminContentScreen';
import AdminApprovalsScreen from '../screens/admin/AdminApprovalsScreen';
import AdminUnassignedScreen from '../screens/admin/AdminUnassignedScreen';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const stackOptions = { headerShown: false, animation: 'slide_from_right' };

const tabsOptions = (t) => ({
  headerShown: false,
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.faint,
  tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, height: 62, paddingTop: 6, paddingBottom: 8 },
  tabBarLabelStyle: { fontFamily: 'IBMPlexSansArabic_500Medium', fontSize: 11.5 },
});

const icon = (name) => ({ color, size, focused }) =>
  <Ionicons name={focused ? name : `${name}-outline`} size={size} color={color} />;

function useUnreadTotal(enabled) {
  const { data } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api('/conversations'),
    enabled,
    refetchInterval: 30_000,
  });
  const total = (data?.conversations || []).reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  return total > 0 ? total : undefined;
}

function PatientTabs() {
  const { t } = useI18n();
  const unread = useUnreadTotal(true);
  return (
    <Tabs.Navigator screenOptions={tabsOptions(t)}>
      <Tabs.Screen name="Home" component={HomeScreen}
        options={{ title: t('tabs.home'), tabBarIcon: icon('home') }} />
      <Tabs.Screen name="Companion" component={AICompanionScreen}
        options={{ title: t('companion.tab'), tabBarIcon: icon('sparkles') }} />
      <Tabs.Screen name="Library" component={LibraryScreen}
        options={{ title: t('tabs.library'), tabBarIcon: icon('book') }} />
      <Tabs.Screen name="ChatTab" component={PatientChatTab}
        options={{ title: t('tabs.chat'), tabBarIcon: icon('chatbubble-ellipses'), tabBarBadge: unread, tabBarBadgeStyle: { backgroundColor: colors.danger } }} />
      <Tabs.Screen name="Profile" component={ProfileScreen}
        options={{ title: t('tabs.profile'), tabBarIcon: icon('person') }} />
    </Tabs.Navigator>
  );
}

function SpecialistTabs() {
  const { t } = useI18n();
  const unread = useUnreadTotal(true);
  return (
    <Tabs.Navigator screenOptions={tabsOptions(t)}>
      <Tabs.Screen name="Patients" component={PatientsScreen}
        options={{ title: t('tabs.patients'), tabBarIcon: icon('people') }} />
      <Tabs.Screen name="Chats" component={ConversationsScreen}
        options={{ title: t('tabs.chats'), tabBarIcon: icon('chatbubble-ellipses'), tabBarBadge: unread, tabBarBadgeStyle: { backgroundColor: colors.danger } }} />
      <Tabs.Screen name="SpecialistProfile" component={SpecialistProfileScreen}
        options={{ title: t('tabs.profile'), tabBarIcon: icon('person') }} />
    </Tabs.Navigator>
  );
}

function AdminTabs() {
  const { t } = useI18n();
  const { data } = useQuery({ queryKey: ['adminStats'], queryFn: () => api('/admin/stats'), refetchInterval: 30_000 });
  const active = data?.activeRequests || undefined;
  return (
    <Tabs.Navigator screenOptions={tabsOptions(t)}>
      <Tabs.Screen name="Dashboard" component={AdminDashboardScreen}
        options={{ title: t('tabs.dashboard'), tabBarIcon: icon('grid') }} />
      <Tabs.Screen name="Users" component={AdminUsersScreen}
        options={{ title: t('tabs.users'), tabBarIcon: icon('people') }} />
      <Tabs.Screen name="AdminContent" component={AdminContentScreen}
        options={{ title: t('tabs.content'), tabBarIcon: icon('book') }} />
      <Tabs.Screen name="Requests" component={AdminRequestsScreen}
        options={{ title: t('tabs.requests'), tabBarIcon: icon('list'), tabBarBadge: active, tabBarBadgeStyle: { backgroundColor: colors.danger } }} />
    </Tabs.Navigator>
  );
}

export default function RootNavigator() {
  const user = useAuth((s) => s.user);
  useRealtime();
  useCallSignaling();
  usePushNotifications();
  // Device-local safety plan (Phase 2.1): loaded once, non-blocking — the
  // crisis screen must never wait on anything.
  useEffect(() => { useSafetyPlan.getState().hydrate(); }, []);

  // Journal encryption (Phase 2.5), per role and non-blocking:
  //   patient    — find out whether the journal is locked and whether THIS
  //                device holds the key, before anything tries to write a note.
  //   specialist — make sure a sharing keypair exists and its public half is
  //                published, so a patient who wants to share one entry has
  //                somewhere to seal it to. Doing this at login rather than on
  //                demand means the key is already there when it is needed.
  useEffect(() => {
    if (!user) return;
    if (user.role === 'patient') {
      useJournalLock.getState().hydrate();
    } else if (user.role === 'specialist') {
      // Imported lazily and inside the catch: the crypto module pulls in
      // native modules, and nothing on the boot path may be able to stop the
      // app from opening (Rule 6 — the crisis path is one tap away, and an
      // app that will not start has no crisis path).
      import('../crypto/journalCrypto')
        .then(({ ensureSharingKeypair }) => ensureSharingKeypair())
        .then(({ publicKey }) => api('/journal/keys', { method: 'PUT', body: { publicKey } }))
        .catch((err) => console.warn('[journal] could not publish sharing key:', err?.code || err));
    }
  }, [user?.id, user?.role]);

  if (!user) {
    return (
      <Stack.Navigator screenOptions={stackOptions}>
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
        <Stack.Screen name="Crisis" component={CrisisScreen} options={{ presentation: 'modal' }} />
      </Stack.Navigator>
    );
  }

  if (user.role === 'specialist' && user.status !== 'approved') {
    return (
      <Stack.Navigator screenOptions={stackOptions}>
        <Stack.Screen name="Pending" component={PendingApprovalScreen} />
      </Stack.Navigator>
    );
  }

  if (user.role === 'specialist') {
    return (
      <Stack.Navigator screenOptions={stackOptions}>
        <Stack.Screen name="SpecialistTabs" component={SpecialistTabs} />
        <Stack.Screen name="PatientDetail" component={PatientDetailScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="Call" component={CallScreen} options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="IncomingCall" component={IncomingCallScreen} options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="Crisis" component={CrisisScreen} options={{ presentation: 'modal' }} />
      </Stack.Navigator>
    );
  }

  if (user.role === 'admin') {
    return (
      <Stack.Navigator screenOptions={stackOptions}>
        <Stack.Screen name="AdminTabs" component={AdminTabs} />
        <Stack.Screen name="AdminApprovals" component={AdminApprovalsScreen} />
        <Stack.Screen name="AdminUnassigned" component={AdminUnassignedScreen} />
        <Stack.Screen name="Crisis" component={CrisisScreen} options={{ presentation: 'modal' }} />
      </Stack.Navigator>
    );
  }

  // Patient. The stack is static; only the entry point depends on whether the
  // intake questionnaire is still pending (avoids route reconciliation issues
  // when intake completes mid-flow — screens reset to PatientTabs explicitly).
  const needsIntake = !user.intakeCompletedAt && !user.intakeSkipped;
  return (
    <Stack.Navigator
      screenOptions={stackOptions}
      initialRouteName={needsIntake ? 'Disclaimer' : 'PatientTabs'}
    >
      <Stack.Screen name="PatientTabs" component={PatientTabs} />
      <Stack.Screen name="Disclaimer" component={DisclaimerScreen} />
      <Stack.Screen name="Questionnaire" component={QuestionnaireScreen} />
      <Stack.Screen name="Result" component={ResultScreen} />
      <Stack.Screen name="Article" component={ArticleScreen} />
      <Stack.Screen name="Breathing" component={BreathingScreen} options={{ presentation: 'fullScreenModal' }} />
      {/* Calm Corner. The hub is a normal push so back returns to Home; the
          three exercises are full-screen so nothing else competes for
          attention while someone is using them. */}
      <Stack.Screen name="Calm" component={CalmScreen} />
      <Stack.Screen name="Grounding" component={GroundingScreen} options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="Bubbles" component={BubblesScreen} options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="Reframe" component={ReframeScreen} options={{ presentation: 'fullScreenModal' }} />
      {/* Meeting the spirit animal. Full-screen for the same reason the
          exercises are: the reveal is the one moment in the app that gets to
          own the whole screen. */}
      <Stack.Screen name="SpiritQuiz" component={SpiritQuizScreen} options={{ presentation: 'fullScreenModal' }} />
      {/* Where the animal lives. Reachable by long-pressing it anywhere, from
          the garden, and from the profile. */}
      <Stack.Screen name="SpiritHome" component={SpiritHomeScreen} />
      {/* The full badge collection. Reached from the home level card, the
          calm corner shelf and the profile. */}
      <Stack.Screen name="Badges" component={BadgesScreen} />
      <Stack.Screen name="Call" component={CallScreen} options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
      <Stack.Screen name="IncomingCall" component={IncomingCallScreen} options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
      <Stack.Screen name="PersonalData" component={PersonalDataScreen} />
      <Stack.Screen name="History" component={HistoryScreen} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} />
      {/* The safety plan is written calm and read in crisis — reachable from
          the crisis screen, the profile, and a low check-in. */}
      <Stack.Screen name="SafetyPlan" component={SafetyPlanScreen} />
      {/* What the companion remembers — reachable from the companion header
          and from the profile's privacy block. A summary written about you
          that you cannot reach is not something we ship. */}
      <Stack.Screen name="CompanionMemory" component={CompanionMemoryScreen} />
      {/* Locking the journal, and the recovery choice that has to be made
          with open eyes before the lock engages. */}
      <Stack.Screen name="JournalLock" component={JournalLockScreen} />
      {/* Session Witness: the brief the patient writes and sends before a
          session, and the one line they write after it. */}
      <Stack.Screen name="SessionPrep" component={SessionPrepScreen} />
      <Stack.Screen name="SessionTakeaway" component={SessionTakeawayScreen} />
      <Stack.Screen name="Crisis" component={CrisisScreen} options={{ presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
