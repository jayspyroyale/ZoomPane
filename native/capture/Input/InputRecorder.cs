using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading.Channels;
using ZoomPane.Capture.Native;

namespace ZoomPane.Capture.Input;

/// <summary>
/// Records mouse, keyboard, cursor-shape and (for window sources) window-geometry events to a
/// JSON-lines file. Every event carries <c>t</c>: QPC time in milliseconds (see <see cref="Clock"/>).
/// Coordinates are physical screen pixels.
/// </summary>
internal sealed class InputRecorder : IDisposable
{
    private const double MinMoveIntervalMs = 4; // cap high-polling-rate mice at ~250 Hz

    private readonly Channel<object> _events = Channel.CreateUnbounded<object>(new() { SingleReader = true });
    private readonly CursorShapes _cursors;
    private readonly bool _recordKeys;
    private readonly IntPtr _trackedWindow;
    private readonly Task _writer;
    private readonly Thread _hookThread;
    private readonly Thread _pollThread;
    private readonly CancellationTokenSource _stop = new();

    // Delegates must stay referenced while hooks are installed.
    private Win32.HookProc? _mouseProc;
    private Win32.HookProc? _keyboardProc;
    private uint _hookThreadId;
    private readonly object _moveGate = new();
    private double _lastMoveMs;
    private int _lastX = int.MinValue, _lastY = int.MinValue;

    public InputRecorder(string path, string cursorDir, bool recordKeys, IntPtr trackedWindow)
    {
        _cursors = new CursorShapes(cursorDir);
        _recordKeys = recordKeys;
        _trackedWindow = trackedWindow;
        _writer = Task.Run(() => WriteLoop(path));
        _hookThread = new Thread(HookLoop) { IsBackground = true, Name = "input-hooks" };
        _pollThread = new Thread(PollLoop) { IsBackground = true, Name = "cursor-poll" };
        _hookThread.Start();
        _pollThread.Start();
    }

    public IReadOnlyList<CustomCursor> CustomCursors => _cursors.Custom;

    private static double Now => Clock.TicksToMs(Clock.Now);

    private void Emit(object e) => _events.Writer.TryWrite(e);

    private async Task WriteLoop(string path)
    {
        await using var stream = new StreamWriter(path);
        await foreach (var e in _events.Reader.ReadAllAsync())
            await stream.WriteLineAsync(JsonSerializer.Serialize(e, e.GetType(), Json.Options));
    }

    private void HookLoop()
    {
        _hookThreadId = Win32.GetCurrentThreadId();
        _mouseProc = OnMouse;
        var module = Win32.GetModuleHandle(null);
        var mouseHook = Win32.SetWindowsHookEx(Win32.WH_MOUSE_LL, _mouseProc, module, 0);
        var keyboardHook = IntPtr.Zero;
        if (_recordKeys)
        {
            _keyboardProc = OnKeyboard;
            keyboardHook = Win32.SetWindowsHookEx(Win32.WH_KEYBOARD_LL, _keyboardProc, module, 0);
        }

        while (Win32.GetMessage(out _, IntPtr.Zero, 0, 0) > 0) { }

        Win32.UnhookWindowsHookEx(mouseHook);
        if (keyboardHook != IntPtr.Zero) Win32.UnhookWindowsHookEx(keyboardHook);
    }

