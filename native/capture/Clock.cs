using System.Diagnostics;

namespace ZoomPane.Capture;

/// <summary>
/// One clock for every stream: QueryPerformanceCounter in 100 ns ticks. This is the same
/// time base as <c>Direct3D11CaptureFrame.SystemRelativeTime</c>, so video frames, input
/// events and audio buffers can be aligned exactly.
/// </summary>
internal static class Clock
{
    public static long Now => (long)(Stopwatch.GetTimestamp() * (10_000_000.0 / Stopwatch.Frequency));

    public static double TicksToMs(long ticks) => ticks / 10_000.0;
}
