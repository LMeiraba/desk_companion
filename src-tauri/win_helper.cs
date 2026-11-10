using System;
using System.Runtime.InteropServices;
using System.Management;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr pNotify);
    int UnregisterControlChangeNotify(IntPtr pNotify);
    int GetChannelCount(out uint pnChannelCount);
    int SetMasterVolumeLevel(float fLevelDB, ref Guid pguidEventContext);
    int SetMasterVolumeLevelScalar(float fLevel, ref Guid pguidEventContext);
    int GetMasterVolumeLevel(out float pfLevelDB);
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int SetChannelVolumeLevel(uint nChannel, float fLevelDB, ref Guid pguidEventContext);
    int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, ref Guid pguidEventContext);
    int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
    int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref Guid pguidEventContext);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool pbMute);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
    [PreserveSig]
    int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
    [PreserveSig]
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppEndpoint);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorComObject { }

class Program {
    static IAudioEndpointVolume GetEndpoint() {
        var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
        IMMDevice dev;
        enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
        Guid iid = typeof(IAudioEndpointVolume).GUID;
        object o;
        dev.Activate(ref iid, 1, IntPtr.Zero, out o);
        return (IAudioEndpointVolume)o;
    }

    static void SetBrightness(int val) {
        try {
            using (var mclass = new ManagementClass("root/wmi", "WmiMonitorBrightnessMethods", null)) {
                foreach (ManagementObject instance in mclass.GetInstances()) {
                    instance.InvokeMethod("WmiSetBrightness", new object[] { 1, val });
                }
            }
        } catch { }
    }

    static int GetBrightness() {
        try {
            using (var mclass = new ManagementClass("root/wmi", "WmiMonitorBrightness", null)) {
                foreach (ManagementObject instance in mclass.GetInstances()) {
                    return Convert.ToInt32(instance["CurrentBrightness"]);
                }
            }
        } catch { }
        return 100;
    }

    static void Main(string[] args) {
        if (args.Length == 0) return;
        Guid ctx = Guid.Empty;
        var cmd = args[0];
        if (cmd == "get-vol") {
            var ep = GetEndpoint();
            float level;
            ep.GetMasterVolumeLevelScalar(out level);
            Console.WriteLine((int)Math.Round(level * 100));
        } else if (cmd == "set-vol" && args.Length > 1) {
            var ep = GetEndpoint();
            float val = float.Parse(args[1]) / 100f;
            ep.SetMasterVolumeLevelScalar(Math.Max(0f, Math.Min(1f, val)), ref ctx);
        } else if (cmd == "get-mute") {
            var ep = GetEndpoint();
            bool muted;
            ep.GetMute(out muted);
            Console.WriteLine(muted);
        } else if (cmd == "toggle-mute") {
            var ep = GetEndpoint();
            bool muted;
            ep.GetMute(out muted);
            ep.SetMute(!muted, ref ctx);
            Console.WriteLine(!muted);
        } else if (cmd == "set-mute" && args.Length > 1) {
            var ep = GetEndpoint();
            bool m = bool.Parse(args[1]);
            ep.SetMute(m, ref ctx);
        } else if (cmd == "get-brightness") {
            Console.WriteLine(GetBrightness());
        } else if (cmd == "set-brightness" && args.Length > 1) {
            int b = Math.Max(0, Math.Min(100, int.Parse(args[1])));
            SetBrightness(b);
        }
    }
}
