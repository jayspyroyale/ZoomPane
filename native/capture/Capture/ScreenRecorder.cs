using Vortice.Direct3D11;
using Vortice.DXGI;
using Windows.Graphics;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX;
using Windows.Graphics.DirectX.Direct3D11;
using Windows.Media.Core;
using Windows.Media.MediaProperties;
using Windows.Media.Transcoding;
using Windows.Storage;
using Windows.Storage.Streams;

namespace ZoomPane.Capture.Capture;

/// <summary>
/// Records a <see cref="GraphicsCaptureItem"/> to an H.264 MP4 using Windows.Graphics.Capture
/// (cursor and capture border disabled) and the hardware Media Foundation encoder.
/// Frames are pulled by a <see cref="MediaStreamSource"/>, so the file is variable frame rate:
/// a static screen produces no frames, and the final frame is repeated at stop time.
/// </summary>
internal sealed class ScreenRecorder : IAsyncDisposable
{
    private readonly GraphicsCaptureItem _item;
    private readonly string _outputPath;
    private readonly int _fps;
    private readonly ID3D11Device _device;
    private readonly ID3D11DeviceContext _context;
    private readonly IDirect3DDevice _winRtDevice;
    private readonly Direct3D11CaptureFramePool _framePool;
    private readonly GraphicsCaptureSession _session;
    private readonly ID3D11Texture2D _blank;
    private readonly AutoResetEvent _frameArrived = new(false);
    private readonly ManualResetEvent _stopRequested = new(false);
    private readonly object _gate = new();

    private Direct3D11CaptureFrame? _pendingFrame;
    private IDirect3DSurface? _lastSurface;
    private long _firstFrameTicks = -1;
    private long _lastSampleTicks = -1;
    private long _stopTicks;
    private bool _finalFrameSent;
    private Task? _transcodeTask;
    private IRandomAccessStream? _stream;

    public int Width { get; }
    public int Height { get; }

    /// <summary>QPC time (100 ns) of the first encoded frame; video t=0 maps to this.</summary>
    public long FirstFrameTicks => Interlocked.Read(ref _firstFrameTicks);

    public ScreenRecorder(GraphicsCaptureItem item, string outputPath, int fps)
    {
        _item = item;
        _outputPath = outputPath;
        _fps = Math.Clamp(fps, 15, 120);

        // H.264 requires even dimensions.
        Width = item.Size.Width & ~1;
        Height = item.Size.Height & ~1;

        _device = Direct3D.CreateDevice();
        _context = _device.ImmediateContext;
        _winRtDevice = Direct3D.CreateWinRtDevice(_device);
        _blank = CreateBlackTexture();

        _framePool = Direct3D11CaptureFramePool.CreateFreeThreaded(
            _winRtDevice, DirectXPixelFormat.B8G8R8A8UIntNormalized, 2, item.Size);
        _framePool.FrameArrived += OnFrameArrived;

        _session = _framePool.CreateCaptureSession(item);
        _session.IsCursorCaptureEnabled = false;
        TrySetBorderless(_session);
    }

    private static void TrySetBorderless(GraphicsCaptureSession session)
    {
        try { session.IsBorderRequired = false; }
        catch { /* Windows 10: the yellow border cannot be disabled. */ }
    }

    private unsafe ID3D11Texture2D CreateBlackTexture()
    {
        var pixels = new byte[Width * Height * 4];
        for (var i = 3; i < pixels.Length; i += 4) pixels[i] = 255;
        fixed (byte* data = pixels)
            return _device.CreateTexture2D(TextureDescription(), new SubresourceData(data, (uint)Width * 4));
    }

    private Texture2DDescription TextureDescription() => new()
    {
        Width = (uint)Width,
        Height = (uint)Height,
        MipLevels = 1,
        ArraySize = 1,
        Format = Format.B8G8R8A8_UNorm,
        SampleDescription = new SampleDescription(1, 0),
        Usage = ResourceUsage.Default,
        BindFlags = BindFlags.ShaderResource | BindFlags.RenderTarget,
    };

