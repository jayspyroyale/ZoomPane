using System.Text.Json;
using System.Text.Json.Nodes;
using ZoomPane.Capture.Audio;
using ZoomPane.Capture.Desktop;
using ZoomPane.Capture.Recording;

namespace ZoomPane.Capture;

/// <summary>
/// Sidecar entry point. Protocol: one JSON object per line on stdin,
/// <c>{"id":1,"cmd":"start",...}</c>. Each request gets exactly one reply on stdout,
/// <c>{"id":1,"ok":true,"result":...}</c> or <c>{"id":1,"ok":false,"error":"..."}</c>.
/// Diagnostics go to stderr.
/// </summary>
internal static class Program
{
    private const string Version = "1.0.0";
    private static readonly object OutputLock = new();
    private static RecordingSession? _session;

    private static async Task<int> Main()
    {
        string? line;
        while ((line = await Console.In.ReadLineAsync()) is not null)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            JsonNode? id = null;
            try
            {
                var request = JsonNode.Parse(line)!.AsObject();
                id = request["id"]?.DeepClone();
                var result = await HandleAsync(request["cmd"]!.GetValue<string>(), request);
                Reply(new JsonObject { ["id"] = id, ["ok"] = true, ["result"] = result });
            }
            catch (Exception e)
            {
                Console.Error.WriteLine(e);
                Reply(new JsonObject { ["id"] = id, ["ok"] = false, ["error"] = e.Message });
            }
        }

        // stdin closed: the app exited. Finish any recording so the files stay playable.
        if (_session is not null)
        {
            await _session.StopAsync();
            await _session.DisposeAsync();
        }
        return 0;
    }

    private static async Task<JsonNode?> HandleAsync(string cmd, JsonObject request)
    {
        switch (cmd)
        {
            case "ping":
                return new JsonObject { ["version"] = Version };

            case "clock":
                return new JsonObject { ["ms"] = Clock.TicksToMs(Clock.Now) };

            case "listSources":
                return ToNode(new { displays = Sources.Displays(), windows = Sources.Windows() });

            case "listMicrophones":
                return ToNode(AudioRecorder.ListInputs());

            case "start":
                if (_session is not null) throw new InvalidOperationException("A recording is already in progress");
                var options = request.Deserialize<StartOptions>(Json.Options)
                    ?? throw new ArgumentException("Invalid start options");
                _session = await RecordingSession.StartAsync(options);
                return new JsonObject { ["startedMs"] = Clock.TicksToMs(Clock.Now) };

            case "pause":
                RequireSession().Pause();
                return null;

            case "resume":
                RequireSession().Resume();
                return null;

            case "stop":
            {
                var session = RequireSession();
                _session = null;
                try { return ToNode(await session.StopAsync()); }
                finally { await session.DisposeAsync(); }
            }

            case "setDesktopIconsHidden":
                return DesktopTools.SetDesktopIconsHidden(request["hidden"]!.GetValue<bool>());

            case "focusWindow":
                DesktopTools.FocusWindow(Handle(request["windowId"]));
                return null;

            case "resizeWindow":
                DesktopTools.ResizeWindow(Handle(request["windowId"]),
                    request["width"]!.GetValue<int>(), request["height"]!.GetValue<int>());
                return null;

            case "copyFiles":
                DesktopTools.CopyFilesToClipboard(request["paths"]!.AsArray().Select(p => p!.GetValue<string>()));
                return null;

            default:
                throw new ArgumentException($"Unknown command '{cmd}'");
        }
    }

    private static RecordingSession RequireSession() =>
        _session ?? throw new InvalidOperationException("No recording in progress");

    private static IntPtr Handle(JsonNode? node) => new(long.Parse(node!.GetValue<string>()));

    private static JsonNode? ToNode<T>(T value) => JsonSerializer.SerializeToNode(value, Json.Options);

    private static void Reply(JsonObject message)
    {
        var text = message.ToJsonString();
        lock (OutputLock)
        {
            Console.Out.WriteLine(text);
            Console.Out.Flush();
        }
    }
}
