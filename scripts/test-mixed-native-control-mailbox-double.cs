using System;
using System.Text;
using System.Threading;

public static class MixedNativeControlMailboxDouble
{
    private static int passed;
    private static void Check(bool value, string name)
    {
        if (!value) throw new Exception("MAILBOX_ASSERTION_FAILED:" + name);
        Interlocked.Increment(ref passed);
    }
    private static void Refuses(Action action)
    {
        try { action(); }
        catch (Exception e) { Check(e.Message == "INVALID_MIXED_NATIVE_CONTROL_MAILBOX", "generic refusal"); return; }
        throw new Exception("MAILBOX_EXPECTED_REFUSAL");
    }
    private static MixedNativeControlMailbox NewBox() { return new MixedNativeControlMailbox(32, 4096, 100, 8, 128); }
    private static void Feed(MixedNativeControlMailbox m, string text)
    {
        byte[] b = Encoding.ASCII.GetBytes(text); m.Feed(b, 0, b.Length);
    }
    private static void EmptyFailure(MixedNativeControlMailbox m)
    {
        var s = m.Snapshot(); string line; byte[] bytes;
        Check(s.failed && s.pendingInputBytes == 0 && s.queuedInputFrames == 0 && s.queuedOutputFrames == 0 && s.queuedInputBytes == 0 && s.queuedOutputBytes == 0, "failure clears all retained data");
        Check(!m.TryTakeInput(out line) && line == null, "failed input empty");
        Check(!m.TryTakeOutput(out bytes) && bytes == null, "failed output empty");
    }
    public static int Run()
    {
        passed = 0;
        Refuses(() => new MixedNativeControlMailbox(0, 1, 1, 1, 1));
        Refuses(() => new MixedNativeControlMailbox(1, 0, 1, 1, 1));
        Refuses(() => new MixedNativeControlMailbox(1, 1, 0, 1, 1));
        Refuses(() => new MixedNativeControlMailbox(1, 1, 1, 0, 1));
        Refuses(() => new MixedNativeControlMailbox(1, 1, 1, 1, 0));
        Refuses(() => new MixedNativeControlMailbox(1, 9007199254740992L, 1, 1, 1));
        Refuses(() => new MixedNativeControlMailbox(1, 1, 9007199254740992L, 1, 1));
        Refuses(() => new MixedNativeControlMailbox(1, 1, 1, 1, 9007199254740992L));
        var m = NewBox(); string line; byte[] output;
        Check(!m.TryTakeInput(out line) && line == null, "empty input");
        Check(!m.TryTakeOutput(out output) && output == null, "empty output");
        Feed(m, "a\t"); var before = m.Snapshot();
        Check(before.pendingInputBytes == 2 && before.queuedInputFrames == 0, "fragment retained");
        Feed(m, "b\nc\n");
        Check(m.TryTakeInput(out line) && line == "a\tb\n", "fragment frame");
        Check(m.TryTakeInput(out line) && line == "c\n", "coalesced frame");
        Check(before.pendingInputBytes == 2 && before.queuedInputFrames == 0, "snapshot detached");
        Check(m.Snapshot().queuedInputBytes == 0, "input drained bytes");
        byte[] alias = Encoding.ASCII.GetBytes("xx\n"); m.Feed(alias, 0, alias.Length); alias[0] = 122;
        Check(m.TryTakeInput(out line) && line == "xx\n", "feed input detached");
        byte[] sliced = Encoding.ASCII.GetBytes("!slice\n?"); m.Feed(sliced, 1, 6);
        Check(m.TryTakeInput(out line) && line == "slice\n", "offset count respected");
        m.QueueOutput("one\n"); m.QueueOutput("two\n");
        Check(m.TryTakeOutput(out output) && Encoding.ASCII.GetString(output) == "one\n", "output first"); output[0] = 0;
        Check(m.TryTakeOutput(out output) && Encoding.ASCII.GetString(output) == "two\n", "output exclusive detached");
        Feed(m, "last\n"); m.CloseInput(); m.CloseInput();
        Check(m.Snapshot().inputClosed && m.TryTakeInput(out line) && line == "last\n", "EOF can drain");
        m.QueueOutput("after-eof\n"); Check(m.TryTakeOutput(out output), "EOF does not close output");
        Refuses(() => m.Feed(new byte[0], 0, 0)); EmptyFailure(m); m.Fail(); EmptyFailure(m);
        m = NewBox(); Feed(m, "queued\npartial"); m.QueueOutput("queued\n"); Refuses(() => m.CloseInput()); EmptyFailure(m);
        foreach (byte bad in new byte[] { 0, 10 + 3, 31, 127, 128, 239 })
        {
            m = NewBox(); Feed(m, "old\n"); m.QueueOutput("old\n");
            var current = m; Refuses(() => current.Feed(new byte[] { bad }, 0, 1)); EmptyFailure(m);
        }
        foreach (string bad in new string[] { "", "no-lf", "two\nlines\n", "cr\r\n", "\uFEFFx\n", "\u00E9\n", "\0\n" })
        {
            m = NewBox(); var current = m; Refuses(() => current.QueueOutput(bad)); EmptyFailure(m);
        }
        m = NewBox(); Refuses(() => m.QueueOutput(null)); EmptyFailure(m);
        m = NewBox(); Refuses(() => m.Feed(null, 0, 0)); EmptyFailure(m);
        m = NewBox(); Refuses(() => m.Feed(new byte[2], -1, 1)); EmptyFailure(m);
        m = NewBox(); Refuses(() => m.Feed(new byte[2], 1, 2)); EmptyFailure(m);
        m = new MixedNativeControlMailbox(3, 100, 10, 10, 100); Feed(m, "ab\n");
        Check(m.TryTakeInput(out line) && line == "ab\n", "exact frame cap");
        Feed(m, "abc"); Refuses(() => Feed(m, "\n")); EmptyFailure(m);
        m = new MixedNativeControlMailbox(3, 100, 10, 10, 100); Refuses(() => m.QueueOutput("abc\n")); EmptyFailure(m);
        m = new MixedNativeControlMailbox(8, 4, 10, 10, 100); Feed(m, "a\n"); Check(m.TryTakeInput(out line), "input charge survives drain"); Feed(m, "b\n");
        Refuses(() => Feed(m, "c\n")); EmptyFailure(m);
        m = new MixedNativeControlMailbox(8, 4, 10, 10, 100); m.QueueOutput("a\n"); Check(m.TryTakeOutput(out output), "output charge survives drain"); m.QueueOutput("b\n");
        Refuses(() => m.QueueOutput("c\n")); EmptyFailure(m);
        m = new MixedNativeControlMailbox(8, 100, 1, 10, 100); Feed(m, "a\n"); m.TryTakeInput(out line); Refuses(() => Feed(m, "b\n")); EmptyFailure(m);
        m = new MixedNativeControlMailbox(8, 100, 1, 10, 100); m.QueueOutput("a\n"); m.TryTakeOutput(out output); Refuses(() => m.QueueOutput("b\n")); EmptyFailure(m);
        m = new MixedNativeControlMailbox(8, 2, 1, 1, 2); Feed(m, "a\n"); m.QueueOutput("b\n");
        Check(m.Snapshot().queuedInputBytes == 2 && m.Snapshot().queuedOutputBytes == 2, "directions independently capped");
        m = new MixedNativeControlMailbox(8, 100, 100, 1, 100); Feed(m, "a\n"); Refuses(() => Feed(m, "b\n")); EmptyFailure(m);
        m = new MixedNativeControlMailbox(8, 100, 100, 1, 100); m.QueueOutput("a\n"); Refuses(() => m.QueueOutput("b\n")); EmptyFailure(m);
        m = new MixedNativeControlMailbox(8, 100, 100, 10, 3); Feed(m, "a\n"); Refuses(() => Feed(m, "b\n")); EmptyFailure(m);
        m = new MixedNativeControlMailbox(8, 100, 100, 10, 3); m.QueueOutput("a\n"); Refuses(() => m.QueueOutput("b\n")); EmptyFailure(m);
        m = NewBox(); Feed(m, "q\np"); m.QueueOutput("q\n"); m.Fail(); EmptyFailure(m);
        Refuses(() => m.QueueOutput("x\n")); Refuses(() => m.CloseInput());
        var concurrent = new MixedNativeControlMailbox(8, 10000, 1000, 1000, 10000);
        Exception threadFailure = null;
        Thread[] threads = new Thread[4];
        for (int i = 0; i < threads.Length; i++)
        {
            threads[i] = new Thread(() => { try { for (int j = 0; j < 50; j++) { Feed(concurrent, "i\n"); concurrent.QueueOutput("o\n"); concurrent.Snapshot(); } } catch (Exception e) { Interlocked.CompareExchange(ref threadFailure, e, null); } });
            threads[i].Start();
        }
        foreach (Thread thread in threads) thread.Join();
        Check(threadFailure == null, "concurrent operations no failure");
        Check(concurrent.Snapshot().queuedInputFrames == 200 && concurrent.Snapshot().queuedOutputFrames == 200, "concurrent frame totals");
        int count = 0; while (concurrent.TryTakeInput(out line)) { Check(line == "i\n", "concurrent input intact"); count++; }
        Check(count == 200, "concurrent input no loss");
        count = 0; while (concurrent.TryTakeOutput(out output)) { Check(Encoding.ASCII.GetString(output) == "o\n", "concurrent output intact"); count++; }
        Check(count == 200 && concurrent.Snapshot().queuedInputBytes == 0 && concurrent.Snapshot().queuedOutputBytes == 0, "concurrent drained totals");
        foreach (var field in typeof(MixedNativeControlMailbox.State).GetFields()) Check(field.IsInitOnly, "snapshot field readonly");
        var racing = NewBox();
        Exception unexpected = null;
        Thread producer = new Thread(() => {
            try { for (int i = 0; i < 100; i++) { Feed(racing, "x\n"); racing.QueueOutput("y\n"); } }
            catch (Exception e) { if (e.Message != "INVALID_MIXED_NATIVE_CONTROL_MAILBOX") unexpected = e; }
        });
        producer.Start(); racing.Fail(); producer.Join();
        Check(unexpected == null, "concurrent fail generic only"); EmptyFailure(racing);
        return passed;
    }
}