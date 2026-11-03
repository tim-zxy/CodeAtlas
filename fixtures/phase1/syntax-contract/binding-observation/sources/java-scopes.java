class Scopes {
    Object field = build();
    void run() { Object local = build(); Runnable work = () -> build(); }
    Object build() { return null; }
}
