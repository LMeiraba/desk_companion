import React, { useEffect, useState } from 'react';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { controlRouter } from '../../services/controlRouter';
import { Laptop, Smartphone, Speaker, Tv, RefreshCw, Check, Cast, Info, HelpCircle } from 'lucide-react';
import { DeviceDto } from '../../types/models';

interface DevicePickerProps {
  isOpen: boolean;
  onClose: () => void;
}

function getDeviceIcon(type: string) {
  switch (type.toLowerCase()) {
    case 'smartphone':
      return <Smartphone className="w-5 h-5" />;
    case 'speaker':
      return <Speaker className="w-5 h-5" />;
    case 'cast_video':
    case 'tv':
      return <Tv className="w-5 h-5" />;
    default:
      return <Laptop className="w-5 h-5" />;
  }
}

export const DevicePicker: React.FC<DevicePickerProps> = ({ isOpen, onClose }) => {
  const { devices, activeDeviceId, localDeviceId, isLoadingDevices, fetchDevices } =
    usePlayerStore();
  const [transferringId, setTransferringId] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  // Auto-refresh devices while modal is open (every 3.5 seconds)
  useEffect(() => {
    if (!isOpen) return;
    fetchDevices();
    const interval = setInterval(() => {
      fetchDevices();
    }, 3500);
    return () => clearInterval(interval);
  }, [isOpen, fetchDevices]);

  if (!isOpen) return null;

  const handleSelectDevice = async (device: DeviceDto) => {
    try {
      setTransferringId(device.id);
      await controlRouter.transferPlayback(device.id, true);
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err) {
      console.error('Failed to transfer playback:', err);
    } finally {
      setTransferringId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl text-neutral-100 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400">
              <Cast className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base tracking-tight">Spotify Connect</h2>
              <p className="text-xs text-neutral-400">Select active audio output device</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchDevices()}
              disabled={isLoadingDevices}
              title="Refresh Devices"
              className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingDevices ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-200 text-sm px-2.5 py-1.5 rounded-xl hover:bg-neutral-800 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Device List */}
        <div className="py-4 space-y-2.5 overflow-y-auto flex-1 pr-1">
          {devices.length === 0 ? (
            <div className="py-10 text-center text-neutral-500 text-sm space-y-3">
              <Speaker className="w-10 h-10 mx-auto opacity-40 text-emerald-500" />
              <div className="space-y-1">
                <p className="font-medium text-neutral-300">No active Spotify Connect devices found</p>
                <p className="text-xs text-neutral-500 max-w-xs mx-auto">
                  Launch the official Spotify app on your desktop, phone, or smart speaker to connect.
                </p>
              </div>
            </div>
          ) : (
            devices.map((device) => {
              const isActive = device.id === activeDeviceId || device.isActive;
              const isLocal = device.id === localDeviceId;
              const isTransferring = transferringId === device.id;

              return (
                <button
                  key={device.id}
                  onClick={() => handleSelectDevice(device)}
                  disabled={isTransferring}
                  className={`w-full flex items-center justify-between p-3.5 rounded-2xl border text-left transition-all group ${
                    isActive
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-lg shadow-emerald-950/40 ring-1 ring-emerald-500/30'
                      : 'bg-neutral-950/70 border-neutral-800/80 text-neutral-200 hover:bg-neutral-800/60 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`p-2.5 rounded-xl transition-colors ${
                        isActive
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-neutral-900 text-neutral-400 group-hover:text-neutral-200'
                      }`}
                    >
                      {getDeviceIcon(device.deviceType)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm tracking-tight">{device.name}</span>
                        {isLocal && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/25">
                            This App
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-neutral-500 font-mono">
                        {device.deviceType} • Volume {device.volumePercent}%
                      </span>
                    </div>
                  </div>

                  {isActive ? (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                      <span>Active</span>
                    </div>
                  ) : (
                    <span className="text-xs text-neutral-400 group-hover:text-emerald-400 font-medium px-2 py-1 rounded-lg">
                      {isTransferring ? 'Connecting...' : 'Switch'}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Why aren't all devices showing up? Info Accordion */}
        <div className="pt-3 border-t border-neutral-800/80 text-xs">
          <button
            onClick={() => setShowExplanation(!showExplanation)}
            className="flex items-center justify-between w-full text-neutral-400 hover:text-neutral-200 py-1 transition-colors"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <HelpCircle className="w-3.5 h-3.5 text-neutral-500" />
              Why don't all my logged-in devices show up?
            </span>
            <span className="text-neutral-500 font-mono">{showExplanation ? '▲' : '▼'}</span>
          </button>

          {showExplanation && (
            <div className="mt-2.5 p-3 rounded-2xl bg-neutral-950/80 border border-neutral-800/90 text-neutral-400 space-y-2 leading-relaxed animate-in fade-in">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <p>
                  <strong className="text-neutral-200">Spotify Connect Socket Architecture:</strong>{' '}
                  Mobile phones (iOS & Android) put background apps to sleep and terminate open network sockets to save battery.
                </p>
              </div>
              <p className="pl-6 text-[11px] text-neutral-500">
                To make your phone or tablet visible here, simply open the Spotify app on that device for a moment. Once Spotify is running, its socket will connect to Spotify's cloud and immediately appear in this list!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
