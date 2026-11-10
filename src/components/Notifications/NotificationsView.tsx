import React, { useState } from 'react';
import {
  Bell,
  Send,
  Radio,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Zap,
} from 'lucide-react';
import { useNotificationStore } from '../../stores/useNotificationStore';
import { hardwareWs } from '../../services/hardwareWs';

export const NotificationsView: React.FC = () => {
  const { mirrorToHardware, toggleMirrorToHardware, sendPushNotification } = useNotificationStore();

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const isConnected = hardwareWs.getIsConnected();

  const handleSendPush = async () => {
    if (!message.trim()) return;
    setIsSending(true);

    const alertTitle = title.trim() || 'Desk Alert';
    await sendPushNotification(alertTitle, message.trim());

    setFeedback(`✓ Pushed "${alertTitle}" to ESP32 Display & Windows Action Center`);
    setMessage('');
    setIsSending(false);
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleQuickPreset = async (presetTitle: string, presetBody: string) => {
    setIsSending(true);
    await sendPushNotification(presetTitle, presetBody);
    setFeedback(`✓ Pushed "${presetTitle}" to ESP32 Display`);
    setIsSending(false);
    setTimeout(() => setFeedback(null), 3500);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-950">
      {/* Top Header */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-neutral-900 bg-neutral-950/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-base tracking-tight text-neutral-100">
              Push Notifications to Hardware
            </h2>
            <p className="text-xs text-neutral-400">
              Directly forward real-time popup alerts to your ESP32 TFT screen
            </p>
          </div>
        </div>

        {/* Global Mirror Toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleMirrorToHardware}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
              mirrorToHardware
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-md shadow-amber-500/10'
                : 'bg-neutral-900 border-neutral-800 text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Mirror to Display: {mirrorToHardware ? 'ENABLED' : 'MUTED'}</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-8 py-2.5 text-xs text-amber-300 font-mono text-center flex items-center justify-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Main Content Layout */}
      <div className="flex-1 overflow-y-auto p-8 max-w-3xl mx-auto w-full space-y-6">
        {/* Hardware Status Banner */}
        <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl ${
                isConnected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
              }`}
            >
              {isConnected ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            </div>
            <div>
              <h4 className="text-xs font-bold text-neutral-200">
                {isConnected ? 'ESP32 Display Connected & Ready' : 'ESP32 Display Not Connected'}
              </h4>
              <p className="text-[11px] text-neutral-400">
                {isConnected
                  ? 'Incoming alerts will pop up as a 4-second banner over lyrics on the TFT display.'
                  : 'Connect to your ESP32 in the Hardware Deck tab to receive visual popups.'}
              </p>
            </div>
          </div>

          <span
            className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border ${
              isConnected
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}
          >
            {isConnected ? 'ONLINE' : 'STANDBY'}
          </span>
        </div>

        {/* Direct Push Sender Card */}
        <div className="p-6 rounded-3xl bg-neutral-900/60 border border-neutral-800 space-y-5 shadow-xl">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-100">Send Instant Push Alert</h3>
              <p className="text-xs text-neutral-400">
                Type a custom message to forward directly to your screen
              </p>
            </div>
          </div>

          <div className="space-y-3.5 pt-1">
            <div>
              <label className="text-xs font-semibold text-neutral-300">Alert Title (Optional)</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Desk Reminder, Doorbell, Discord..."
                className="w-full mt-1.5 px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-300">Notification Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="Type notification text to show on TFT screen..."
                className="w-full mt-1.5 px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500 transition-colors resize-none"
              />
            </div>

            <button
              onClick={handleSendPush}
              disabled={isSending || !message.trim()}
              className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:pointer-events-none text-black font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/20 active:scale-[0.99]"
            >
              <Send className="w-4 h-4" />
              <span>{isSending ? 'Forwarding to Display...' : 'Push Alert to Display'}</span>
            </button>
          </div>
        </div>

        {/* 1-Click Quick Push Presets */}
        <div className="p-6 rounded-3xl bg-neutral-900/60 border border-neutral-800 space-y-3 shadow-xl">
          <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider font-mono">
            1-Click Quick Push Presets
          </h4>
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              onClick={() => handleQuickPreset('Break Time', 'Time to stretch and hydrate!')}
              className="p-3 text-left rounded-2xl bg-neutral-950 hover:bg-neutral-850 border border-neutral-800 hover:border-neutral-700 transition-colors"
            >
              <div className="text-xs font-bold text-neutral-200">☕ Take a Break</div>
              <div className="text-[11px] text-neutral-500 truncate">Time to stretch and hydrate!</div>
            </button>

            <button
              onClick={() => handleQuickPreset('Doorbell', 'Delivery arrived at the front door.')}
              className="p-3 text-left rounded-2xl bg-neutral-950 hover:bg-neutral-850 border border-neutral-800 hover:border-neutral-700 transition-colors"
            >
              <div className="text-xs font-bold text-neutral-200">📦 Front Door</div>
              <div className="text-[11px] text-neutral-500 truncate">Delivery arrived at front door.</div>
            </button>

            <button
              onClick={() => handleQuickPreset('Meeting', 'Calendar meeting starting in 5 minutes.')}
              className="p-3 text-left rounded-2xl bg-neutral-950 hover:bg-neutral-850 border border-neutral-800 hover:border-neutral-700 transition-colors"
            >
              <div className="text-xs font-bold text-neutral-200">📅 Calendar Meeting</div>
              <div className="text-[11px] text-neutral-500 truncate">Meeting starting in 5 minutes.</div>
            </button>

            <button
              onClick={() => handleQuickPreset('Call Incoming', 'Incoming Discord / Phone call.')}
              className="p-3 text-left rounded-2xl bg-neutral-950 hover:bg-neutral-850 border border-neutral-800 hover:border-neutral-700 transition-colors"
            >
              <div className="text-xs font-bold text-neutral-200">📞 Incoming Call</div>
              <div className="text-[11px] text-neutral-500 truncate">Incoming Discord / Phone call.</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
