import { create } from 'zustand';
import { hardwareWs } from '../services/hardwareWs';
import { tauriIpc } from '../services/tauriIpc';

interface NotificationStore {
  mirrorToHardware: boolean;
  toggleMirrorToHardware: () => void;
  sendPushNotification: (title: string, body: string, priority?: string) => Promise<boolean>;
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  mirrorToHardware: true,

  toggleMirrorToHardware: () => {
    set((state) => ({ mirrorToHardware: !state.mirrorToHardware }));
  },

  sendPushNotification: async (title: string, body: string, priority = 'urgent') => {
    const { mirrorToHardware } = get();

    // 1. Dispatch over WebSocket to ESP32 TFT Screen if enabled
    if (mirrorToHardware) {
      hardwareWs.sendConfig({
        type: 'notification_alert',
        title: title.trim(),
        body: body.trim(),
        priority,
      });
    }

    // 2. Dispatch native Windows Desktop Toast Notification
    try {
      await tauriIpc.windowsSendNotification(title.trim(), body.trim());
    } catch (err) {
      console.warn('[Notifications] Windows toast warning:', err);
    }

    return true;
  },
}));
