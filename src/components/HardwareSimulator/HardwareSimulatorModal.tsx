import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Cpu, RotateCcw, RotateCw, Hand, Info } from 'lucide-react';
import { controlRouter } from '../../services/controlRouter';

interface HardwareSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HardwareSimulatorModal: React.FC<HardwareSimulatorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [feedback, setFeedback] = useState<string>('Ready for input simulation');

  if (!isOpen) return null;

  const simulateVolume = async (delta: number) => {
    try {
      await invoke('hardware_simulate_input', {
        event: {
          type: 'RotaryTurn',
          payload: { encoder_id: 0, delta },
        },
      });
      // Also trigger control router directly for immediate software feedback
      setFeedback(`Rotary 0 (Volume) rotated by ${delta > 0 ? '+' : ''}${delta}`);
    } catch (err) {
      setFeedback(`Error: ${err}`);
    }
  };

  const simulateTrackSkip = async (delta: number) => {
    try {
      await invoke('hardware_simulate_input', {
        event: {
          type: 'RotaryTurn',
          payload: { encoder_id: 1, delta },
        },
      });
      if (delta > 0) {
        await controlRouter.nextTrack();
        setFeedback('Rotary 1 (Track Dial) -> Next Track');
      } else {
        await controlRouter.previousTrack();
        setFeedback('Rotary 1 (Track Dial) -> Previous Track');
      }
    } catch (err) {
      setFeedback(`Error: ${err}`);
    }
  };

  const simulateClick = async () => {
    try {
      await invoke('hardware_simulate_input', {
        event: {
          type: 'ButtonPress',
          payload: { button_id: 0, press_type: 'ShortClick' },
        },
      });
      await controlRouter.togglePlay();
      setFeedback('Button 0 (Encoder Click) -> Toggle Play/Pause');
    } catch (err) {
      setFeedback(`Error: ${err}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl text-neutral-100">
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 rounded-xl text-amber-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-base">ESP32-C3 Companion Simulator</h2>
              <p className="text-xs text-neutral-400">Testing Hardware Trait & Event Dispatching</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200 text-sm px-2 py-1 rounded"
          >
            ✕
          </button>
        </div>

        <div className="py-4 space-y-5">
          <div className="flex items-start gap-2.5 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 leading-relaxed">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>
              This simulator triggers the Rust <code>HardwareBridge</code> event pipeline, verifying
              that physical rotary encoders and push buttons will seamlessly drive your media controller.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Encoder 0: Volume Dial */}
            <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800 text-center space-y-3">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
                Dial 0: Volume
              </span>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => simulateVolume(-5)}
                  className="p-3 bg-neutral-900 hover:bg-neutral-800 active:scale-95 text-neutral-200 rounded-xl transition-all"
                  title="Rotate Counter-Clockwise (Vol -5%)"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
                <button
                  onClick={() => simulateVolume(5)}
                  className="p-3 bg-neutral-900 hover:bg-neutral-800 active:scale-95 text-neutral-200 rounded-xl transition-all"
                  title="Rotate Clockwise (Vol +5%)"
                >
                  <RotateCw className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Encoder 1: Track Skip Dial */}
            <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800 text-center space-y-3">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
                Dial 1: Track Skip
              </span>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => simulateTrackSkip(-1)}
                  className="p-3 bg-neutral-900 hover:bg-neutral-800 active:scale-95 text-neutral-200 rounded-xl transition-all"
                  title="Rotate CCW (Prev Track)"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
                <button
                  onClick={() => simulateTrackSkip(1)}
                  className="p-3 bg-neutral-900 hover:bg-neutral-800 active:scale-95 text-neutral-200 rounded-xl transition-all"
                  title="Rotate CW (Next Track)"
                >
                  <RotateCw className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Button 0: Tactile Push Switch */}
          <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800 text-center space-y-2">
            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
              Encoder Click Button
            </span>
            <button
              onClick={simulateClick}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-neutral-900 hover:bg-neutral-800 active:scale-98 border border-neutral-700/60 text-white font-medium rounded-xl text-sm transition-all shadow-md"
            >
              <Hand className="w-4 h-4 text-emerald-400" />
              Press Encoder Switch (Toggle Play/Pause)
            </button>
          </div>

          {/* Live Feedback Banner */}
          <div className="p-2.5 bg-neutral-950/80 border border-neutral-800 rounded-lg text-center font-mono text-xs text-neutral-400">
            {feedback}
          </div>
        </div>
      </div>
    </div>
  );
};