    public async Task StartAsync()
    {
        var folder = await StorageFolder.GetFolderFromPathAsync(Path.GetDirectoryName(_outputPath)!);
        var file = await folder.CreateFileAsync(Path.GetFileName(_outputPath), CreationCollisionOption.ReplaceExisting);
        _stream = await file.OpenAsync(FileAccessMode.ReadWrite);

        var props = VideoEncodingProperties.CreateUncompressed(MediaEncodingSubtypes.Bgra8, (uint)Width, (uint)Height);
        var source = new MediaStreamSource(new VideoStreamDescriptor(props)) { BufferTime = TimeSpan.Zero };
        source.Starting += (_, args) => args.Request.SetActualStartPosition(TimeSpan.Zero);
        source.SampleRequested += OnSampleRequested;

        var profile = MediaEncodingProfile.CreateMp4(VideoEncodingQuality.HD1080p);
        profile.Audio = null;
        profile.Video.Width = (uint)Width;
        profile.Video.Height = (uint)Height;
        profile.Video.FrameRate.Numerator = (uint)_fps;
        profile.Video.FrameRate.Denominator = 1;
        // Screen content compresses well; keep a generous bitrate because this is an editing master.
        profile.Video.Bitrate = (uint)Math.Clamp((long)Width * Height * _fps / 8, 8_000_000L, 80_000_000L);

        var transcoder = new MediaTranscoder { HardwareAccelerationEnabled = true };
        _session.StartCapture();
        var prepared = await transcoder.PrepareMediaStreamSourceTranscodeAsync(source, _stream, profile);
        if (!prepared.CanTranscode)
            throw new InvalidOperationException($"Encoder unavailable: {prepared.FailureReason}");
        _transcodeTask = prepared.TranscodeAsync().AsTask();
    }

    private void OnFrameArrived(Direct3D11CaptureFramePool sender, object args)
    {
        var frame = sender.TryGetNextFrame();
        if (frame is null) return;
        lock (_gate)
        {
            _pendingFrame?.Dispose();
            _pendingFrame = frame;
        }
        _frameArrived.Set();
    }

    private void OnSampleRequested(MediaStreamSource sender, MediaStreamSourceSampleRequestedEventArgs args)
    {
        var minInterval = 10_000_000L / _fps - 10_000; // allow 1 ms jitter
        var handles = new WaitHandle[] { _stopRequested, _frameArrived };
        while (true)
        {
            if (WaitHandle.WaitAny(handles) == 0)
            {
                args.Request.Sample = FinalSample();
                return;
            }

            Direct3D11CaptureFrame? frame;
            lock (_gate) { frame = _pendingFrame; _pendingFrame = null; }
            if (frame is null) continue;

            using (frame)
            {
                var ticks = frame.SystemRelativeTime.Ticks;
                if (_firstFrameTicks < 0) Interlocked.Exchange(ref _firstFrameTicks, ticks);
                var relative = ticks - _firstFrameTicks;
                if (_lastSampleTicks >= 0 && relative - _lastSampleTicks < minInterval) continue; // frame-rate cap

                _lastSurface = CopyFrame(frame);
                _lastSampleTicks = relative;
                args.Request.Sample = MediaStreamSample.CreateFromDirect3D11Surface(_lastSurface, TimeSpan.FromTicks(relative));
                return;
            }
        }
    }

    /// <summary>Repeats the last frame at stop time so the video spans the whole session, then ends the stream.</summary>
    private MediaStreamSample? FinalSample()
    {
        if (_finalFrameSent || _lastSurface is null || _firstFrameTicks < 0) return null;
        _finalFrameSent = true;
        var relative = _stopTicks - _firstFrameTicks;
        if (relative <= _lastSampleTicks) return null;
        return MediaStreamSample.CreateFromDirect3D11Surface(_lastSurface, TimeSpan.FromTicks(relative));
    }

    /// <summary>Copies a pooled frame into an encoder-owned texture of fixed size (windows can resize mid-recording).</summary>
    private IDirect3DSurface CopyFrame(Direct3D11CaptureFrame frame)
    {
        var texture = _device.CreateTexture2D(TextureDescription());
        _context.CopyResource(texture, _blank);
        using var source = Direct3D.GetTexture(frame.Surface);
        var w = (uint)Math.Min(frame.ContentSize.Width, Width);
        var h = (uint)Math.Min(frame.ContentSize.Height, Height);
        _context.CopySubresourceRegion(texture, 0, 0, 0, 0, source, 0, new Vortice.Mathematics.Box(0, 0, 0, (int)w, (int)h, 1));
        var surface = Direct3D.CreateWinRtSurface(texture);
        texture.Dispose();
        return surface;
    }

    public async Task StopAsync()
    {
        _stopTicks = Clock.Now;
        _stopRequested.Set();
        if (_transcodeTask is not null) await _transcodeTask;
    }

    public async ValueTask DisposeAsync()
    {
        if (!_stopRequested.WaitOne(0)) await StopAsync();
        _session.Dispose();
        _framePool.Dispose();
        lock (_gate) { _pendingFrame?.Dispose(); _pendingFrame = null; }
        _stream?.Dispose();
        _blank.Dispose();
        _context.Dispose();
        _device.Dispose();
    }
}
