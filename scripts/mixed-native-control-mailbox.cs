using System;
using System.Collections.Generic;
using System.Text;

// Memory-only framing and bounded queues. Schema/context/sequence validation is external.
public sealed class MixedNativeControlMailbox
{
    private const long Safe = 9007199254740991L;
    private readonly object gate = new object();
    private readonly int maxFrameBytes;
    private readonly long maxTotalBytes;
    private readonly long maxFrames;
    private readonly int maxQueuedFrames;
    private readonly long maxQueuedBytes;
    private byte[] partial = new byte[0];
    private int pending;
    private readonly Queue<string> inputs = new Queue<string>();
    private readonly Queue<byte[]> outputs = new Queue<byte[]>();
    private bool failed;
    private bool inputClosed;
    private long inputBytes, outputBytes, inputFrames, outputFrames;
    private long queuedInputBytes, queuedOutputBytes;

    public sealed class State
    {
        public readonly bool failed, inputClosed;
        public readonly long pendingInputBytes, queuedInputFrames, queuedOutputFrames, queuedInputBytes, queuedOutputBytes;
        internal State(bool failed, bool inputClosed, long pending, long inputFrames, long outputFrames, long inputBytes, long outputBytes)
        {
            this.failed = failed; this.inputClosed = inputClosed;
            this.pendingInputBytes = pending; this.queuedInputFrames = inputFrames; this.queuedOutputFrames = outputFrames;
            this.queuedInputBytes = inputBytes; this.queuedOutputBytes = outputBytes;
        }
    }
    public MixedNativeControlMailbox(int maxFrameBytes, long maxTotalBytes, long maxFrames, int maxQueuedFrames, long maxQueuedBytes)
    {
        if (maxFrameBytes <= 0 || maxTotalBytes <= 0 || maxTotalBytes > Safe || maxFrames <= 0 || maxFrames > Safe || maxQueuedFrames <= 0 || maxQueuedBytes <= 0 || maxQueuedBytes > Safe)
            throw Invalid();
        this.maxFrameBytes = maxFrameBytes; this.maxTotalBytes = maxTotalBytes; this.maxFrames = maxFrames;
        this.maxQueuedFrames = maxQueuedFrames; this.maxQueuedBytes = maxQueuedBytes;
    }
    private static Exception Invalid() { return new InvalidOperationException("INVALID_MIXED_NATIVE_CONTROL_MAILBOX"); }
    private void Stop()
    {
        failed = true; partial = new byte[0]; pending = 0; inputs.Clear(); outputs.Clear(); queuedInputBytes = 0; queuedOutputBytes = 0;
    }
    private void Require(bool condition)
    {
        if (!condition) { Stop(); throw Invalid(); }
    }
    private void Append(byte b)
    {
        if (pending == partial.Length)
        {
            int capacity = partial.Length == 0 ? Math.Min(32, maxFrameBytes) : partial.Length > maxFrameBytes / 2 ? maxFrameBytes : partial.Length * 2;
            Array.Resize(ref partial, capacity);
        }
        partial[pending++] = b;
    }
    private static bool Ascii(byte b) { return b == 9 || (b >= 32 && b <= 126); }
    public void Feed(byte[] bytes, int offset, int count)
    {
        lock (gate)
        {
            Require(!failed && !inputClosed && bytes != null);
            Require(offset >= 0 && count >= 0 && offset <= bytes.Length && count <= bytes.Length - offset);
            Require(count <= maxTotalBytes - inputBytes);
            inputBytes += count;
            for (int i = offset; i < offset + count; i++)
            {
                byte b = bytes[i];
                Require((b == 10 || Ascii(b)) && pending < maxFrameBytes);
                if (b == 10)
                {
                    int length = pending + 1;
                    Require(inputFrames < maxFrames && inputs.Count < maxQueuedFrames && length <= maxQueuedBytes - queuedInputBytes);
                    Append(b);
                    string line = Encoding.ASCII.GetString(partial, 0, pending);
                    pending = 0; inputs.Enqueue(line); inputFrames++; queuedInputBytes += length;
                }
                else Append(b);
            }
        }
    }
    public void CloseInput()
    {
        lock (gate)
        {
            Require(!failed); inputClosed = true; Require(pending == 0);
        }
    }
    public bool TryTakeInput(out string line)
    {
        lock (gate)
        {
            line = null;
            if (failed || inputs.Count == 0) return false;
            line = inputs.Dequeue(); queuedInputBytes -= line.Length; return true;
        }
    }
    public void QueueOutput(string line)
    {
        lock (gate)
        {
            Require(!failed && line != null);
            Require(line.Length > 0 && line.Length <= maxFrameBytes && line[line.Length - 1] == '\n');
            for (int i = 0; i < line.Length - 1; i++) Require(line[i] <= 126 && Ascii((byte)line[i]));
            Require(line.Length <= maxTotalBytes - outputBytes && outputFrames < maxFrames && outputs.Count < maxQueuedFrames && line.Length <= maxQueuedBytes - queuedOutputBytes);
            byte[] bytes = Encoding.ASCII.GetBytes(line);
            outputs.Enqueue(bytes); outputBytes += bytes.Length; outputFrames++; queuedOutputBytes += bytes.Length;
        }
    }
    public bool TryTakeOutput(out byte[] bytes)
    {
        lock (gate)
        {
            bytes = null;
            if (failed || outputs.Count == 0) return false;
            // Ownership transfers once. The caller may retain at most one in-flight frame.
            bytes = outputs.Dequeue(); queuedOutputBytes -= bytes.Length; return true;
        }
    }
    public void Fail() { lock (gate) { Stop(); } }
    public State Snapshot()
    {
        lock (gate)
        {
            return new State(failed, inputClosed, pending, inputs.Count, outputs.Count, queuedInputBytes, queuedOutputBytes);
        }
    }
}