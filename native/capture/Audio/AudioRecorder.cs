using NAudio.CoreAudioApi;
using NAudio.Wave;

// NAudio 3 marks the classic WASAPI classes obsolete in favour of its new builder API. They are still
// supported and well proven for event-driven capture plus loopback; migrate when the builder API settles.
#pragma warning disable CS0618

namespace ZoomPane.Capture.Audio;

internal sealed record AudioTrackInfo(string File, double StartMs, int SampleRate, int Channels, string Device);

internal sealed record AudioDevice(string Id, string Name, bool IsDefault);

/// <summary>
/// Records one WASAPI endpoint (microphone, or loopback of an output device) to a WAV file and
/// notes the QPC time of the first sample. WASAPI loopback delivers no packets while nothing is
/// playing, so a silent stream keeps the device active and the track continuous.
/// </summary>
internal sealed class AudioRecorder : IDisposable
{
    private readonly IWaveIn _capture;
    private readonly WaveFileWriter _writer;
    private readonly WasapiOut? _keepAlive;
    private readonly string _file;
    private readonly string _deviceName;
    private double _startMs = -1;

    private AudioRecorder(IWaveIn capture, string path, string deviceName, WasapiOut? keepAlive)
    {
        _capture = capture;
        _file = Path.GetFileName(path);
        _deviceName = deviceName;
        _keepAlive = keepAlive;
        _writer = new WaveFileWriter(path, capture.WaveFormat);
        _capture.DataAvailable += OnData;
    }

    public static AudioRecorder Microphone(string path, string? deviceId)
    {
        using var enumerator = new MMDeviceEnumerator();
        var device = string.IsNullOrEmpty(deviceId)
            ? enumerator.GetDefaultAudioEndpoint(DataFlow.Capture, Role.Communications)
            : enumerator.GetDevice(deviceId);
        return new AudioRecorder(new WasapiCapture(device, true, 20), path, device.FriendlyName, null);
    }

    public static AudioRecorder SystemAudio(string path)
    {
        using var enumerator = new MMDeviceEnumerator();
        var device = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
        var capture = new WasapiLoopbackCapture(device);
        var keepAlive = new WasapiOut(device, AudioClientShareMode.Shared, true, 50);
        keepAlive.Init(new SilenceProvider(capture.WaveFormat));
        return new AudioRecorder(capture, path, device.FriendlyName, keepAlive);
    }

    public static IReadOnlyList<AudioDevice> ListInputs()
    {
        using var enumerator = new MMDeviceEnumerator();
        string? defaultId = null;
        try { defaultId = enumerator.GetDefaultAudioEndpoint(DataFlow.Capture, Role.Communications).ID; }
        catch { /* no input device */ }
        return enumerator.EnumerateAudioEndPoints(DataFlow.Capture, DeviceState.Active)
            .Select(d => new AudioDevice(d.ID, d.FriendlyName, d.ID == defaultId))
            .ToList();
    }

    public void Start()
    {
        _keepAlive?.Play();
        _capture.StartRecording();
    }

    private void OnData(object? sender, WaveInEventArgs e)
    {
        if (e.BytesRecorded == 0) return;
        if (_startMs < 0)
        {
            // The buffer ends "now"; its first sample was captured one buffer-duration earlier.
            var bufferMs = e.BytesRecorded * 1000.0 / _capture.WaveFormat.AverageBytesPerSecond;
            _startMs = Clock.TicksToMs(Clock.Now) - bufferMs;
        }
        _writer.Write(e.Buffer, 0, e.BytesRecorded);
    }

    public AudioTrackInfo Stop()
    {
        var stopped = new ManualResetEventSlim(false); // not disposed: the event may fire after the timeout
        _capture.RecordingStopped += (_, _) => stopped.Set();
        _capture.StopRecording();
        stopped.Wait(TimeSpan.FromSeconds(2)); // the capture thread may still flush a final buffer
        _keepAlive?.Stop();
        _writer.Flush();
        return new AudioTrackInfo(_file, _startMs, _capture.WaveFormat.SampleRate, _capture.WaveFormat.Channels, _deviceName);
    }

    public void Dispose()
    {
        _capture.DataAvailable -= OnData;
        _capture.Dispose();
        _keepAlive?.Dispose();
        _writer.Dispose();
    }
}
