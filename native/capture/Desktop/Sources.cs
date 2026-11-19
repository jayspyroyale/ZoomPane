using System.Diagnostics;
using System.Runtime.InteropServices;
using ZoomPane.Capture.Native;

namespace ZoomPane.Capture.Desktop;

internal sealed record Bounds(int X, int Y, int W, int H)
{
    public static Bounds From(RECT r) => new(r.Left, r.Top, r.Width, r.Height);
}

internal sealed record DisplayInfo(string Id, string Name, Bounds Bounds, double Scale, bool Primary);

internal sealed record WindowInfo(string Id, string Title, string Process, Bounds Bounds, bool Minimized);

/// <summary>Enumerates capturable displays and top-level windows. Ids are HMONITOR / HWND values as decimal strings.</summary>
internal static class Sources
{
    [DllImport("shcore.dll")]
    private static extern int GetDpiForMonitor(IntPtr hmonitor, int dpiType, out uint dpiX, out uint dpiY);

    public static IReadOnlyList<DisplayInfo> Displays()
    {
        var list = new List<DisplayInfo>();
        Win32.EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr h, IntPtr _, ref RECT _, IntPtr _) =>
        {
            var info = new MONITORINFOEX { cbSize = Marshal.SizeOf<MONITORINFOEX>() };
            if (!Win32.GetMonitorInfo(h, ref info)) return true;
            var scale = GetDpiForMonitor(h, 0, out var dpi, out _) == 0 ? dpi / 96.0 : 1.0;
            list.Add(new DisplayInfo(h.ToInt64().ToString(), info.szDevice.TrimStart('\\', '.'),
                Bounds.From(info.rcMonitor), scale, (info.dwFlags & Win32.MONITORINFOF_PRIMARY) != 0));
            return true;
        }, IntPtr.Zero);
        return list.OrderByDescending(d => d.Primary).ThenBy(d => d.Bounds.X).ToList();
    }

    public static IReadOnlyList<WindowInfo> Windows()
    {
        var shell = Win32.GetShellWindow();
        var self = Environment.ProcessId;
        var list = new List<WindowInfo>();
        Win32.EnumWindows((hwnd, _) =>
        {
            if (hwnd == shell || !Win32.IsWindowVisible(hwnd) || Win32.IsCloaked(hwnd)) return true;
            if ((Win32.GetWindowLongPtr(hwnd, Win32.GWL_EXSTYLE).ToInt64() & Win32.WS_EX_TOOLWINDOW) != 0) return true;
            var title = Win32.GetTitle(hwnd);
            if (string.IsNullOrWhiteSpace(title)) return true;
            Win32.GetWindowThreadProcessId(hwnd, out var pid);
            if (pid == self) return true;
            var bounds = Win32.GetWindowBounds(hwnd);
            if (bounds.Width < 50 || bounds.Height < 50) return true;
            list.Add(new WindowInfo(hwnd.ToInt64().ToString(), title, ProcessName(pid), Bounds.From(bounds), Win32.IsIconic(hwnd)));
            return true;
        }, IntPtr.Zero);
        return list;
    }

    private static string ProcessName(uint pid)
    {
        try { return Process.GetProcessById((int)pid).ProcessName; }
        catch { return string.Empty; }
    }

    public static DisplayInfo DisplayById(string id) =>
        Displays().FirstOrDefault(d => d.Id == id) ?? throw new ArgumentException($"Display {id} not found");
}
