using System.Text.Json;
using ZoomPane.Capture.Audio;
using ZoomPane.Capture.Capture;
using ZoomPane.Capture.Desktop;
using ZoomPane.Capture.Input;

namespace ZoomPane.Capture.Recording;

internal sealed record SourceSpec(string Kind, string? DisplayId, string? WindowId, Bounds? Crop);

internal sealed record MicrophoneSpec(bool Enabled, string? DeviceId);

internal sealed record StartOptions(
    string OutDir,
    SourceSpec Source,
    int Fps,
    MicrophoneSpec? Microphone,
    bool SystemAudio,
    bool RecordKeys);

internal sealed record PauseRange(double StartMs, double EndMs);

internal sealed record VideoTrackInfo(string File, int Width, int Height, int Fps, double StartMs);

internal sealed record SourceInfo(string Kind, Bounds Bounds, double Scale, Bounds? Crop, string? Title);

/// <summary>Contents of recording.json. All <c>*Ms</c> times share the QPC millisecond clock.</summary>
internal sealed record RecordingManifest(
    int Version,
    string CreatedAt,
    SourceInfo Source,
    VideoTrackInfo Video,
    AudioTrackInfo? Microphone,
    AudioTrackInfo? SystemAudio,
    string InputFile,
    IReadOnlyList<CustomCursor> CustomCursors,
    IReadOnlyList<PauseRange> Pauses,
    double StoppedMs);

/// <summary>One recording: screen video, optional audio tracks and input log, written into one folder.</summary>
internal sealed class RecordingSession : IAsyncDisposable
{
    public const string ManifestFile = "recording.json";

    private readonly StartOptions _options;
    private readonly SourceInfo _source;
    private readonly ScreenRecorder _screen;
    private readonly AudioRecorder? _mic;
    private readonly AudioRecorder? _system;
    private readonly InputRecorder _input;
    private readonly List<PauseRange> _pauses = [];
    private readonly string _createdAt = DateTime.UtcNow.ToString("O");
    private double? _pausedAt;

    private RecordingSession(StartOptions options, SourceInfo source, ScreenRecorder screen,
        AudioRecorder? mic, AudioRecorder? system, InputRecorder input)
    {
        _options = options;
        _source = source;
        _screen = screen;
        _mic = mic;
        _system = system;
        _input = input;
    }

    public static async Task<RecordingSession> StartAsync(StartOptions options)
    {
        Directory.CreateDirectory(options.OutDir);
        var (item, source, hwnd) = ResolveSource(options.Source);

        var screen = new ScreenRecorder(item, Path.Combine(options.OutDir, "screen.mp4"), options.Fps);
        var mic = options.Microphone is { Enabled: true } m
            ? AudioRecorder.Microphone(Path.Combine(options.OutDir, "mic.wav"), m.DeviceId)
            : null;
        var system = options.SystemAudio ? AudioRecorder.SystemAudio(Path.Combine(options.OutDir, "system.wav")) : null;
        var input = new InputRecorder(Path.Combine(options.OutDir, "input.jsonl"),
            Path.Combine(options.OutDir, "cursors"), options.RecordKeys, hwnd);

        mic?.Start();
        system?.Start();
        await screen.StartAsync();
        return new RecordingSession(options, source, screen, mic, system, input);
    }

    private static (Windows.Graphics.Capture.GraphicsCaptureItem, SourceInfo, IntPtr) ResolveSource(SourceSpec spec)
    {
        if (spec.Kind == "window")
        {
            var hwnd = new IntPtr(long.Parse(spec.WindowId ?? throw new ArgumentException("windowId required")));
            DesktopTools.FocusWindow(hwnd);
            var bounds = Bounds.From(Native.Win32.GetWindowBounds(hwnd));
            var display = Sources.Displays().FirstOrDefault(d => Contains(d.Bounds, bounds)) ?? Sources.Displays()[0];
            return (Direct3D.CreateItemForWindow(hwnd),
                new SourceInfo("window", bounds, display.Scale, null, Native.Win32.GetTitle(hwnd)), hwnd);
        }

        var target = Sources.DisplayById(spec.DisplayId ?? throw new ArgumentException("displayId required"));
        var crop = spec.Kind == "area" ? spec.Crop : null;
        return (Direct3D.CreateItemForMonitor(new IntPtr(long.Parse(target.Id))),
            new SourceInfo(spec.Kind, target.Bounds, target.Scale, crop, target.Name), IntPtr.Zero);
    }

    private static bool Contains(Bounds outer, Bounds inner)
    {
        var cx = inner.X + inner.W / 2;
        var cy = inner.Y + inner.H / 2;
        return cx >= outer.X && cx < outer.X + outer.W && cy >= outer.Y && cy < outer.Y + outer.H;
    }

    private static double NowMs => Clock.TicksToMs(Clock.Now);

    public void Pause() => _pausedAt ??= NowMs;

    public void Resume()
    {
        if (_pausedAt is not { } start) return;
        _pauses.Add(new PauseRange(start, NowMs));
        _pausedAt = null;
    }

    public async Task<RecordingManifest> StopAsync()
    {
        var stoppedMs = NowMs;
        if (_pausedAt is not null) Resume();
        await _screen.StopAsync();
        var mic = _mic?.Stop();
        var system = _system?.Stop();
        _input.Dispose();

        var manifest = new RecordingManifest(
            Version: 1,
            CreatedAt: _createdAt,
            Source: _source,
            Video: new VideoTrackInfo("screen.mp4", _screen.Width, _screen.Height, _options.Fps, Clock.TicksToMs(_screen.FirstFrameTicks)),
            Microphone: mic,
            SystemAudio: system,
            InputFile: "input.jsonl",
            CustomCursors: _input.CustomCursors,
            Pauses: _pauses,
            StoppedMs: stoppedMs);

        await File.WriteAllTextAsync(Path.Combine(_options.OutDir, ManifestFile),
            JsonSerializer.Serialize(manifest, Json.Options));
        return manifest;
    }

    public async ValueTask DisposeAsync()
    {
        await _screen.DisposeAsync();
        _input.Dispose();
        _mic?.Dispose();
        _system?.Dispose();
    }
}
