import React, { useState, useEffect } from 'react';
import {
  Clock,
  Timer,
  Cpu,
  Play,
  Pause,
  RotateCcw,
  Activity,
  Coffee,
} from 'lucide-react';

export const DeskDashboardView: React.FC = () => {
  // Live clock
  const [currentTime, setCurrentTime] = useState(new Date());

  // Pomodoro timer
  const [pomodoroSeconds, setPomodoroSeconds] = useState(25 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerMode, setTimerMode] = useState<'work' | 'break'>('work');

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isTimerRunning && pomodoroSeconds > 0) {
      interval = setInterval(() => {
        setPomodoroSeconds((prev) => prev - 1);
      }, 1000);
    } else if (pomodoroSeconds === 0) {
      setIsTimerRunning(false);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, pomodoroSeconds]);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleSetTimer = (minutes: number, mode: 'work' | 'break') => {
    setIsTimerRunning(false);
    setTimerMode(mode);
    setPomodoroSeconds(minutes * 60);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-950">
      {/* Top Header */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-neutral-900 bg-neutral-950/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-base tracking-tight text-neutral-100">
              Desktop Productivity & Focus Deck
            </h2>
            <p className="text-xs text-neutral-400">
              On-screen desktop clock, pomodoro focus session, and system monitor
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* WIDGET 1: LARGE DESK CLOCK */}
          <div className="p-6 rounded-3xl bg-neutral-900/60 border border-neutral-800 flex flex-col justify-between shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-400">
                <Clock className="w-4 h-4 text-emerald-400" />
                <span>Desktop Clock</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-mono">
                LIVE
              </span>
            </div>

            <div className="my-8 text-center">
              <div className="text-5xl font-mono font-extrabold tracking-tight text-neutral-100">
                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
              <p className="text-sm text-neutral-400 mt-2 font-medium">
                {currentTime.toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>

            <div className="text-center text-xs text-neutral-500 font-mono">
              Synchronized with PC System Clock
            </div>
          </div>

          {/* WIDGET 2: FOCUS / POMODORO TIMER */}
          <div className="p-6 rounded-3xl bg-neutral-900/60 border border-neutral-800 flex flex-col justify-between shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-400">
                <Timer className="w-4 h-4 text-amber-400" />
                <span>{timerMode === 'work' ? 'Focus Session' : 'Rest Break'}</span>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                  isTimerRunning
                    ? 'bg-amber-500/20 text-amber-300 animate-pulse'
                    : 'bg-neutral-800 text-neutral-400'
                }`}
              >
                {isTimerRunning ? 'COUNTING' : 'IDLE'}
              </span>
            </div>

            <div className="my-4 text-center">
              <div className="text-5xl font-mono font-extrabold tracking-tight text-amber-400">
                {formatTimer(pomodoroSeconds)}
              </div>
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  onClick={() => setIsTimerRunning(!isTimerRunning)}
                  className={`p-3 rounded-2xl flex items-center justify-center transition-all ${
                    isTimerRunning
                      ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                      : 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                  }`}
                  title={isTimerRunning ? 'Pause Timer' : 'Start Timer'}
                >
                  {isTimerRunning ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current translate-x-0.5" />}
                </button>
                <button
                  onClick={() => handleSetTimer(25, 'work')}
                  className="p-3 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                  title="Reset 25m Focus"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
                <button
                  onClick={() => handleSetTimer(5, 'break')}
                  className="p-3 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                  title="5m Short Break"
                >
                  <Coffee className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 pt-1 text-xs text-neutral-400">
              <button
                onClick={() => handleSetTimer(25, 'work')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  timerMode === 'work' && pomodoroSeconds === 25 * 60
                    ? 'bg-neutral-800 text-amber-400'
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                25m Work
              </button>
              <button
                onClick={() => handleSetTimer(5, 'break')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  timerMode === 'break' && pomodoroSeconds === 5 * 60
                    ? 'bg-neutral-800 text-amber-400'
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                5m Break
              </button>
              <button
                onClick={() => handleSetTimer(50, 'work')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  pomodoroSeconds === 50 * 60
                    ? 'bg-neutral-800 text-amber-400'
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                50m Deep
              </button>
            </div>
          </div>

          {/* WIDGET 3: PC HARDWARE TELEMETRY */}
          <div className="p-6 rounded-3xl bg-neutral-900/60 border border-neutral-800 flex flex-col justify-between shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-400">
                <Cpu className="w-4 h-4 text-cyan-400" />
                <span>PC Telemetry</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 font-mono">
                DESKTOP
              </span>
            </div>

            <div className="space-y-4 my-4">
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1.5">
                  <span className="text-neutral-400">Audio Endpoint</span>
                  <span className="text-cyan-400 font-mono">WASAPI Active</span>
                </div>
                <div className="h-1.5 w-full bg-neutral-950 rounded-full overflow-hidden border border-neutral-800">
                  <div className="h-full bg-cyan-400 rounded-full w-full" />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1.5">
                  <span className="text-neutral-400">Hardware Bridge</span>
                  <span className="text-emerald-400 font-mono">ESP32-C3 SuperMini</span>
                </div>
                <div className="h-1.5 w-full bg-neutral-950 rounded-full overflow-hidden border border-neutral-800">
                  <div className="h-full bg-emerald-400 rounded-full w-full" />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1.5">
                  <span className="text-neutral-400">Display Spec</span>
                  <span className="text-amber-400 font-mono">2.8" SPI ILI9341 (40MHz)</span>
                </div>
                <div className="h-1.5 w-full bg-neutral-950 rounded-full overflow-hidden border border-neutral-800">
                  <div className="h-full bg-amber-400 rounded-full w-full" />
                </div>
              </div>
            </div>

            <div className="text-center text-xs text-neutral-500 font-mono">
              Desktop Productivity Companion
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
