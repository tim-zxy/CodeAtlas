package sample.nested;

public class Outer {
    /* 雪 */ int count;

    public Outer() {}

    public void run(int value) {}
    public void run(String value) {}

    @Deprecated
    public interface Inner {
        void execute();
    }

    static class Nested {
        int nested;
    }
}