    private IntPtr OnMouse(int code, IntPtr wParam, IntPtr lParam)
    {
        if (code >= 0)
        {
            var t = Now;
            var data = Marshal.PtrToStructure<MSLLHOOKSTRUCT>(lParam);
            var (x, y) = (data.pt.X, data.pt.Y);
            switch ((uint)wParam)
            {
                case Win32.WM_MOUSEMOVE:
                    EmitMove(t, x, y);
                    break;
                case Win32.WM_LBUTTONDOWN: Emit(new ButtonEvent(t, "down", "left", x, y)); break;
                case Win32.WM_LBUTTONUP: Emit(new ButtonEvent(t, "up", "left", x, y)); break;
                case Win32.WM_RBUTTONDOWN: Emit(new ButtonEvent(t, "down", "right", x, y)); break;
                case Win32.WM_RBUTTONUP: Emit(new ButtonEvent(t, "up", "right", x, y)); break;
                case Win32.WM_MBUTTONDOWN: Emit(new ButtonEvent(t, "down", "middle", x, y)); break;
                case Win32.WM_MBUTTONUP: Emit(new ButtonEvent(t, "up", "middle", x, y)); break;
                case Win32.WM_MOUSEWHEEL: Emit(new WheelEvent(t, 0, (short)(data.mouseData >> 16), x, y)); break;
                case Win32.WM_MOUSEHWHEEL: Emit(new WheelEvent(t, (short)(data.mouseData >> 16), 0, x, y)); break;
            }
        }
        return Win32.CallNextHookEx(IntPtr.Zero, code, wParam, lParam);
    }

    private void EmitMove(double t, int x, int y)
    {
        lock (_moveGate)
        {
            if ((x == _lastX && y == _lastY) || t - _lastMoveMs < MinMoveIntervalMs) return;
            _lastMoveMs = t;
            _lastX = x;
            _lastY = y;
        }
        Emit(new MoveEvent(t, x, y));
    }

    private IntPtr OnKeyboard(int code, IntPtr wParam, IntPtr lParam)
    {
        if (code >= 0)
        {
            var data = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam);
            var msg = (uint)wParam;
            var down = msg is Win32.WM_KEYDOWN or Win32.WM_SYSKEYDOWN;
            if (down || msg is Win32.WM_KEYUP or Win32.WM_SYSKEYUP)
                Emit(new KeyEvent(Now, down ? "keydown" : "keyup", (int)data.vkCode));
        }
        return Win32.CallNextHookEx(IntPtr.Zero, code, wParam, lParam);
    }

    /// <summary>Samples cursor position, shape/visibility and tracked-window bounds (~120 Hz).</summary>
    private void PollLoop()
    {
        string? lastCursor = null;
        RECT lastRect = default;
        var token = _stop.Token;
        while (!token.IsCancellationRequested)
        {
            var info = new CURSORINFO { cbSize = Marshal.SizeOf<CURSORINFO>() };
            if (Win32.GetCursorInfo(ref info))
            {
                // Hooks miss SetCursorPos, remote sessions and some tablets; polling fills those gaps.
                EmitMove(Now, info.ptScreenPos.X, info.ptScreenPos.Y);
                var visible = (info.flags & Win32.CURSOR_SHOWING) != 0;
                var id = visible ? _cursors.Identify(info.hCursor) : "hidden";
                if (id != lastCursor)
                {
                    lastCursor = id;
                    Emit(new CursorEvent(Now, id));
                }
            }

            if (_trackedWindow != IntPtr.Zero && Win32.IsWindow(_trackedWindow))
            {
                var r = Win32.GetWindowBounds(_trackedWindow);
                if (!r.Equals(lastRect))
                {
                    lastRect = r;
                    Emit(new WindowEvent(Now, r.Left, r.Top, r.Width, r.Height));
                }
            }
            token.WaitHandle.WaitOne(8);
        }
    }

    public void Dispose()
    {
        if (_stop.IsCancellationRequested) return;
        _stop.Cancel();
        if (_hookThreadId != 0) Win32.PostThreadMessage(_hookThreadId, Win32.WM_QUIT, IntPtr.Zero, IntPtr.Zero);
        _hookThread.Join(1000);
        _pollThread.Join(1000);
        _events.Writer.TryComplete();
        _writer.GetAwaiter().GetResult();
    }

    private sealed record MoveEvent(double T, int X, int Y) { public string Type => "move"; }
    private sealed record ButtonEvent(double T, string Type, string Button, int X, int Y);
    private sealed record WheelEvent(double T, int Dx, int Dy, int X, int Y) { public string Type => "wheel"; }
    private sealed record KeyEvent(double T, string Type, int Vk);
    private sealed record CursorEvent(double T, string Id) { public string Type => "cursor"; }
    private sealed record WindowEvent(double T, int X, int Y, int W, int H) { public string Type => "window"; }
}
