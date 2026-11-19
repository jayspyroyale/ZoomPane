using System.Collections.Specialized;
using ZoomPane.Capture.Native;

namespace ZoomPane.Capture.Desktop;

/// <summary>Small Windows shell helpers used around a recording.</summary>
internal static class DesktopTools
{
    private const uint SWP_NOZORDER = 0x0004, SWP_NOACTIVATE = 0x0010;
    private const int SW_RESTORE = 9;

    /// <summary>Hides or shows the desktop icon list (the SysListView32 inside the shell's DefView).</summary>
    public static bool SetDesktopIconsHidden(bool hidden)
    {
        var list = FindDesktopListView();
        if (list == IntPtr.Zero) return false;
        Win32.ShowWindow(list, hidden ? Win32.SW_HIDE : Win32.SW_SHOW);
        return true;
    }

    private static IntPtr FindDesktopListView()
    {
        var defView = Win32.FindWindowEx(Win32.FindWindow("Progman", null), IntPtr.Zero, "SHELLDLL_DefView", null);
        // With a slideshow wallpaper, the DefView is re-parented under one of the WorkerW windows.
        var worker = IntPtr.Zero;
        while (defView == IntPtr.Zero)
        {
            worker = Win32.FindWindowEx(IntPtr.Zero, worker, "WorkerW", null);
            if (worker == IntPtr.Zero) return IntPtr.Zero;
            defView = Win32.FindWindowEx(worker, IntPtr.Zero, "SHELLDLL_DefView", null);
        }
        return Win32.FindWindowEx(defView, IntPtr.Zero, "SysListView32", null);
    }

    public static void FocusWindow(IntPtr hwnd)
    {
        if (Win32.IsIconic(hwnd)) Win32.ShowWindow(hwnd, SW_RESTORE);
        Win32.SetForegroundWindow(hwnd);
    }

    /// <summary>Resizes a window so its visible frame is exactly <paramref name="width"/>×<paramref name="height"/> physical pixels.</summary>
    public static void ResizeWindow(IntPtr hwnd, int width, int height)
    {
        if (Win32.IsIconic(hwnd)) Win32.ShowWindow(hwnd, SW_RESTORE);
        // GetWindowRect includes invisible resize borders; compensate using the DWM frame bounds.
        Win32.GetWindowRectRaw(hwnd, out var outer);
        var visible = Win32.GetWindowBounds(hwnd);
        var extraW = outer.Width - visible.Width;
        var extraH = outer.Height - visible.Height;
        Win32.SetWindowPos(hwnd, IntPtr.Zero, outer.Left, outer.Top, width + extraW, height + extraH, SWP_NOZORDER | SWP_NOACTIVATE);
    }

    /// <summary>Places files on the clipboard as a file-drop list, so they paste into chat apps and Explorer.</summary>
    public static void CopyFilesToClipboard(IEnumerable<string> paths)
    {
        var files = new StringCollection();
        files.AddRange(paths.ToArray());
        Exception? error = null;
        var thread = new Thread(() =>
        {
            try { System.Windows.Forms.Clipboard.SetFileDropList(files); }
            catch (Exception e) { error = e; }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();
        if (error is not null) throw error;
    }
}
