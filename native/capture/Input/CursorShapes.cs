using System.Drawing;
using System.Drawing.Imaging;
using ZoomPane.Capture.Native;

namespace ZoomPane.Capture.Input;

internal sealed record CustomCursor(string Id, string File, int HotX, int HotY, int Width, int Height);

/// <summary>
/// Maps cursor handles to names. Standard system cursors get stable names (arrow, ibeam, hand…)
/// so the editor can draw crisp vector versions at any size. Any other cursor is saved once as a PNG
/// and referenced as <c>custom-N</c>.
/// </summary>
internal sealed class CursorShapes(string directory)
{
    private static readonly (int Id, string Name)[] SystemCursors =
    [
        (32512, "arrow"), (32513, "ibeam"), (32514, "wait"), (32515, "cross"), (32516, "uparrow"),
        (32642, "size-nwse"), (32643, "size-nesw"), (32644, "size-we"), (32645, "size-ns"),
        (32646, "size-all"), (32648, "no"), (32649, "hand"), (32650, "progress"), (32651, "help"),
        (32671, "pin"), (32672, "person"),
    ];

    private readonly Dictionary<IntPtr, string> _known = LoadSystemHandles();
    private readonly List<CustomCursor> _custom = [];

    public IReadOnlyList<CustomCursor> Custom => _custom;

    private static Dictionary<IntPtr, string> LoadSystemHandles()
    {
        var map = new Dictionary<IntPtr, string>();
        foreach (var (id, name) in SystemCursors)
        {
            var handle = Win32.LoadCursor(IntPtr.Zero, id);
            if (handle != IntPtr.Zero) map.TryAdd(handle, name);
        }
        return map;
    }

    public string Identify(IntPtr handle)
    {
        if (_known.TryGetValue(handle, out var name)) return name;
        name = Save(handle) ?? "arrow";
        _known[handle] = name;
        return name;
    }

    private string? Save(IntPtr handle)
    {
        var copy = Win32.CopyIcon(handle);
        if (copy == IntPtr.Zero) return null;
        try
        {
            if (!Win32.GetIconInfo(copy, out var info)) return null;
            if (info.hbmMask != IntPtr.Zero) Win32.DeleteObject(info.hbmMask);
            if (info.hbmColor != IntPtr.Zero) Win32.DeleteObject(info.hbmColor);

            using var icon = Icon.FromHandle(copy);
            using var bitmap = icon.ToBitmap();
            Directory.CreateDirectory(directory);
            var id = $"custom-{_custom.Count + 1}";
            var file = $"{id}.png";
            bitmap.Save(Path.Combine(directory, file), ImageFormat.Png);
            _custom.Add(new CustomCursor(id, $"cursors/{file}", info.xHotspot, info.yHotspot, bitmap.Width, bitmap.Height));
            return id;
        }
        catch
        {
            return null;
        }
        finally
        {
            Win32.DestroyIcon(copy);
        }
    }
}
