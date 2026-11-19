using System.Runtime.InteropServices;
using Vortice.Direct3D;
using Vortice.Direct3D11;
using Vortice.DXGI;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX.Direct3D11;
using WinRT;

namespace ZoomPane.Capture.Capture;

[ComImport, Guid("A9B3D012-3DF2-4EE3-B8D1-8695F457D3C1"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IDirect3DDxgiInterfaceAccess
{
    IntPtr GetInterface([In] ref Guid iid);
}

[ComImport, Guid("3628E81B-3CAC-4C60-B7F4-23CE0E0C3356"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IGraphicsCaptureItemInterop
{
    IntPtr CreateForWindow([In] IntPtr window, [In] ref Guid iid);
    IntPtr CreateForMonitor([In] IntPtr monitor, [In] ref Guid iid);
}

/// <summary>Bridges Vortice D3D11 objects and their WinRT counterparts used by Windows.Graphics.Capture.</summary>
internal static class Direct3D
{
    private static Guid _graphicsCaptureItemIid = new("79C3F95B-31F7-4EC2-A464-632EF5D30760");
    private static Guid _texture2DIid = typeof(ID3D11Texture2D).GUID;

    [DllImport("d3d11.dll", ExactSpelling = true)]
    private static extern int CreateDirect3D11DeviceFromDXGIDevice(IntPtr dxgiDevice, out IntPtr graphicsDevice);

    [DllImport("d3d11.dll", ExactSpelling = true)]
    private static extern int CreateDirect3D11SurfaceFromDXGISurface(IntPtr dxgiSurface, out IntPtr graphicsSurface);

    public static ID3D11Device CreateDevice()
    {
        var levels = new[] { FeatureLevel.Level_11_1, FeatureLevel.Level_11_0, FeatureLevel.Level_10_1 };
        var result = D3D11.D3D11CreateDevice(null, DriverType.Hardware, DeviceCreationFlags.BgraSupport, levels, out ID3D11Device? device);
        if (result.Failure || device is null)
        {
            // Fall back to WARP so capture still works on machines without a usable GPU driver.
            D3D11.D3D11CreateDevice(null, DriverType.Warp, DeviceCreationFlags.BgraSupport, levels, out device).CheckError();
        }
        return device!;
    }

    public static IDirect3DDevice CreateWinRtDevice(ID3D11Device device)
    {
        using var dxgiDevice = device.QueryInterface<IDXGIDevice>();
        Marshal.ThrowExceptionForHR(CreateDirect3D11DeviceFromDXGIDevice(dxgiDevice.NativePointer, out var ptr));
        try { return MarshalInterface<IDirect3DDevice>.FromAbi(ptr); }
        finally { Marshal.Release(ptr); }
    }

    public static IDirect3DSurface CreateWinRtSurface(ID3D11Texture2D texture)
    {
        using var dxgiSurface = texture.QueryInterface<IDXGISurface>();
        Marshal.ThrowExceptionForHR(CreateDirect3D11SurfaceFromDXGISurface(dxgiSurface.NativePointer, out var ptr));
        try { return MarshalInterface<IDirect3DSurface>.FromAbi(ptr); }
        finally { Marshal.Release(ptr); }
    }

    public static ID3D11Texture2D GetTexture(IDirect3DSurface surface)
    {
        var access = surface.As<IDirect3DDxgiInterfaceAccess>();
        var ptr = access.GetInterface(ref _texture2DIid);
        return new ID3D11Texture2D(ptr);
    }

    public static GraphicsCaptureItem CreateItemForMonitor(IntPtr hmonitor)
    {
        var interop = GraphicsCaptureItem.As<IGraphicsCaptureItemInterop>();
        var ptr = interop.CreateForMonitor(hmonitor, ref _graphicsCaptureItemIid);
        try { return GraphicsCaptureItem.FromAbi(ptr); }
        finally { Marshal.Release(ptr); }
    }

    public static GraphicsCaptureItem CreateItemForWindow(IntPtr hwnd)
    {
        var interop = GraphicsCaptureItem.As<IGraphicsCaptureItemInterop>();
        var ptr = interop.CreateForWindow(hwnd, ref _graphicsCaptureItemIid);
        try { return GraphicsCaptureItem.FromAbi(ptr); }
        finally { Marshal.Release(ptr); }
    }
}
