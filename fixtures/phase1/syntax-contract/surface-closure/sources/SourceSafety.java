package sourceproof;

class SourceSafety {
    void unsupported(Object value, Object[] values) {
        Object anonymous = new Object() { void hidden() { } };
        values[0] = value;
        stream().forEach(change -> { handle(change); });
    }
    Object stream() { return null; }
    private void handle(Object value) { }
}
